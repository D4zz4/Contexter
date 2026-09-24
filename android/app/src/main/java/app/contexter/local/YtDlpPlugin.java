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
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "LocalYouTubeSubtitles")
public class YtDlpPlugin extends Plugin {
    private static final int MAX_SUBTITLE_BYTES = 5 * 1024 * 1024;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private boolean initialized = false;

    @PluginMethod
    public void loadSubtitles(PluginCall call) {
        String videoId = call.getString("videoId");
        String language = call.getString("language", "de");
        if (videoId == null || !videoId.matches("[A-Za-z0-9_-]{11}")) {
            call.reject("Ungültige YouTube-Video-ID.");
            return;
        }
        if (!"de".equals(language) && !"en".equals(language)) {
            call.reject("Bitte Deutsch oder Englisch als Untertitelsprache wählen.");
            return;
        }
        worker.execute(() -> {
            File directory = new File(getContext().getCacheDir(), "subtitles-" + UUID.randomUUID());
            try {
                if (!directory.mkdirs()) throw new IllegalStateException("Temporärer Ordner konnte nicht erstellt werden.");
                synchronized (YtDlpPlugin.class) {
                    if (!initialized) {
                        YtDlp.init(getContext().getApplicationContext());
                        initialized = true;
                    }
                }
                Python python = Python.getInstance();
                PyObject builtins = python.getBuiltins();
                PyObject options = builtins.callAttr("dict");
                options.asMap().put(PyObject.fromJava("outtmpl"), PyObject.fromJava(new File(directory, "%(id)s.%(ext)s").getAbsolutePath()));
                options.asMap().put(PyObject.fromJava("skip_download"), PyObject.fromJava(true));
                options.asMap().put(PyObject.fromJava("writesubtitles"), PyObject.fromJava(true));
                options.asMap().put(PyObject.fromJava("writeautomaticsub"), PyObject.fromJava(true));
                options.asMap().put(PyObject.fromJava("subtitlesformat"), PyObject.fromJava("vtt"));
                options.asMap().put(PyObject.fromJava("noplaylist"), PyObject.fromJava(true));
                options.asMap().put(PyObject.fromJava("quiet"), PyObject.fromJava(true));
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
                result.put("language", language);
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

    @Override
    protected void handleOnDestroy() {
        worker.shutdownNow();
        super.handleOnDestroy();
    }
}
