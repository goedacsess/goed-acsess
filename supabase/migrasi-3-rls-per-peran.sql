-- =====================================================================
-- MIGRASI 3: akses per peran dan per cabang
--
-- Sebelum ini semua tabel memakai satu kebijakan "akses pengguna login"
-- (using true): siapa pun yang punya sesi login boleh membaca dan menulis
-- seluruh data semua cabang, termasuk mengubah perannya sendiri jadi owner.
--
-- Setelah migrasi ini:
--   - hanya akun yang terdaftar di app_users yang bisa menyentuh data
--   - kasir hanya cabangnya, manajer hanya cabang-cabang yang dikelolanya
--   - app_users, branches, kasir_perms, app_settings hanya bisa diubah owner
--   - ubah_user tidak lagi bisa dipakai untuk mengganti role atau cabang sendiri
--   - ubah_stok: tambah/kurangi stok secara atomik, supaya dua perangkat
--     yang berjualan bersamaan tidak saling menimpa angka stok
--
-- CARA MENJALANKAN
--   1. Supabase Dashboard > SQL Editor > New query
--   2. Tempel seluruh isi file ini, klik Run
--   3. Periksa tabel hasil di bagian paling bawah
--   4. Login sebagai kasir di satu perangkat dan coba transaksi. Kalau ada
--      yang terkunci, jalankan blok "KEMBALIKAN" di bagian bawah.
--
-- Aman dijalankan ulang.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Fungsi bantu
--
-- SECURITY DEFINER supaya bisa membaca app_users tanpa terkena kebijakan
-- app_users sendiri (kebijakan yang membaca tabelnya sendiri berputar tanpa
-- henti).
-- ---------------------------------------------------------------------
create or replace function public.saya_anggota()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_users where auth_id = auth.uid());
$$;

create or replace function public.saya_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_users where auth_id = auth.uid() and role = 'owner');
$$;

create or replace function public.saya_app_id()
returns text language sql stable security definer set search_path = public as $$
  select id from public.app_users where auth_id = auth.uid() limit 1;
$$;

-- Kasir: branch_id berisi satu id. Manajer: beberapa id dipisah koma.
create or replace function public.boleh_cabang(p_branch text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_users u
    where u.auth_id = auth.uid()
      and (
        u.role = 'owner'
        or p_branch = any (string_to_array(replace(coalesce(u.branch_id, ''), ' ', ''), ','))
      )
  );
$$;

