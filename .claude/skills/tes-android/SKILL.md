---
name: tes-android
description: Nyalakan emulator Pixel 9 Pro (Android 16) dan uji build Android Goed Access sebelum diserahkan ke user. Wajib dipakai setiap kali membuat .aab/.apk Android, menaikkan versionCode, atau mengubah plugin Capacitor.
---

# Uji build Android di emulator

Aturan: **jangan serahkan .aab ke user sebelum semua langkah di bawah lolos.** 6.4.1 dan 6.4.2 sempat diunggah ke Play dalam keadaan crash karena langkah ini dilewati.

Mac ini M1 (arm64). Pakai AVD `Pixel_9_Pro_ARM` (image android-36 arm64-v8a). AVD `Pixel_9_Pro` lama x86_64 dan tidak bisa jalan (error HVF). Emulator x86 lama disimpan di `~/Library/Android/sdk/emulator-x86-backup`.

```bash
export PATH="$HOME/Library/Android/sdk/emulator:$HOME/Library/Android/sdk/platform-tools:$PATH"
SK="/Users/m/Documents/Goed Access/.claude/skills/tes-android"
```

## 1. Nyalakan emulator (di latar belakang)

```bash
adb devices | grep -q emulator || (nohup emulator -avd Pixel_9_Pro_ARM -no-snapshot -no-audio -no-boot-anim > /tmp/emu.log 2>&1 &)
until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 3; done
```

Jalankan perintah tunggu dengan `run_in_background` atau timeout panjang; boot bisa 1 sampai 3 menit.

## 2. Build

Sync dulu (`LANG` wajib, kalau tidak pod install error encoding):

```bash
cd "/Users/m/Documents/Goed Access" && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx cap sync
cd android && ./gradlew assembleDebug assembleRelease bundleRelease -q
```

Patch plugin Share ada di `patches/` dan dipasang otomatis oleh `postinstall` (patch-package). Kalau upgrade `@capacitor/share`, periksa ulang patch-nya.

## 3. Uji build release: buka aplikasi

```bash
adb uninstall com.goedacsess.app; adb install app/build/outputs/apk/release/app-release.apk
adb logcat -c; adb shell am start -W -n com.goedacsess.app/.MainActivity
adb shell pidof com.goedacsess.app        # harus ada pid
adb logcat -d -b crash                     # harus kosong
```

`adb install` dan `am start` bisa lambat di emulator; jalankan di latar belakang lalu tunggu.

## 4. Uji fitur native dengan build debug (WebView bisa dikendalikan)

Build release tidak bisa di-debug, jadi fitur native diuji di build debug (kode native-nya sama).

```bash
# Tanda tangan debug beda dengan release: uninstall dulu, kalau tidak install macet/gagal.
adb uninstall com.goedacsess.app; adb install app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.goedacsess.app/.MainActivity
until adb shell cat /proc/net/unix | grep -q webview_devtools_remote_; do sleep 2; done
P=$(adb shell pidof com.goedacsess.app | tr -d '\r\n')
adb forward --remove-all; adb forward tcp:9333 localabstract:webview_devtools_remote_$P
```

Lalu tulis JS ke berkas di scratchpad dan jalankan `node "$SK/cdp.mjs" 9333 berkas.js` (isi berkas = badan fungsi async, akhiri dengan `return ...`). Ulangi sampai `typeof masukDemo` mengembalikan `function` sebelum tes.

Minimal yang diuji, setiap selesai satu, cek `adb logcat -d -b crash` kosong dan `pidof` masih ada:

0. Pasang pencatat CSP sebelum tes lain: `window.__csp=[]; addEventListener('securitypolicyviolation',e=>__csp.push(e.violatedDirective+' '+e.blockedURI))`, dan pastikan `__csp` tetap kosong di akhir (index.html punya Content-Security-Policy; skema Android `https://localhost` dan iOS `capacitor://` harus lolos).
1. Masuk demo dan buka semua halaman: `masukDemo()`, lalu `navTo(p)` untuk tiap `.nav-item[data-page]`; tidak ada error, `scrollWidth <= innerWidth`.
2. Ekspor: `exportExcel('stock')` harus membuka menu Bagikan (`adb shell dumpsys activity activities | grep topResumedActivity` menunjuk `ChooserActivity`) dan berkas muncul di `adb shell run-as com.goedacsess.app ls cache`.
3. Bagikan gambar nota: `notaBagikanGambar(services[0].id)`.
4. Laporan keuangan: `navTo('laporan'); printLaporanKeuangan()`.

Tutup menu Bagikan sebelum tes berikutnya, kalau tidak plugin menolak dengan "Can't share while sharing is in progress".

## Catatan emulator

- Keyboard layar tidak muncul karena emulator menganggap ada keyboard fisik. Nyalakan dulu: `adb shell settings put secure show_ime_with_hard_keyboard 1`. Uji kolom isian (misalnya login) dengan `adb shell input tap` di posisinya: `innerHeight` harus mengecil dan tombol di bawahnya tetap terlihat.
- Cek juga screenshot bagian atas: kepala halaman dan laci menu tidak boleh tertimpa status bar (jam, sinyal).

- Dialog "Pixel Launcher / Digital Wellbeing isn't responding" berasal dari emulator yang lambat, bukan dari Goed Access. Tutup dengan `adb shell input tap` di tombolnya (ambil screenshot dulu: `adb shell screencap -p /sdcard/s.png && adb pull /sdcard/s.png`).
- Screenshot bisa tertinggal beberapa detik dari keadaan sebenarnya; percayai `dumpsys` dan logcat.

## Setelah lolos

Baru buka .aab di Finder untuk user (`app/build/outputs/bundle/release/app-release.aab`) dan sebutkan apa saja yang sudah diuji.
