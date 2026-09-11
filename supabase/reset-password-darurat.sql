-- =====================================================================
-- RESET PASSWORD DARURAT
--
-- Dipakai kalau semua owner lupa password dan tidak ada seorang pun yang
-- bisa masuk ke aplikasi. Dijalankan dari Supabase Dashboard > SQL Editor,
-- yang aksesnya terikat ke akun Supabase milikmu, bukan ke aplikasi.
--
-- Password tersimpan sebagai hash bcrypt sejak migrasi auth, jadi tidak ada
-- cara membacanya. Yang bisa dilakukan hanya menggantinya.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Lihat dulu daftar akun yang ada
-- ---------------------------------------------------------------------
select u.username, u.name, u.role, a.email, a.last_sign_in_at
from public.app_users u
left join auth.users a on a.id = u.auth_id
order by u.role, u.username;

-- ---------------------------------------------------------------------
-- Ganti password satu akun
--
-- Ubah dua nilai di baris di bawah: username yang mau direset, dan password
-- barunya. Jalankan baris select-nya saja (blok di atas jangan ikut).
-- ---------------------------------------------------------------------
update auth.users
set encrypted_password = crypt('PASSWORD_BARU_DI_SINI', gen_salt('bf')),
    updated_at = now()
where id = (
  select auth_id from public.app_users
  where lower(username) = lower('USERNAME_DI_SINI')
);

-- Pastikan satu baris terpengaruh. Kalau 0, berarti username salah ketik
-- atau akunnya belum terkait ke auth.

-- ---------------------------------------------------------------------
-- Periksa hasilnya
-- ---------------------------------------------------------------------
select u.username, u.role,
       case when a.encrypted_password is null then 'TIDAK ADA PASSWORD' else 'ok' end as status,
       a.updated_at
from public.app_users u
join auth.users a on a.id = u.auth_id
where lower(u.username) = lower('USERNAME_DI_SINI');

-- ---------------------------------------------------------------------
-- Cara lain tanpa SQL
--
-- Supabase Dashboard > Authentication > Users, cari emailnya
-- (<username>@goedacsess.app), klik titik tiga, pilih opsi ganti password.
-- Hasilnya sama, tinggal pilih yang lebih nyaman.
-- ---------------------------------------------------------------------
