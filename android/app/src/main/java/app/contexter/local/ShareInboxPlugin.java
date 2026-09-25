package app.contexter.local;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.lang.ref.WeakReference;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.UUID;

@CapacitorPlugin(name = "ShareInbox")
public class ShareInboxPlugin extends Plugin {
    private static final String PREFS = "share-inbox";
    private static final String KEY = "pending";
    private static final int MAX_BYTES = 25 * 1024 * 1024;
    private static WeakReference<ShareInboxPlugin> active = new WeakReference<>(null);

    @PluginMethod
    public void readClipboard(PluginCall call) {
        try {
            ClipboardManager manager = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
            ClipData clip = manager == null ? null : manager.getPrimaryClip();
            CharSequence value = clip == null || clip.getItemCount() == 0 ? null : clip.getItemAt(0).coerceToText(getContext());
            JSObject result = new JSObject();
            result.put("text", value == null ? "" : value.toString().substring(0, Math.min(value.length(), 20_000)));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Zwischenablage konnte nicht gelesen werden.");
        }
    }

    @Override
    public void load() {
        active = new WeakReference<>(this);
    }

    static void signal() {
        ShareInboxPlugin plugin = active.get();
        if (plugin != null) plugin.notifyListeners("pending", new JSObject());
    }

    static synchronized void capture(Activity activity, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return;

        try {
            JSONArray queue = readQueue(activity);
            File directory = new File(activity.getFilesDir(), "incoming");
            if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("Cannot create incoming directory");
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text != null && !text.trim().isEmpty()) {
                byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
                if (bytes.length > MAX_BYTES) throw new IllegalStateException("Shared text exceeds 25 MiB");
                String id = UUID.randomUUID().toString();
                try (FileOutputStream output = new FileOutputStream(new File(directory, id))) {
                    output.write(bytes);
                }
                JSONObject item = new JSONObject();
                item.put("id", id);
                item.put("kind", "text");
                queue.put(item);
                persistQueue(activity, queue);
            }

            ArrayList<Uri> streams = new ArrayList<>();
            if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
                ArrayList<Uri> items = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                if (items != null) streams.addAll(items);
            } else {
                Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (uri != null) streams.add(uri);
            }

            for (Uri uri : streams) {
                String id = UUID.randomUUID().toString();
                File target = new File(directory, id);
                try (InputStream input = activity.getContentResolver().openInputStream(uri);
                     FileOutputStream output = new FileOutputStream(target)) {
                    if (input == null) throw new IllegalStateException("Cannot open shared file");
                    byte[] buffer = new byte[64 * 1024];
                    int total = 0;
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        total += read;
                        if (total > MAX_BYTES) throw new IllegalStateException("Shared file exceeds 25 MiB");
                        output.write(buffer, 0, read);
                    }
                    output.flush();
                } catch (Exception error) {
                    target.delete();
                    throw error;
                }
                JSONObject item = new JSONObject();
                item.put("id", id);
                item.put("kind", "file");
                item.put("filename", queryName(activity, uri));
                item.put("mime", activity.getContentResolver().getType(uri));
                queue.put(item);
                persistQueue(activity, queue);
            }
        } catch (Exception error) {
            preferences(activity).edit().putString("lastError", error.getMessage()).commit();
        }
    }

    private static String queryName(Context context, Uri uri) {
        try (Cursor cursor = context.getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int column = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (column >= 0) return cursor.getString(column);
            }
        } catch (Exception ignored) { }
        return "geteilte-datei";
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONArray readQueue(Context context) throws JSONException {
        return new JSONArray(preferences(context).getString(KEY, "[]"));
    }

    private static void persistQueue(Context context, JSONArray queue) {
        if (!preferences(context).edit().putString(KEY, queue.toString()).commit()) {
            throw new IllegalStateException("Cannot save share queue");
        }
    }

    @PluginMethod
    public void getPending(PluginCall call) {
        try {
            JSONArray queue = readQueue(getContext());
            JSONArray summaries = new JSONArray();
            for (int i = 0; i < queue.length(); i++) {
                JSONObject item = queue.getJSONObject(i);
                JSONObject summary = new JSONObject();
                summary.put("id", item.getString("id"));
                summary.put("kind", item.getString("kind"));
                if (item.has("filename")) summary.put("filename", item.getString("filename"));
                summaries.put(summary);
            }
            JSObject result = new JSObject();
            result.put("items", summaries);
            String error = preferences(getContext()).getString("lastError", null);
            if (error != null) result.put("error", error);
            call.resolve(result);
        } catch (Exception error) { call.reject(error.getMessage()); }
    }

    @PluginMethod
    public void readItem(PluginCall call) {
        String id = call.getString("id");
        if (id == null || !id.matches("[0-9a-fA-F-]{36}")) { call.reject("Invalid item id"); return; }
        try {
            JSONArray queue = readQueue(getContext());
            JSONObject item = null;
            for (int i = 0; i < queue.length(); i++) {
                JSONObject candidate = queue.getJSONObject(i);
                if (id.equals(candidate.getString("id"))) { item = candidate; break; }
            }
            if (item == null) { call.reject("Share item not found"); return; }
            JSObject result = new JSObject();
            result.put("id", id);
            String kind = item.getString("kind");
            result.put("kind", kind);
            File file = new File(new File(getContext().getFilesDir(), "incoming"), id);
            if (!file.isFile() || file.length() > MAX_BYTES) { call.reject("Shared item unavailable"); return; }
            result.put("uri", Uri.fromFile(file).toString());
            if ("file".equals(kind)) {
                result.put("filename", item.optString("filename", "geteilte-datei"));
                result.put("mime", item.optString("mime", "application/octet-stream"));
            }
            call.resolve(result);
        } catch (Exception error) { call.reject(error.getMessage()); }
    }

    @PluginMethod
    public void ackItem(PluginCall call) {
        String id = call.getString("id");
        if (id == null) { call.reject("Missing item id"); return; }
        try {
            JSONArray queue = readQueue(getContext());
            JSONArray remaining = new JSONArray();
            boolean found = false;
            for (int i = 0; i < queue.length(); i++) {
                JSONObject item = queue.getJSONObject(i);
                if (id.equals(item.getString("id"))) found = true;
                else remaining.put(item);
            }
            if (!found) { call.reject("Share item not found"); return; }
            persistQueue(getContext(), remaining);
            new File(new File(getContext().getFilesDir(), "incoming"), id).delete();
            call.resolve();
        } catch (Exception error) { call.reject(error.getMessage()); }
    }

    @PluginMethod
    public void clearError(PluginCall call) {
        preferences(getContext()).edit().remove("lastError").apply();
        call.resolve();
    }
}
