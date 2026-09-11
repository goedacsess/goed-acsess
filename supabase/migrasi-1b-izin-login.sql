-- =====================================================================
-- MIGRASI 1b: beri izin baca-tulis untuk pengguna yang sudah login
--
-- AMAN dijalankan sekarang. Hanya menambah kebijakan untuk peran
-- "authenticated"; akses anon TIDAK disentuh, jadi aplikasi lama di ketiga
-- toko tetap berjalan normal.
--
-- Kenapa perlu: RLS ternyata sudah aktif di tabel-tabel ini, tapi
-- kebijakannya hanya mengizinkan peran anon. Akibatnya begitu aplikasi
-- login sungguhan, setiap tabel terbaca kosong.
--
-- Jalankan di Supabase Dashboard > SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Lihat dulu keadaan sekarang, supaya ada catatan sebelum diubah
-- ---------------------------------------------------------------------
select
  c.relname as tabel,
  c.relrowsecurity as rls_aktif,
  p.polname as nama_kebijakan,
  coalesce(
    (select string_agg(r.rolname, ', ') from pg_roles r where r.oid = any(p.polroles)),
    'semua peran'
  ) as berlaku_untuk,
  p.polcmd as perintah
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'app_users','branches','stock','services','purchases','expenses',
    'audits','app_settings','kasir_perms','activity_log',
    'face_enrollments','attendance_log')
order by c.relname, p.polname;

-- ---------------------------------------------------------------------
-- 2. Tambahkan kebijakan untuk pengguna yang sudah login
--
-- Kebijakan anon yang sudah ada sengaja dibiarkan apa adanya. Pencabutannya
-- dilakukan nanti di migrasi 2, setelah semua toko memakai aplikasi baru.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'app_users','branches','stock','services','purchases','expenses',
    'audits','app_settings','kasir_perms','activity_log',
    'face_enrollments','attendance_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "akses pengguna login" on public.%I', t);
    execute format(
      'create policy "akses pengguna login" on public.%I
         for all to authenticated using (true) with check (true)', t);
    execute format('grant all on public.%I to authenticated', t);
  end loop;
end $$;

grant usage on schema public to authenticated;

-- ---------------------------------------------------------------------
-- 3. Periksa hasilnya
-- ---------------------------------------------------------------------
select
  c.relname as tabel,
  bool_or(
    p.polname = 'akses pengguna login'
  ) as punya_kebijakan_login
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'app_users','branches','stock','services','purchases','expenses',
    'audits','app_settings','kasir_perms','activity_log',
    'face_enrollments','attendance_log')
group by c.relname
order by c.relname;

-- Kedua belas baris harus punya_kebijakan_login = true.
