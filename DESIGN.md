# DESIGN.md

Acuan desain Goed Access. Dokumen ini sumber arah; `antislop.md` cuma penyaring di atasnya.

## Produk & pengguna

Aplikasi kasir dan pelacak servis untuk bengkel HP di Indonesia. Dipakai owner, manajer, dan kasir, seharian, di desktop dan HP. Sering dipakai sambil melayani pelanggan di meja depan, jadi layar harus bisa dibaca sekilas tanpa memicingkan mata.

## Karakter: tata letak Kelola, material kaca KREMOS

Ini alat kerja, bukan halaman promosi. **Tata letak dan tipografi** mengikuti Kelola (web.kelola.co), yang sudah familiar bagi pemilik toko: judul halaman di kiri atas dengan kontrol di kanan, tabel dengan garis pemisah antarbaris, dan pola HP seperti aplikasi Kelola (lihat di bawah).

**Material dan warna** tetap identitas sendiri: kaca cair (liquid glass) yang diadaptasi dari proyek KREMOS (`/Users/m/Documents/KREMOS/kreatoros---content-creator-business-suite/src/index.css`), di atas kanvas bersemburat hijau dan oranye, dengan sidebar hijau gelap dan aksen oranye pada menu aktif. Materialnya boleh mewah, informasinya tetap padat.

## Dial

| Dial | Nilai | Alasan |
|---|---|---|
| ENERGY | 2 | Material kaca menaikkannya dari 1, tapi tidak sampai 3. Ini alat kerja. |
| RHYTHM | 1 | Layar data yang seragam itu disengaja. Kasir hafal letak, jangan dipindah-pindah. |
| MOTION | 1 | Hover dan transisi warna saja. Tidak ada animasi latar. |

## Palette: tidak diganti

Warna yang sudah ada dipertahankan penuh. Ini identitas yang sudah dipakai lintas platform.

- Primer: `#0F6E56` hijau (tombol aksi, ikon menu aktif, angka positif)
- Merah `#A83E3E` untuk pengeluaran dan selisih negatif
- Oranye `#B8863D` untuk pembelian dan piutang
- Ungu-abu `#5B6B8C` untuk uang masuk
- Gelap `#1E2A32` untuk teks dan seri profit di grafik
- Netral, border, dan seluruh pasangan token terang/gelap: tetap seperti sekarang

Aksen oranye (`#FF8A3D` sampai `#FF5A1F`) hanya di sidebar: ikon, latar, dan garis kiri menu aktif. Latar halaman `#F4F6F5` dengan semburat. Mode gelap tetap ada dan wajib berfungsi.

## Kanvas dan kaca

- **Kanvas** berlapis seperti wallpaper KREMOS (beberapa semburat radial), tapi dengan warna sendiri: hijau primer, oranye aksen, ungu-abu. Dipasang di `body::before` dengan `position:fixed`, bukan `background-attachment:fixed` yang berat di WKWebView iOS.
- **Kaca hanya di wadah**: panel, kartu, modal, beranda HP, tab bawah, wadah Riwayat. Tidak pernah di baris tabel berulang.
- **Blur (`backdrop-filter`) hanya di lapisan melayang**: pil atas, tab bawah, dan modal, karena di belakangnya ada isi yang bergerak. Kartu dan panel tetap kaca (isian tembus, kilau tepi, bayangan) tapi tanpa blur: latarnya kanvas gradasi yang diam, jadi blur tidak terlihat bedanya, sementara puluhan blur yang saling membaca bayangan tetangga membuat tepi berkedip saat digulir.
- Isian kaca sengaja lebih pekat dari KREMOS supaya teks padat tetap terbaca apa pun yang ada di belakangnya.
- **Kilau tepi (specular)** dipasang lewat `::after` bermask pada tiap wadah kaca: terang di kiri atas, redup di tengah. Ini yang membuat material terasa kaca, bukan kotak putih transparan.
- Isian atas lebih tembus dari bawah. Isian bawah tidak boleh di bawah `.26` di mode terang: di titik semburat terpekat, teks abu masih 4.7:1.
- Wajib ada fallback `@supports not (backdrop-filter)` ke permukaan padat, dan kilau tepinya ikut dimatikan.
- Animasi latar KREMOS (blob melayang) tidak diporting: melanggar MOTION 1 dan memboroskan baterai.

Batas: maksimal 2 sampai 3 warna inti + 1 aksen. Netral tidak dihitung.

## Bentuk

