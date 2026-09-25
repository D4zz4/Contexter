package app.contexter.local;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;
import com.chaquo.python.PyObject;
import com.chaquo.python.Python;

import dev.ffmpegkit_maintained.ytdlp.YtDlp;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "LocalYouTubeSubtitles")
public class YtDlpPlugin extends Plugin {
    private static final int MAX_SUBTITLE_BYTES = 5 * 1024 * 1024;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private boolean initialized = false;

    @Override
    public void load() {
        super.load();
        File[] leftovers = getContext().getCacheDir().listFiles(file -> file.isDirectory() && file.getName().startsWith("subtitles-"));
        if (leftovers != null) for (File directory : leftovers) {
            File[] files = directory.listFiles();
            if (files != null) for (File file : files) file.delete();
            directory.delete();
        }
    }

    @PluginMethod
    public void loadSubtitles(PluginCall call) {
        String videoId = call.getString("videoId");
        String requestedLanguage = call.getString("language", "original");
        String cookies = call.getString("cookies", "");
        if (videoId == null || !videoId.matches("[A-Za-z0-9_-]{11}")) {
            call.reject("Ungültige YouTube-Video-ID.");
            return;
        }
        if (!"original".equals(requestedLanguage) && !"de".equals(requestedLanguage) && !"en".equals(requestedLanguage)) {
            call.reject("Bitte Originalsprache, Deutsch oder Englisch als Untertitelsprache wählen.");
            return;
        }
        if (cookies.length() > 1024 * 1024 || (!cookies.isEmpty() && !cookies.startsWith("# Netscape HTTP Cookie File"))) {
            call.reject("Ungültige oder zu große YouTube-Cookie-Datei.");
            return;
        }
        worker.execute(() -> {
            File directory = new File(getContext().getCacheDir(), "subtitles-" + UUID.randomUUID());
            try {
                if (!directory.mkdirs()) throw new IllegalStateException("Temporärer Ordner konnte nicht erstellt werden.");
                File cookieFile = null;
                if (!cookies.isEmpty()) {
                    cookieFile = new File(directory, "youtube-cookies.txt");
                    Files.write(cookieFile.toPath(), cookies.getBytes(StandardCharsets.UTF_8));
                    cookieFile.setReadable(false, false);
                    cookieFile.setReadable(true, true);
                    cookieFile.setWritable(false, false);
                    cookieFile.setWritable(true, true);
                }
                synchronized (YtDlpPlugin.class) {
                    if (!initialized) {
                        YtDlp.init(getContext().getApplicationContext());
                        initialized = true;
                    }
                }
                Python python = Python.getInstance();
                PyObject builtins = python.getBuiltins();
                PyObject options = builtins.callAttr("dict");
                if (cookieFile != null) options.asMap().put(PyObject.fromJava("cookiefile"), PyObject.fromJava(cookieFile.getAbsolutePath()));
                options.asMap().put(PyObject.fromJava("outtmpl"), PyObject.fromJava(new File(directory, "%(id)s.%(ext)s").getAbsolutePath()));
                options.asMap().put(PyObject.fromJava("skip_download"), PyObject.fromJava(true));
                options.asMap().put(PyObject.fromJava("writesubtitles"), PyObject.fromJava(true));
                options.asMap().put(PyObject.fromJava("writeautomaticsub"), PyObject.fromJava(true));
                options.asMap().put(PyObject.fromJava("subtitlesformat"), PyObject.fromJava("vtt"));
                options.asMap().put(PyObject.fromJava("noplaylist"), PyObject.fromJava(true));
                options.asMap().put(PyObject.fromJava("quiet"), PyObject.fromJava(true));
                String language = requestedLanguage;
                if ("original".equals(language)) {
                    PyObject probe = python.getModule("yt_dlp").callAttr("YoutubeDL", options);
                    try {
                        PyObject info = probe.callAttr("extract_info", "https://www.youtube.com/watch?v=" + videoId, false);
                        language = findOriginalLanguage(info);
                    } finally {
                        probe.callAttr("close");
                    }
                    if (language == null) throw new IllegalStateException("Die Originalsprache der Untertitel konnte nicht sicher erkannt werden. Bitte Deutsch oder Englisch manuell wählen.");
                }
                PyObject languages = builtins.callAttr("list");
                languages.asList().add(PyObject.fromJava(language));
                options.asMap().put(PyObject.fromJava("subtitleslangs"), languages);
                PyObject downloader = python.getModule("yt_dlp").callAttr("YoutubeDL", options);
                String title = "YouTube-Video " + videoId;
                String author = "";
                try {
                    PyObject info = downloader.callAttr("extract_info", "https://www.youtube.com/watch?v=" + videoId, true);
                    if (info != null) {
                        PyObject extractedTitle = info.asMap().get(PyObject.fromJava("title"));
                        PyObject uploader = info.asMap().get(PyObject.fromJava("uploader"));
                        if (extractedTitle != null && !extractedTitle.toString().trim().isEmpty()) title = extractedTitle.toString();
                        if (uploader != null) author = uploader.toString();
                    }
                } finally {
                    downloader.callAttr("close");
                }
                File[] files = directory.listFiles(file -> file.isFile() && file.getName().endsWith(".vtt"));
                if (files == null || files.length == 0) throw new IllegalStateException("Für dieses Video wurden keine Untertitel in der gewählten Sprache gefunden.");
                Arrays.sort(files, Comparator.comparing(File::getName));
                File file = files[0];
                if (file.length() > MAX_SUBTITLE_BYTES) throw new IllegalStateException("Untertiteldatei ist größer als 5 MiB.");
                String contents = new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
                JSObject result = new JSObject();
                result.put("contents", contents);
                result.put("language", language.replaceFirst("-orig$", ""));
                result.put("title", title);
                result.put("author", author);
                call.resolve(result);
            } catch (Exception error) {
                call.reject(error.getMessage() == null ? "Untertitel konnten nicht geladen werden." : error.getMessage());
            } finally {
                File[] files = directory.listFiles();
                if (files != null) for (File file : files) file.delete();
                directory.delete();
            }
        });
    }

    private static PyObject field(PyObject object, String name) {
        return object == null ? null : object.asMap().get(PyObject.fromJava(name));
    }

    private static String findOriginalLanguage(PyObject info) {
        PyObject automatic = field(info, "automatic_captions");
        if (automatic != null) {
            for (PyObject key : automatic.asMap().keySet()) {
                String value = key.toString();
                if (value.matches("[A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*-orig")) return value;
            }
        }
        PyObject manual = field(info, "subtitles");
        PyObject metadataLanguage = field(info, "language");
        if (metadataLanguage != null) {
            String value = metadataLanguage.toString();
            for (PyObject tracks : new PyObject[]{manual, automatic}) {
                if (tracks == null) continue;
                for (PyObject key : tracks.asMap().keySet()) {
                    String candidate = key.toString();
                    if (candidate.equals(value) || candidate.startsWith(value + "-")) return candidate;
                }
            }
        }
        if (manual != null && manual.asMap().size() == 1) {
            for (Map.Entry<PyObject, PyObject> entry : manual.asMap().entrySet()) {
                String value = entry.getKey().toString();
                if (value.matches("[A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*")) return value;
            }
        }
        return null;
    }

    @Override
    protected void handleOnDestroy() {
        worker.shutdownNow();
        super.handleOnDestroy();
    }
}
