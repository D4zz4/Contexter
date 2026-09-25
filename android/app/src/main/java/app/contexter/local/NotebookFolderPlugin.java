package app.contexter.local;

import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.provider.DocumentsContract;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "NotebookFolder")
public class NotebookFolderPlugin extends Plugin {
    private static final String PREFS = "notebook-folder";
    private static final String TREE_URI = "treeUri";
    private static final int MAX_FILE_BYTES = 8 * 1024 * 1024;
    private static final int MAX_TOTAL_BYTES = 100 * 1024 * 1024;

    @PluginMethod
    public void chooseFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "folderResult");
    }

    @ActivityCallback
    private void folderResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("Ordnerauswahl abgebrochen.");
            return;
        }
        Uri uri = result.getData().getData();
        int flags = result.getData().getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri, flags);
            preferences().edit().putString(TREE_URI, uri.toString()).apply();
            JSObject response = new JSObject();
            response.put("name", DocumentsContract.getTreeDocumentId(uri));
            call.resolve(response);
        } catch (Exception error) { call.reject("Dauerhafter Zugriff auf diesen Ordner wurde nicht erteilt.", error); }
    }

    @PluginMethod
    public void getFolder(PluginCall call) {
        String value = preferences().getString(TREE_URI, null);
        JSObject response = new JSObject();
        if (value != null) response.put("name", folderName(Uri.parse(value)));
        call.resolve(response);
    }

    @PluginMethod
    public void forgetFolder(PluginCall call) {
        String value = preferences().getString(TREE_URI, null);
        if (value != null) {
            try { getContext().getContentResolver().releasePersistableUriPermission(Uri.parse(value), Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION); }
            catch (Exception ignored) { }
        }
        preferences().edit().remove(TREE_URI).apply();
        call.resolve();
    }

    @PluginMethod
    public void listMarkdown(PluginCall call) {
        try {
            Uri tree = selectedTree();
            JSArray files = new JSArray();
            int[] total = {0};
            walk(tree, DocumentsContract.getTreeDocumentId(tree), "", files, total);
            JSObject response = new JSObject();
            response.put("files", files);
            call.resolve(response);
        } catch (Exception error) { call.reject("Notebook-Ordner konnte nicht gelesen werden: " + error.getMessage(), error); }
    }

    @PluginMethod
    public void writeMarkdown(PluginCall call) {
        try {
            Uri tree = selectedTree();
            JSArray files = call.getArray("files");
            if (files == null) throw new IllegalArgumentException("Dateiliste fehlt.");
            for (int i = 0; i < files.length(); i++) {
                JSONObject file = files.getJSONObject(i);
                String path = file.optString("path", "");
                String content = file.optString("content", "");
                if (content.getBytes(StandardCharsets.UTF_8).length > MAX_FILE_BYTES) throw new IllegalArgumentException("Datei ist größer als 8 MiB: " + path);
                Uri target = ensureFile(tree, path);
                try (OutputStream output = getContext().getContentResolver().openOutputStream(target, "wt")) {
                    if (output == null) throw new IllegalStateException("Datei kann nicht geschrieben werden: " + path);
                    output.write(content.getBytes(StandardCharsets.UTF_8));
                }
            }
            call.resolve();
        } catch (Exception error) { call.reject("Notebook-Ordner konnte nicht aktualisiert werden: " + error.getMessage(), error); }
    }

    private SharedPreferences preferences() { return getContext().getSharedPreferences(PREFS, 0); }

    private Uri selectedTree() {
        String value = preferences().getString(TREE_URI, null);
        if (value == null) throw new IllegalStateException("Noch kein Notebook-Ordner ausgewählt.");
        return Uri.parse(value);
    }

    private String folderName(Uri tree) {
        String id = DocumentsContract.getTreeDocumentId(tree);
        Uri document = DocumentsContract.buildDocumentUriUsingTree(tree, id);
        try (android.database.Cursor cursor = getContext().getContentResolver().query(document,
            new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) return cursor.getString(0);
        } catch (Exception ignored) { }
        return id;
    }

    private void walk(Uri tree, String parentId, String prefix, JSArray files, int[] total) throws Exception {
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parentId);
        try (android.database.Cursor cursor = getContext().getContentResolver().query(children,
            new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.COLUMN_SIZE}, null, null, null)) {
            if (cursor == null) return;
            while (cursor.moveToNext()) {
                String id = cursor.getString(0);
                String name = cursor.getString(1);
                String mime = cursor.getString(2);
                String relative = prefix.isEmpty() ? name : prefix + "/" + name;
                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) {
                    walk(tree, id, relative, files, total);
                } else if (name.toLowerCase(java.util.Locale.ROOT).endsWith(".md")) {
                    long size = cursor.isNull(3) ? -1 : cursor.getLong(3);
                    if (size > MAX_FILE_BYTES) continue;
                    Uri document = DocumentsContract.buildDocumentUriUsingTree(tree, id);
                    try (InputStream input = getContext().getContentResolver().openInputStream(document)) {
                        if (input == null) continue;
                        ByteArrayOutputStream output = new ByteArrayOutputStream();
                        byte[] buffer = new byte[16384];
                        int count;
                        while ((count = input.read(buffer)) != -1) {
                            total[0] += count;
                            if (count > MAX_FILE_BYTES || total[0] > MAX_TOTAL_BYTES) throw new IllegalStateException("Notebook-Ordner überschreitet das Lese-Limit von 100 MiB.");
                            output.write(buffer, 0, count);
                        }
                        JSObject item = new JSObject();
                        item.put("path", relative);
                        item.put("content", output.toString("UTF-8"));
                        files.put(item);
                    }
                }
            }
        }
    }

    private Uri ensureFile(Uri tree, String path) throws Exception {
        if (path.isEmpty() || path.startsWith("/") || path.contains("\\") || path.contains("..")) throw new IllegalArgumentException("Ungültiger Dateipfad.");
        String[] parts = path.split("/");
        String parentId = DocumentsContract.getTreeDocumentId(tree);
        for (int i = 0; i < parts.length; i++) {
            String name = parts[i];
            if (name.isEmpty()) throw new IllegalArgumentException("Ungültiger Dateipfad.");
            boolean directory = i < parts.length - 1;
            Uri existing = findChild(tree, parentId, name);
            if (existing != null) {
                if (directory) parentId = DocumentsContract.getDocumentId(existing);
                else return existing;
            } else {
                Uri parent = DocumentsContract.buildDocumentUriUsingTree(tree, parentId);
                Uri created = DocumentsContract.createDocument(getContext().getContentResolver(), parent,
                    directory ? DocumentsContract.Document.MIME_TYPE_DIR : "text/markdown", name);
                if (created == null) throw new IllegalStateException("Datei oder Ordner konnte nicht erstellt werden: " + name);
                if (directory) parentId = DocumentsContract.getDocumentId(created);
                else return created;
            }
        }
        throw new IllegalStateException("Datei konnte nicht angelegt werden.");
    }

    private Uri findChild(Uri tree, String parentId, String name) {
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parentId);
        try (android.database.Cursor cursor = getContext().getContentResolver().query(children,
            new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
            if (cursor == null) return null;
            while (cursor.moveToNext()) {
                if (name.equals(cursor.getString(1))) return DocumentsContract.buildDocumentUriUsingTree(tree, cursor.getString(0));
            }
        } catch (Exception ignored) { }
        return null;
    }
}
