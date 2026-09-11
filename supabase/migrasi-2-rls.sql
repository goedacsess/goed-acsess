-- =====================================================================
-- MIGRASI 2: kunci semua tabel, buang password plaintext
--
-- JANGAN JALANKAN SEBELUM aplikasi versi baru tersebar ke semua toko.
--
-- Setelah ini, anon key yang ada di dalam installer publik TIDAK BISA
-- membaca atau menulis apa pun. Aplikasi versi lama akan langsung berhenti
-- berfungsi, karena versi lama mengirim semua permintaan sebagai anon.
--
-- Cara memastikan aman: buka aplikasi terbaru di tiap toko, login, pastikan
-- data muncul. Baru jalankan berkas ini.
--
-- Jalankan di Supabase Dashboard > SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Cabut akses publik
--
-- Kebijakan untuk pengguna login sudah dipasang di migrasi 1b, jadi di sini
-- tinggal menutup pintu anon. Setelah ini anon key yang ada di dalam
-- installer publik tidak bisa membaca maupun menulis apa pun.
-- ---------------------------------------------------------------------
do $$
declare t text; pol record;
begin
  foreach t in array array[
    'app_users','branches','stock','services','purchases','expenses',
    'audits','app_settings','kasir_perms','activity_log',
    'face_enrollments','attendance_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);

    -- Buang semua kebijakan yang berlaku untuk anon atau untuk semua peran,
    -- kecuali kebijakan milik pengguna login yang baru dibuat.
    for pol in
      select p.polname
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t
        and p.polname <> 'akses pengguna login'
    loop
      execute format('drop policy %I on public.%I', pol.polname, t);
    end loop;

    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

revoke usage on schema public from anon;

-- ---------------------------------------------------------------------
-- 2. Buang kolom password plaintext
--
-- Password sudah pindah ke auth.users dalam bentuk hash bcrypt sejak
-- migrasi pertama, jadi kolom ini tidak dipakai lagi dan hanya menyisakan
-- risiko. Cadangkan dulu kalau ragu:
--   create table _cadangan_pass as select id, username, pass from public.app_users;
-- ---------------------------------------------------------------------
alter table public.app_users drop column if exists pass;

-- ---------------------------------------------------------------------
-- 3. Periksa hasilnya
-- ---------------------------------------------------------------------
select
  c.relname as tabel,
  case when c.relrowsecurity then 'RLS aktif' else 'MASIH TERBUKA' end as status,
  count(p.polname) as jumlah_kebijakan
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'app_users','branches','stock','services','purchases','expenses',
    'audits','app_settings','kasir_perms','activity_log',
    'face_enrollments','attendance_log')
group by c.relname, c.relrowsecurity
order by c.relname;

-- Semua baris harus "RLS aktif" dengan jumlah_kebijakan = 1.

-- ---------------------------------------------------------------------
-- KALAU TERJADI MASALAH, cara membuka kembali dengan cepat:
--
--   do $$
--   declare t text;
--   begin
--     foreach t in array array['app_users','branches','stock','services',
--       'purchases','expenses','audits','app_settings','kasir_perms',
--       'activity_log','face_enrollments','attendance_log']
--     loop
--       execute format('alter table public.%I disable row level security', t);
--       execute format('grant all on public.%I to anon', t);
--     end loop;
--   end $$;
--
-- Ini mengembalikan keadaan seperti sebelumnya, termasuk lubang keamanannya,
-- jadi pakai hanya sebagai jalan darurat sementara.
-- ---------------------------------------------------------------------