revoke all on function public.saya_anggota()      from anon, public;
revoke all on function public.saya_owner()        from anon, public;
revoke all on function public.saya_app_id()       from anon, public;
revoke all on function public.boleh_cabang(text)  from anon, public;
grant execute on function public.saya_anggota()     to authenticated;
grant execute on function public.saya_owner()       to authenticated;
grant execute on function public.saya_app_id()      to authenticated;
grant execute on function public.boleh_cabang(text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Buang kebijakan lama yang serba boleh
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
    for pol in
      select p.polname from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t
    loop
      execute format('drop policy %I on public.%I', pol.polname, t);
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Data per cabang: semua operasi hanya di cabang yang boleh
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['stock','services','purchases','expenses','audits'] loop
    execute format(
      'create policy "cabang sendiri" on public.%I for all to authenticated
         using (public.boleh_cabang(branch_id))
         with check (public.boleh_cabang(branch_id))', t);
  end loop;
end $$;

-- Catatan aktivitas: tulis dan baca di cabang sendiri, hapus/ubah hanya owner.
create policy "baca cabang sendiri"   on public.activity_log for select to authenticated using (public.boleh_cabang(branch_id));
create policy "tulis cabang sendiri"  on public.activity_log for insert to authenticated with check (public.boleh_cabang(branch_id));
create policy "owner ubah"            on public.activity_log for update to authenticated using (public.saya_owner()) with check (public.saya_owner());
create policy "owner hapus"           on public.activity_log for delete to authenticated using (public.saya_owner());

-- Absensi: perangkat di cabang mencatat absen siapa pun yang dikenali wajahnya.
create policy "baca cabang sendiri"   on public.attendance_log for select to authenticated using (public.boleh_cabang(branch_id));
create policy "tulis cabang sendiri"  on public.attendance_log for insert to authenticated with check (public.boleh_cabang(branch_id));
create policy "owner ubah"            on public.attendance_log for update to authenticated using (public.saya_owner()) with check (public.saya_owner());
create policy "owner hapus"           on public.attendance_log for delete to authenticated using (public.saya_owner());

-- Data wajah: dibaca semua anggota (dipakai untuk mencocokkan saat absen),
-- tapi hanya bisa diubah oleh pemiliknya sendiri atau owner.
create policy "anggota baca"          on public.face_enrollments for select to authenticated using (public.saya_anggota());
create policy "wajah sendiri"         on public.face_enrollments for insert to authenticated with check (public.saya_owner() or user_id = public.saya_app_id());
create policy "wajah sendiri ubah"    on public.face_enrollments for update to authenticated using (public.saya_owner() or user_id = public.saya_app_id()) with check (public.saya_owner() or user_id = public.saya_app_id());
create policy "owner hapus"           on public.face_enrollments for delete to authenticated using (public.saya_owner());

-- ---------------------------------------------------------------------
-- 4. Tabel pengaturan: dibaca semua anggota, diubah hanya owner
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['app_users','branches','app_settings','kasir_perms'] loop
    execute format('create policy "anggota baca" on public.%I for select to authenticated using (public.saya_anggota())', t);
    execute format('create policy "owner tulis" on public.%I for insert to authenticated with check (public.saya_owner())', t);
    execute format('create policy "owner ubah" on public.%I for update to authenticated using (public.saya_owner()) with check (public.saya_owner())', t);
    execute format('create policy "owner hapus" on public.%I for delete to authenticated using (public.saya_owner())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. ubah_user: selain owner hanya boleh mengubah nama, username, dan
--    password dirinya sendiri. Role dan cabang tetap seperti semula.
-- ---------------------------------------------------------------------
create or replace function public.ubah_user(
  p_id text, p_name text, p_username text, p_password text,
  p_role text, p_branch_id text
) returns void language plpgsql security definer
set search_path = public, auth, extensions as $$
declare v_auth uuid; v_role text; v_branch text; v_owner boolean := public.saya_owner();
begin
  select auth_id, role, branch_id into v_auth, v_role, v_branch from public.app_users where id = p_id;
  if not found then
    raise exception 'User tidak ditemukan';
  end if;
  if not v_owner then
    if v_auth is distinct from auth.uid() then
      raise exception 'Tidak berhak mengubah user ini';
    end if;
    p_role := v_role;
    p_branch_id := v_branch;
  end if;
  if p_role not in ('owner','manajer','kasir') then
    raise exception 'Role tidak dikenal';
  end if;
  if coalesce(p_password,'') <> '' and length(p_password) < 6 then
    raise exception 'Password minimal 6 karakter';
  end if;

  update public.app_users
    set name = p_name, username = p_username, role = p_role, branch_id = p_branch_id
    where id = p_id;

  if v_auth is not null then
    update auth.users
      set email = lower(p_username) || '@goedacsess.app',
          updated_at = now(),
          encrypted_password = case
            when coalesce(p_password,'') = '' then encrypted_password
            else extensions.crypt(p_password, extensions.gen_salt('bf'))
          end
      where id = v_auth;
  end if;
end;
$$;

revoke all on function public.ubah_user(text,text,text,text,text,text) from anon, public;
grant execute on function public.ubah_user(text,text,text,text,text,text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. ubah_stok: qty = qty + delta dalam satu perintah di server.
--    SECURITY INVOKER, jadi kebijakan "cabang sendiri" tetap berlaku.
-- ---------------------------------------------------------------------
create or replace function public.ubah_stok(p_id text, p_delta integer)
returns integer language plpgsql security invoker set search_path = public as $$
declare v_qty integer;
begin
  update public.stock set qty = coalesce(qty, 0) + p_delta
    where id = p_id
    returning qty into v_qty;
  if not found then
    raise exception 'Barang tidak ditemukan atau bukan cabang Anda';
  end if;
  return v_qty;
end;
$$;

revoke all on function public.ubah_stok(text, integer) from anon, public;
grant execute on function public.ubah_stok(text, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Periksa hasilnya
-- ---------------------------------------------------------------------
select c.relname as tabel,
       case when c.relrowsecurity then 'RLS aktif' else 'MASIH TERBUKA' end as status,
       string_agg(p.polname, ', ' order by p.polname) as kebijakan
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relkind = 'r'
  and c.relname in ('app_users','branches','stock','services','purchases','expenses',
    'audits','app_settings','kasir_perms','activity_log','face_enrollments','attendance_log')
group by c.relname, c.relrowsecurity
order by c.relname;

-- Tidak boleh ada kebijakan bernama "akses pengguna login" lagi.

-- ---------------------------------------------------------------------
-- KEMBALIKAN (hanya kalau ada yang terkunci): kembali ke aturan lama yang
-- serba boleh untuk pengguna login. Jalankan blok ini saja.
--
--   do $$
--   declare t text; pol record;
--   begin
--     foreach t in array array['app_users','branches','stock','services',
--       'purchases','expenses','audits','app_settings','kasir_perms',
--       'activity_log','face_enrollments','attendance_log'] loop
--       for pol in select p.polname from pg_policy p join pg_class c on c.oid = p.polrelid
--         join pg_namespace n on n.oid = c.relnamespace
--         where n.nspname = 'public' and c.relname = t loop
--         execute format('drop policy %I on public.%I', pol.polname, t);
--       end loop;
--       execute format('create policy "akses pengguna login" on public.%I
--         for all to authenticated using (true) with check (true)', t);
--     end loop;
--   end $$;
-- ---------------------------------------------------------------------
