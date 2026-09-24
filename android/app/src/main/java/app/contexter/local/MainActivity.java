package app.contexter.local;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShareInboxPlugin.class);
        registerPlugin(YtDlpPlugin.class);
        super.onCreate(savedInstanceState);
        ShareInboxPlugin.capture(this, getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        ShareInboxPlugin.capture(this, intent);
        ShareInboxPlugin.signal();
    }
}
