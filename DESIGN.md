# DESIGN.md

Acuan desain iServis Pro / Goed Acsess. Dokumen ini sumber arah; `antislop.md` cuma penyaring di atasnya.

## Produk & pengguna

Aplikasi kasir dan pelacak servis untuk bengkel HP di Indonesia. Dipakai owner, manajer, dan kasir, seharian, di desktop dan HP. Sering dipakai sambil melayani pelanggan di meja depan, jadi layar harus bisa dibaca sekilas tanpa memicingkan mata.

## Karakter: tenang & padat

Ini alat kerja, bukan halaman promosi. Banyak data muat di satu layar, permukaan kalem, hiasan seperlunya. Baris rapat, garis tipis, angka rata kanan.

Materialnya boleh mewah, informasinya tetap serius. Kaca jadi wadahnya, isinya tetap padat.

## Dial

| Dial | Nilai | Alasan |
|---|---|---|
| ENERGY | 2 | Material kaca menaikkannya dari 1, tapi tidak sampai 3. Ini alat kerja. |
| RHYTHM | 1 | Layar data yang seragam itu disengaja, bukan kelalaian. Kasir hafal letak, jangan dipindah-pindah. |
| MOTION | 1 | Hover dan transisi seperlunya saja. Tidak ada animasi latar yang berputar terus. |

## Palette: tidak diganti

Warna yang sudah ada dipertahankan penuh. Ini identitas yang sudah dipakai lintas platform.

- Primer: `#0F6E56` hijau
- Aksen: oranye (`--orange`, versi teks `--orange-t`)
- Netral, border, dan seluruh pasangan token terang/gelap: tetap seperti sekarang

Batas: maksimal 2 sampai 3 warna inti + 1 aksen. Netral tidak dihitung.

## Kanvas

Latar diberi semburat radial lembut **dari hijau dan oranye milik sendiri**, bukan amber/indigo/rose/teal seperti referensi KREMOS.

**Alasan:** efek kaca hanya hidup kalau ada warna di belakangnya untuk dibiaskan. Kaca di atas `#F4F6F5` polos cuma jadi kotak keruh. Semburat ini yang memberi kaca bahan, tanpa memasukkan warna asing ke identitas.

## Material kaca

Diadaptasi dari sistem liquid glass KREMOS (`/Users/m/Documents/KREMOS/kreatoros---content-creator-business-suite/src/index.css`), diporting ke variabel CSS proyek ini. Bukan disalin mentah: KREMOS pakai Tailwind v4 dan React, proyek ini satu berkas HTML dengan CSS tulis tangan.

**Aturan dosis, wajib:**

- Kaca **hanya di wadah**: panel, kartu, modal, sidebar, topbar
- Kaca **tidak pernah di baris tabel yang berulang**. Alasan: `backdrop-filter` mahal, dan aplikasi ini merender tabel puluhan baris. Dipasang per baris akan tersendat di HP kelas bawah.
- Permukaan padat teks memakai isian lebih pekat, supaya kontras tidak bergantung pada apa yang lewat di belakangnya
- Wajib menyertakan fallback `@supports not (backdrop-filter)`

**Animasi latar KREMOS tidak diporting.** Blob melayang dan hue drift yang berputar tanpa henti bertabrakan dengan karakter tenang, memboroskan baterai, dan melanggar dial MOTION 1.

## Tipografi

| Peran | Font | Catatan |
|---|---|---|
| Judul | Sora | Tetap |
| Teks | Inter | Tetap |
| Angka | Plus Jakarta Sans | Baru, mengikuti referensi KREMOS |
| Mono | IBM Plex Mono | Tetap |

Angka memakai `font-variant-numeric: tabular-nums` dan `font-feature-settings: 'tnum' 1, 'lnum' 1`, supaya kolom rupiah lurus rata kanan dan angka tidak bergeser saat berubah.

**Semua font di-host lokal** di `src/vendor/fonts/`. Dilarang menautkan Google Fonts atau CDN mana pun: aplikasi kasir harus jalan tanpa internet.

## Yang tidak boleh

- Menambah warna di luar palette di atas
- Kaca di baris tabel
- Animasi latar yang berjalan terus
- Font dari CDN
- Kontras teks di bawah 4.5:1 (18px ke atas: 3:1), diukur di seluruh area yang dilewati teks, bukan satu titik