- Radius 8px untuk tombol dan input; panel dan kartu 13 sampai 18px
- Tinggi kontrol 40px di desktop, 44px di layar sentuh (sasaran sentuh minimal 44px)
- Tombol utama hijau penuh; tombol sekunder putih berbingkai
- Sidebar 248px, hijau gelap ke hitam, item menu 14px berat 500
- Grafik: wadah bertinggi tetap (bukan atribut `height` di canvas), label sumbu tegak dan dijarangkan otomatis

## Tampilan HP (di bawah 900px)

Meniru aplikasi Kelola versi HP, tetap dengan palet sendiri:

- **Tab bawah**: Dashboard, Produk, Riwayat, Akun. Akun membuka menu lengkap (sidebar) sebagai laci. Bentuknya pil kaca melayang seperti Threads: 12px dari tepi kiri, kanan, dan bawah, dengan pil kecil di dalamnya menandai halaman aktif.
- **Kepala halaman** di halaman dalam juga pil kaca melayang (menempel saat digulir), berisi tombol kembali, judul, dan tombol bulat cari serta mode gelap. Isi yang digulir lewat di bawahnya ikut terbias.
- Ruang bawah halaman (`.main`) harus cukup untuk pil tab bawah dan bilah demo, supaya isi terakhir tidak tertutup.
- **Beranda**: hero hijau primer berisi pilihan cabang, cari, dan mode gelap; kartu "Data Hari Ini" (stok masuk, stok keluar, penjualan, profit) dengan ikon mata untuk menyembunyikan angka; lalu kotak menu berikon per kelompok (Stok, Operasional, Lainnya).
- **Kotak menu** dibangun dari daftar halaman sidebar yang sama, jadi halaman yang tidak boleh dibuka pengguna tidak muncul.
- **Riwayat**: daftar penuh lebar, tanggal di atas, jenis dan status di tengah, jumlah di kanan. Filter lengkap tersembunyi di balik tombol Filter.
- Bilah topbar disembunyikan di beranda karena hero sudah menjadi kepalanya.

Bilah demo dan tombol melayang selalu berada di atas tab bawah.

**Tidak ada yang digulir ke samping di HP.** Semua muat dalam satu lebar layar:

- **Tabel lebar berubah jadi daftar.** Tambahkan kelas `tbl-stack` pada `<table>`, lalu `data-l="Label"` di tiap `<td>`. Di HP tiap baris jadi kartu dengan label di kiri dan nilainya di kanan; sel utama diberi kelas `td-head`, sel aksi diberi `td-act`, dan kolom yang isinya sudah pindah ke sel utama diberi `hide-m`.
- **Data Stok** punya perlakuan khusus menyerupai Kelola: nama di kiri dengan modal, jual, dan SKU di barisnya sendiri, stok di kanan, dan tiga tombol aksi diringkas jadi satu tombol menu.
- **Kartu ringkasan** (dashboard dan laporan) selalu dua kolom, berupa ubin kaca terpisah dengan celah 10px supaya tiap kartu punya kilau tepinya sendiri. Satu kolom membuat halaman terlalu panjang.
- Di layar lebar, tabel yang lebih lebar dari panelnya digulir di dalam wadahnya sendiri, bukan mendorong seluruh halaman.

## Tipografi

Satu keluarga: **Inter**, variable font, di-host lokal.

| Peran | Ukuran | Berat |
|---|---|---|
| Judul halaman | 20px | 700 |
| Judul panel | 16px | 700 |
| Teks, tabel, menu | 14px | 400 sampai 500 |
| Kepala tabel | 14px | 700 |
| Angka kartu | 20 sampai 22px | 700 |

Angka memakai `font-variant-numeric: tabular-nums` dan `font-feature-settings: 'tnum' 1, 'lnum' 1`, supaya kolom rupiah lurus rata kanan dan angka tidak bergeser saat berubah.

**Semua font di-host lokal** di `src/vendor/fonts/`. Dilarang menautkan Google Fonts atau CDN mana pun: aplikasi kasir harus jalan tanpa internet.

## Yang tidak boleh

- Menambah warna di luar palette di atas
- Kaca di baris tabel yang berulang
- Animasi latar yang berjalan terus
- Font dari CDN, atau menambah keluarga font kedua
- Emoji sebagai dekorasi
- Kontras teks di bawah 4.5:1 (18px ke atas: 3:1), diukur di seluruh area yang dilewati teks, bukan satu titik
