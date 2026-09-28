-- Archivio privato per i documenti sensibili (personale, documenti ditta, contratti firmati, fatture).
-- Il file non è raggiungibile con un semplice link: l'app crea link firmati che scadono dopo pochi minuti,
-- e solo gli utenti dell'azienda proprietaria (cartella = tenant) possono leggerlo, caricarlo o eliminarlo.
-- Gli operai non accedono all'archivio privato: vedono i propri documenti tramite le funzioni del server.
insert into storage.buckets (id, name, public, file_size_limit)
values ('private', 'private', false, 52428800)
on conflict (id) do update set public = false;

create or replace function app.can_use_private_files() returns boolean
language sql stable security definer set search_path = public, app as $$
  select coalesce((select level in ('host', 'responsabile') from app.ctx()), false)
$$;
grant execute on function app.can_use_private_files() to authenticated;

drop policy if exists "private read own tenant" on storage.objects;
create policy "private read own tenant" on storage.objects
  for select to authenticated
  using (bucket_id = 'private' and (storage.foldername(name))[1] = app.my_tenant()::text and app.can_use_private_files());

drop policy if exists "private insert own tenant" on storage.objects;
create policy "private insert own tenant" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'private' and (storage.foldername(name))[1] = app.my_tenant()::text and app.can_use_private_files());

drop policy if exists "private delete own tenant" on storage.objects;
create policy "private delete own tenant" on storage.objects
  for delete to authenticated
  using (bucket_id = 'private' and (storage.foldername(name))[1] = app.my_tenant()::text and app.can_use_private_files());
