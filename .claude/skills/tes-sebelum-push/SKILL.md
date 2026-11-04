---
name: tes-sebelum-push
description: Uji dan debug Goed Access sebelum setiap git push atau rilis (desktop, Android, iOS). Jalankan tes otomatis semua halaman, modal, alur transaksi, dan jalur simpan gagal; perbaiki semua yang gagal dulu. Wajib dipakai sebelum `git push`, `electron-builder --publish`, atau menyerahkan build ke user.
---

# Uji sebelum push

Aturan: **jangan push, jangan terbitkan rilis, dan jangan serahkan build sebelum langkah di bawah lolos.** Kalau ada yang gagal, perbaiki, lalu jalankan ulang dari awal. Laporkan ke user apa saja yang diuji dan hasilnya.

## 1. Tes otomatis (wajib, sekitar 2,5 menit)

```bash
node "/Users/m/Documents/Goed Access/.claude/skills/tes-sebelum-push/tes.mjs"
```

Jalankan dengan timeout 600000 ms. Skrip keluar dengan kode 1 kalau ada yang gagal. Yang diuji:

- Sintaks semua skrip di `src/index.html`, `main.js`, `preload.js`.
- Ke-16 halaman dan 17 modal di HP 375, tablet 768, tablet landscape 1024, desktop 1440, mode terang dan gelap: tidak ada error JS, tidak ada geser ke samping, tidak ada isi yang meluber.
- Alur transaksi di HP dan desktop, dengan angka stok dan total dicek: servis, hapus servis, batas qty, piutang, pengeluaran, tambah stok, pembelian, utang, audit, hapus audit, ekspor CSV, cetak nota dan laporan, batas demo.
- Server menolak simpan: perubahan di layar harus dibatalkan.

Skrip berjalan di Chrome tanpa jendela dan mode demo, jadi tidak menyentuh data asli.

**Kalau menambah fitur atau alur baru, tambahkan tesnya ke `tes.mjs`** (bagian `ALUR`, `SAPU_MODAL`, atau `GAGAL_SERVER`) sebelum push.

## 2. Periksa perubahan dengan mata (wajib kalau tampilan berubah)

Tes otomatis tidak menilai rapi tidaknya tampilan. Kalau CSS atau HTML berubah, buka preview (`preview_start` dengan nama `web`), masuk demo, lalu ambil screenshot bagian yang berubah di HP (preset mobile), tablet, dan desktop, terang dan gelap. Cari teks terpotong, elemen bertumpuk, kontras rendah. Kembalikan viewport ke `desktop` setelah selesai.

## 3. Android dan iOS

- Kalau ada build Android, perubahan plugin Capacitor, atau perubahan di `android/`: jalankan juga skill `tes-android`.
- Kalau mengubah fitur yang hanya jalan di HP (`isNativeApp()`, `capPlugin(...)`, bagikan, ekspor, nota HP): uji di emulator lewat `tes-android`, karena Chrome tidak menjalankan jalur itu.

## 4. Baru push

Kalau semua lolos, commit lalu push dengan token akun goedacsess seperti biasa. Di pesan ke user, sebutkan ringkas hasil tes (misalnya "tes otomatis lolos semua, dicek juga di emulator Android").
