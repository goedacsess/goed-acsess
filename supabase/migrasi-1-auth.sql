-- =====================================================================
-- MIGRASI 1: siapkan Supabase Auth
--
-- AMAN dijalankan sekarang. Seluruhnya bersifat menambah, tidak ada yang
-- dihapus dan tidak ada perilaku lama yang diubah, jadi aplikasi yang
-- sedang dipakai ketiga toko tetap berjalan normal setelah ini.
--
-- Jalankan di Supabase Dashboard > SQL Editor.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Kaitan antara app_users dan akun auth
-- ---------------------------------------------------------------------
alter table public.app_users
  add column if not exists auth_id uuid references auth.users(id) on delete set null;

create unique index if not exists app_users_auth_id_key on public.app_users(auth_id);
create unique index if not exists app_users_username_key on public.app_users(lower(username));

-- ---------------------------------------------------------------------
-- 2. Buatkan akun auth untuk setiap user yang sudah ada
--
-- Username bukan email, jadi dibuatkan email sintetis <username>@goedacsess.app.
-- Password lama dipakai apa adanya supaya tidak ada yang perlu ganti password
-- saat peralihan; bedanya sekarang disimpan ter-hash bcrypt oleh Supabase,
-- bukan plaintext yang bisa dibaca siapa pun.
-- ---------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  lower(u.username) || '@goedacsess.app',
  crypt(u.pass, gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('app_user_id', u.id, 'username', u.username),
  '', '', '', ''
from public.app_users u
where u.auth_id is null
  and not exists (
    select 1 from auth.users a
    where a.email = lower(u.username) || '@goedacsess.app'
  );

update public.app_users u
set auth_id = a.id
from auth.users a
where a.email = lower(u.username) || '@goedacsess.app'
  and u.auth_id is null;

-- ---------------------------------------------------------------------
-- 3. Fungsi kelola user
--
-- Menambah atau menghapus user harus menyentuh auth.users, dan itu tidak
-- bisa dilakukan langsung dari aplikasi. Fungsi SECURITY DEFINER ini yang
-- menjembatani, dengan syarat pemanggilnya sudah login DAN berperan owner.
-- ---------------------------------------------------------------------
create or replace function public.saya_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_users
    where auth_id = auth.uid() and role = 'owner'
  );
$$;

create or replace function public.buat_user(
  p_id text, p_name text, p_username text, p_password text,
  p_role text, p_branch_id text
) returns void language plpgsql security definer set search_path = public, auth as $$
declare v_auth uuid;
begin
  if not public.saya_owner() then
    raise exception 'Hanya owner yang boleh menambah user';
  end if;
  if length(coalesce(p_password,'')) < 6 then
    raise exception 'Password minimal 6 karakter';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
    'authenticated', 'authenticated',
    lower(p_username) || '@goedacsess.app',
    crypt(p_password, gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('app_user_id', p_id, 'username', p_username),
    '', '', '', ''
  ) returning id into v_auth;

  insert into public.app_users (id, name, username, role, branch_id, auth_id)
  values (p_id, p_name, p_username, p_role, p_branch_id, v_auth);
end;
$$;

create or replace function public.ubah_user(
  p_id text, p_name text, p_username text, p_password text,
  p_role text, p_branch_id text
) returns void language plpgsql security definer set search_path = public, auth as $$
declare v_auth uuid;
begin
  -- Owner boleh mengubah siapa saja; selain owner hanya boleh dirinya sendiri.
  if not public.saya_owner() then
    if not exists (select 1 from public.app_users where id = p_id and auth_id = auth.uid()) then
      raise exception 'Tidak berhak mengubah user ini';
    end if;
  end if;

  select auth_id into v_auth from public.app_users where id = p_id;

  update public.app_users
    set name = p_name, username = p_username, role = p_role, branch_id = p_branch_id
    where id = p_id;

  if v_auth is not null then
    update auth.users
      set email = lower(p_username) || '@goedacsess.app',
          updated_at = now(),
          encrypted_password = case
            when coalesce(p_password,'') = '' then encrypted_password
            else crypt(p_password, gen_salt('bf'))
          end
      where id = v_auth;
  end if;
end;
$$;

create or replace function public.hapus_user(p_id text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_auth uuid;
begin
  if not public.saya_owner() then
    raise exception 'Hanya owner yang boleh menghapus user';
  end if;
  if exists (select 1 from public.app_users where id = p_id and auth_id = auth.uid()) then
    raise exception 'Tidak bisa menghapus akun yang sedang dipakai';
  end if;

  select auth_id into v_auth from public.app_users where id = p_id;
  delete from public.app_users where id = p_id;
  if v_auth is not null then
    delete from auth.users where id = v_auth;
  end if;
end;
$$;

revoke all on function public.buat_user(text,text,text,text,text,text) from anon;
revoke all on function public.ubah_user(text,text,text,text,text,text) from anon;
revoke all on function public.hapus_user(text) from anon;
grant execute on function public.buat_user(text,text,text,text,text,text) to authenticated;
grant execute on function public.ubah_user(text,text,text,text,text,text) to authenticated;
grant execute on function public.hapus_user(text) to authenticated;
grant execute on function public.saya_owner() to authenticated;

-- ---------------------------------------------------------------------
-- 4. Periksa hasilnya
-- ---------------------------------------------------------------------
select
  u.username,
  u.role,
  case when u.auth_id is null then 'BELUM TERKAIT' else 'ok' end as status_auth,
  a.email
from public.app_users u
left join auth.users a on a.id = u.auth_id
order by u.username;

-- Semua baris harus berstatus "ok". Kalau ada yang BELUM TERKAIT, hentikan
-- dan laporkan sebelum menjalankan migrasi kedua.
