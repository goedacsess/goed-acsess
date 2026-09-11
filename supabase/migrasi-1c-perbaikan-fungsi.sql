-- =====================================================================
-- MIGRASI 1c: perbaiki fungsi kelola user
--
-- AMAN dijalankan sekarang. Hanya mengganti isi tiga fungsi, tidak
-- menyentuh tabel, data, kebijakan, maupun akses anon.
--
-- Kenapa perlu: fungsi di migrasi 1 memakai set search_path = public, auth
-- sehingga crypt() dan gen_salt() dari ekstensi pgcrypto tidak terlihat di
-- dalamnya. Supabase memasang pgcrypto di skema "extensions", bukan
-- "public". Gejalanya: menyimpan user gagal dengan pesan
-- "function gen_salt(unknown) does not exist".
--
-- Perbaikannya: skema extensions dimasukkan ke search_path, dan pemanggilan
-- crypt/gen_salt ditulis lengkap dengan nama skemanya supaya tidak
-- bergantung pada urutan pencarian.
--
-- Jalankan di Supabase Dashboard > SQL Editor.
-- =====================================================================

create or replace function public.buat_user(
  p_id text, p_name text, p_username text, p_password text,
  p_role text, p_branch_id text
) returns void language plpgsql security definer
set search_path = public, auth, extensions as $$
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
    extensions.crypt(p_password, extensions.gen_salt('bf')),
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
) returns void language plpgsql security definer
set search_path = public, auth, extensions as $$
declare v_auth uuid;
begin
  -- Owner boleh mengubah siapa saja; selain owner hanya boleh dirinya sendiri.
  if not public.saya_owner() then
    if not exists (select 1 from public.app_users where id = p_id and auth_id = auth.uid()) then
      raise exception 'Tidak berhak mengubah user ini';
    end if;
  end if;
  if coalesce(p_password,'') <> '' and length(p_password) < 6 then
    raise exception 'Password minimal 6 karakter';
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
            else extensions.crypt(p_password, extensions.gen_salt('bf'))
          end
      where id = v_auth;
  end if;
end;
$$;

create or replace function public.hapus_user(p_id text)
returns void language plpgsql security definer
set search_path = public, auth, extensions as $$
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

-- ---------------------------------------------------------------------
-- Periksa: pastikan pgcrypto memang di skema extensions
-- ---------------------------------------------------------------------
select n.nspname as skema, e.extname as ekstensi
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
where e.extname = 'pgcrypto';
