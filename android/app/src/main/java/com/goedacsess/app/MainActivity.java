package com.goedacsess.app;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Android 15+ menggambar aplikasi sampai ke bawah status bar dan keyboard
        // (edge-to-edge, tidak bisa dimatikan di targetSdk 36). Beri jarak di sekeliling
        // WebView supaya kepala halaman tidak tertimpa jam/sinyal dan kolom isian
        // tidak tertutup keyboard.
        View webView = getBridge().getWebView();
        View wadah = (View) webView.getParent();
        wadah.setBackgroundColor(Color.parseColor("#0F6E56"));
        WindowCompat.getInsetsController(getWindow(), wadah).setAppearanceLightStatusBars(false);

        ViewCompat.setOnApplyWindowInsetsListener(wadah, (v, insets) -> {
            Insets bar = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            // Bawah: hanya keyboard. Garis navigasi gestur dibiarkan transparan di atas
            // isi, seperti di iPhone; tab bawah sudah berjarak 12px dari tepi.
            v.setPadding(bar.left, bar.top, bar.right, ime.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        if (wadah instanceof ViewGroup) ((ViewGroup) wadah).setClipToPadding(true);
        ViewCompat.requestApplyInsets(wadah);
    }
}
