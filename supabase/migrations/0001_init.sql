-- Talo — schema iniziale su Supabase (sostituisce il backend Base44).
--
-- Modello dati: tutte le 24 entità dell'app vivono in un'unica tabella
-- `entity_records` (colonna `entity` + documento JSON `data`), così il frontend
-- mantiene la stessa API a oggetti di prima (list/filter/create/update/...).
--
-- Sicurezza: la tabella NON ha policy RLS, quindi il browser non può leggerla
-- né scriverla direttamente. Ogni accesso passa dalle funzioni `entity_*`
-- (security definer) che applicano in un unico punto le regole:
--   * isolamento per azienda (tenant = titolare dell'account);
--   * ruoli collaboratore: "responsabile" e "operaio".

create extension if not exists pgcrypto;
create schema if not exists app;

-- ─────────────────────────────────────────────────────────────── tabelle ──

create table if not exists public.entity_records (
  id            uuid primary key default gen_random_uuid(),
  entity        text not null,
  tenant_id     uuid not null,
  created_by_id uuid,
  created_by    text,
  created_date  timestamptz not null default now(),
  updated_date  timestamptz not null default now(),
  data          jsonb not null default '{}'::jsonb
);

create index if not exists entity_records_tenant_entity_idx
  on public.entity_records (tenant_id, entity, created_date desc);
create index if not exists entity_records_collab_user_idx
  on public.entity_records ((data->>'collaborator_user_id'))
  where entity = 'Collaborator';
create index if not exists entity_records_reminder_date_idx
  on public.entity_records ((data->>'data'))
  where entity = 'Reminder';

alter table public.entity_records enable row level security;
revoke all on public.entity_records from anon, authenticated;

-- Password SMTP delle caselle email: mai esposte al browser.
create table if not exists public.email_secrets (
  account_id    uuid primary key references public.entity_records(id) on delete cascade,
  smtp_password text not null,
  updated_date  timestamptz not null default now()
);
alter table public.email_secrets enable row level security;
revoke all on public.email_secrets from anon, authenticated;

-- ────────────────────────────────────────────────────────── costanti ──

create or replace function app.entities() returns text[]
language sql immutable as $$
  select array[
    'Branch','Collaborator','CollaboratorInvite','CompanyDocument','CompanyProfile',
    'Contact','ContractTemplate','DailyAttendance','DocumentFolder','EmailAccount',
    'EmailTemplate','Employee','EmployeeDocument','GeneratedContract','Invoice',
    'Quote','QuoteFormat','ReceivedQuote','Reminder','SavedTemplate',
    'Worksite','WorksitePayment','WorksitePhoto','WorksiteTransaction'
  ]::text[]
$$;

create or replace function app.assert_entity(p_entity text) returns void
language plpgsql immutable as $$
begin
  if p_entity is null or not (p_entity = any(app.entities())) then
    raise exception 'Entità sconosciuta: %', p_entity using errcode = '22023';
  end if;
end $$;

-- Campi gestiti dal sistema: il client non può impostarli.
create or replace function app.strip_reserved(p jsonb) returns jsonb
language sql immutable as $$
  select coalesce(p, '{}'::jsonb)
    - 'id' - 'created_date' - 'updated_date' - 'created_by' - 'created_by_id' - 'tenant_id'
$$;

-- ─────────────────────────────────────────── contesto dell'utente corrente ──

-- Restituisce (uid, tenant, livello, dipendente collegato) calcolati una volta.
create or replace function app.ctx(
  out uid uuid, out tenant uuid, out level text, out employee_id text, out permissions jsonb
)
language plpgsql stable security definer set search_path = public, app as $$
declare
  c jsonb;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'Non autenticato' using errcode = '28000';
  end if;
  select r.data || jsonb_build_object('tenant_id', r.tenant_id) into c
    from public.entity_records r
   where r.entity = 'Collaborator'
     and r.data->>'collaborator_user_id' = uid::text
     and coalesce(r.data->>'status', 'active') = 'active'
   order by r.created_date desc
   limit 1;
  if c is null then
    tenant := uid; level := 'host'; employee_id := null; permissions := '[]'::jsonb;
  else
    tenant := (c->>'tenant_id')::uuid;
    level := coalesce(nullif(c->>'access_level', ''), 'responsabile');
    employee_id := nullif(c->>'employee_id', '');
    permissions := coalesce(c->'permissions', '[]'::jsonb);
  end if;
end $$;

-- Documento restituito al client: dati + campi di sistema (come Base44).
create or replace function app.doc(r public.entity_records) returns jsonb
language sql immutable as $$
  select r.data || jsonb_build_object(
    'id', r.id,
    'created_date', r.created_date,
    'updated_date', r.updated_date,
    'created_by', r.created_by,
    'created_by_id', r.created_by_id
  )
$$;

-- ───────────────────────────────────────── filtri stile Base44 / Mongo ──

-- Tutti i valori raggiungibili seguendo un percorso "a.b.c" (gli array
-- vengono attraversati, come in Mongo: {"presenze.dipendente_id": x}).
create or replace function app.path_values(v jsonb, p text[]) returns setof jsonb
language plpgsql immutable as $$
declare
  e jsonb;
begin
  if v is null then
    return;
  end if;
  if jsonb_typeof(v) = 'array' then
    if coalesce(array_length(p, 1), 0) = 0 then
      return next v;               -- l'array intero (per confronti esatti)
    end if;
    for e in select * from jsonb_array_elements(v) loop
      return query select * from app.path_values(e, p);
    end loop;
    return;
  end if;
  if coalesce(array_length(p, 1), 0) = 0 then
    return next v;
    return;
  end if;
  if jsonb_typeof(v) <> 'object' then
    return;
  end if;
  return query select * from app.path_values(v -> p[1], p[2:]);
end $$;

create or replace function app.match_op(vals jsonb[], op text, arg jsonb) returns boolean
language plpgsql immutable as $$
declare
  present boolean := exists (select 1 from unnest(vals) x where x <> 'null'::jsonb);
begin
  case op
    when '$eq' then
      if arg is null or arg = 'null'::jsonb then
        return not present;
      end if;
      return exists (select 1 from unnest(vals) x where x = arg);
    when '$ne' then
      return not app.match_op(vals, '$eq', arg);
    when '$in' then
      return exists (
        select 1 from jsonb_array_elements(arg) a
         where app.match_op(vals, '$eq', a)
      );
    when '$nin' then
      return not app.match_op(vals, '$in', arg);
    when '$all' then
      return not exists (
        select 1 from jsonb_array_elements(arg) a
         where not app.match_op(vals, '$eq', a)
      );
    when '$gt' then
      return exists (select 1 from unnest(vals) x where jsonb_typeof(x) = jsonb_typeof(arg) and x > arg);
    when '$gte' then
      return exists (select 1 from unnest(vals) x where jsonb_typeof(x) = jsonb_typeof(arg) and x >= arg);
    when '$lt' then
      return exists (select 1 from unnest(vals) x where jsonb_typeof(x) = jsonb_typeof(arg) and x < arg);
    when '$lte' then
      return exists (select 1 from unnest(vals) x where jsonb_typeof(x) = jsonb_typeof(arg) and x <= arg);
    when '$exists' then
      return present = coalesce((arg #>> '{}')::boolean, true);
    when '$regex' then
      return exists (
        select 1 from unnest(vals) x
         where jsonb_typeof(x) = 'string' and (x #>> '{}') ~* (arg #>> '{}')
      );
    when '$options' then
      return true;
    else
      raise exception 'Operatore di filtro non supportato: %', op using errcode = '22023';
  end case;
end $$;

create or replace function app.match(doc jsonb, f jsonb) returns boolean
language plpgsql immutable as $$
declare
  k text;
  cond jsonb;
  b jsonb;
  op text;
  arg jsonb;
  vals jsonb[];
  ok boolean;
begin
  if f is null or f = '{}'::jsonb or jsonb_typeof(f) <> 'object' then
    return true;
  end if;
  for k, cond in select * from jsonb_each(f) loop
    if k = '$or' then
      ok := false;
      for b in select * from jsonb_array_elements(cond) loop
        if app.match(doc, b) then ok := true; exit; end if;
      end loop;
      if not ok then return false; end if;
    elsif k = '$and' then
      for b in select * from jsonb_array_elements(cond) loop
        if not app.match(doc, b) then return false; end if;
      end loop;
    elsif k = '$nor' then
      for b in select * from jsonb_array_elements(cond) loop
        if app.match(doc, b) then return false; end if;
      end loop;
    else
      vals := array(select app.path_values(doc, string_to_array(k, '.')));
      if jsonb_typeof(cond) = 'object'
         and exists (select 1 from jsonb_object_keys(cond) x where left(x, 1) = '$') then
        for op, arg in select * from jsonb_each(cond) loop
          if not app.match_op(vals, op, arg) then return false; end if;
        end loop;
      elsif not app.match_op(vals, '$eq', cond) then
        return false;
      end if;
    end if;
  end loop;
  return true;
end $$;

-- ─────────────────────────────────────────────────── regole di accesso ──

-- Visibilità di un record per il livello di accesso corrente.
create or replace function app.can_read(p_entity text, d jsonb, p_level text, p_uid uuid, p_emp text)
returns boolean language sql immutable as $$
  select case p_level
    when 'host' then true
    when 'responsabile' then p_entity <> 'CollaboratorInvite'
    when 'operaio' then
      case p_entity
        when 'Employee'         then d->>'id' = p_emp
        when 'EmployeeDocument' then d->>'dipendente_id' = p_emp
        when 'DailyAttendance'  then true
        when 'Worksite'         then true
        when 'CompanyProfile'   then true
        when 'Collaborator'     then d->>'collaborator_user_id' = p_uid::text
        else false
      end
    else false
  end
$$;

create or replace function app.can_write(p_entity text, p_level text) returns boolean
language sql immutable as $$
  select case p_level
    when 'host' then true
    when 'responsabile' then not (p_entity = any(array[
      'Collaborator','CollaboratorInvite','CompanyProfile','EmailAccount','Branch'
    ]))
    else false
  end
$$;

-- Riduce i dati visibili a un operaio: solo le proprie presenze e, dei
-- cantieri, solo i dati anagrafici (niente importi).
create or replace function app.redact(p_entity text, d jsonb, p_level text, p_emp text)
returns jsonb language sql immutable as $$
  select case
    when p_level <> 'operaio' then d
    when p_entity = 'DailyAttendance' then
      d || jsonb_build_object('presenze', coalesce((
        select jsonb_agg(x) from jsonb_array_elements(coalesce(d->'presenze', '[]'::jsonb)) x
         where x->>'dipendente_id' = p_emp
      ), '[]'::jsonb))
    when p_entity = 'Worksite' then
      (select jsonb_object_agg(key, value) from jsonb_each(d)
        where key = any(array['id','nome','indirizzo','stato','attivo','created_date','updated_date']))
    else d
  end
$$;

-- Maschera la password SMTP nei documenti EmailAccount.
create or replace function app.mask_secret(p_entity text, d jsonb) returns jsonb
language sql stable security definer set search_path = public as $$
  select case
    when p_entity <> 'EmailAccount' then d
    else (d - 'smtp_password') || jsonb_build_object(
      'smtp_password',
      case when exists (select 1 from public.email_secrets s where s.account_id = (d->>'id')::uuid)
           then '********' else '' end)
  end
$$;

-- Salva l'eventuale password SMTP a parte e la toglie dal documento.
create or replace function app.store_secret(p_entity text, p_id uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  pwd text := p_data->>'smtp_password';
begin
  if p_entity <> 'EmailAccount' or not (p_data ? 'smtp_password') then
    return p_data;
  end if;
  if pwd is not null and pwd <> '' and pwd <> '********' then
    insert into public.email_secrets (account_id, smtp_password)
    values (p_id, pwd)
    on conflict (account_id) do update
      set smtp_password = excluded.smtp_password, updated_date = now();
  elsif pwd is null or pwd = '' then
    delete from public.email_secrets where account_id = p_id;
  end if;
  return p_data - 'smtp_password';
end $$;

-- ───────────────────────────────────────────────── API per il frontend ──

create or replace function public.entity_list(
  p_entity text,
  p_filter jsonb default '{}'::jsonb,
  p_sort text default '-created_date',
  p_limit int default null,
  p_skip int default 0
) returns setof jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare
  c record;
  sort_field text := nullif(ltrim(coalesce(p_sort, ''), '-+'), '');
  sort_dir text := case when left(coalesce(p_sort, ''), 1) = '-' then 'desc' else 'asc' end;
begin
  perform app.assert_entity(p_entity);
  select * into c from app.ctx();
  return query execute format($q$
    select app.mask_secret($1, app.redact($1, d.doc, $3, $5))
      from (select app.doc(r) as doc, r.created_date
              from public.entity_records r
             where r.tenant_id = $2 and r.entity = $1) d
     where app.can_read($1, d.doc, $3, $4, $5)
       and app.match(d.doc, $6)
     order by %s, d.created_date desc
     limit $7 offset $8
  $q$,
    case when sort_field is null then 'd.created_date ' || sort_dir
         else format('(d.doc->%L) %s nulls last', sort_field, sort_dir) end)
  using p_entity, c.tenant, c.level, c.uid, c.employee_id,
        coalesce(p_filter, '{}'::jsonb),
        least(coalesce(p_limit, 10000), 10000), greatest(coalesce(p_skip, 0), 0);
end $$;

create or replace function public.entity_get(p_entity text, p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare
  c record;
  d jsonb;
begin
  perform app.assert_entity(p_entity);
  select * into c from app.ctx();
  select app.doc(r) into d from public.entity_records r
   where r.id = p_id and r.entity = p_entity and r.tenant_id = c.tenant;
  if d is null or not app.can_read(p_entity, d, c.level, c.uid, c.employee_id) then
    raise exception 'Record non trovato' using errcode = 'P0002';
  end if;
  return app.mask_secret(p_entity, app.redact(p_entity, d, c.level, c.employee_id));
end $$;

-- store_secret scrive in email_secrets che referenzia entity_records: per
-- EmailAccount il record deve esistere prima del segreto.
create or replace function public.entity_create(p_entity text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  c record;
  r public.entity_records;
  clean jsonb := app.strip_reserved(p_data);
begin
  perform app.assert_entity(p_entity);
  select * into c from app.ctx();
  if not app.can_write(p_entity, c.level) then
    raise exception 'Permesso negato' using errcode = '42501';
  end if;
  insert into public.entity_records (entity, tenant_id, created_by_id, created_by, data)
  values (p_entity, c.tenant, c.uid, auth.jwt()->>'email', clean - 'smtp_password')
  returning * into r;
  if p_entity = 'EmailAccount' and clean ? 'smtp_password' then
    perform app.store_secret(p_entity, r.id, clean);
  end if;
  return app.mask_secret(p_entity, app.doc(r));
end $$;

create or replace function public.entity_bulk_create(p_entity text, p_items jsonb) returns setof jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  item jsonb;
begin
  for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    return next public.entity_create(p_entity, item);
  end loop;
end $$;

create or replace function public.entity_update(p_entity text, p_id uuid, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  c record;
  r public.entity_records;
  clean jsonb;
begin
  perform app.assert_entity(p_entity);
  select * into c from app.ctx();
  if not app.can_write(p_entity, c.level) then
    raise exception 'Permesso negato' using errcode = '42501';
  end if;
  if not exists (select 1 from public.entity_records
                  where id = p_id and entity = p_entity and tenant_id = c.tenant) then
    raise exception 'Record non trovato' using errcode = 'P0002';
  end if;
  clean := app.store_secret(p_entity, p_id, app.strip_reserved(p_patch));
  update public.entity_records
     set data = data || clean, updated_date = now()
   where id = p_id and entity = p_entity and tenant_id = c.tenant
  returning * into r;
  return app.mask_secret(p_entity, app.doc(r));
end $$;

create or replace function public.entity_bulk_update(p_entity text, p_items jsonb) returns setof jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  item jsonb;
begin
  for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    return next public.entity_update(p_entity, (item->>'id')::uuid, item);
  end loop;
end $$;

create or replace function public.entity_delete(p_entity text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  c record;
begin
  perform app.assert_entity(p_entity);
  select * into c from app.ctx();
  if not app.can_write(p_entity, c.level) then
    raise exception 'Permesso negato' using errcode = '42501';
  end if;
  delete from public.entity_records
   where id = p_id and entity = p_entity and tenant_id = c.tenant;
  return jsonb_build_object('id', p_id, 'deleted', found);
end $$;

create or replace function public.entity_delete_many(p_entity text, p_filter jsonb) returns int
language plpgsql security definer set search_path = public, app as $$
declare
  c record;
  n int;
begin
  perform app.assert_entity(p_entity);
  select * into c from app.ctx();
  if not app.can_write(p_entity, c.level) then
    raise exception 'Permesso negato' using errcode = '42501';
  end if;
  delete from public.entity_records r
   where r.tenant_id = c.tenant and r.entity = p_entity
     and app.match(app.doc(r), coalesce(p_filter, '{}'::jsonb));
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.entity_update_many(p_entity text, p_filter jsonb, p_patch jsonb) returns int
language plpgsql security definer set search_path = public, app as $$
declare
  c record;
  n int;
begin
  perform app.assert_entity(p_entity);
  select * into c from app.ctx();
  if not app.can_write(p_entity, c.level) then
    raise exception 'Permesso negato' using errcode = '42501';
  end if;
  update public.entity_records r
     set data = r.data || (app.strip_reserved(p_patch) - 'smtp_password'), updated_date = now()
   where r.tenant_id = c.tenant and r.entity = p_entity
     and app.match(app.doc(r), coalesce(p_filter, '{}'::jsonb));
  get diagnostics n = row_count;
  return n;
end $$;

-- Contesto di accesso dell'utente (per l'interfaccia).
create or replace function public.my_access() returns jsonb
language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'user_id', uid, 'tenant_id', tenant, 'access_level', level,
    'employee_id', employee_id, 'permissions', permissions
  ) from app.ctx()
$$;

revoke all on all functions in schema app from public, anon;
grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;

revoke execute on function
  public.entity_list(text, jsonb, text, int, int), public.entity_get(text, uuid),
  public.entity_create(text, jsonb), public.entity_bulk_create(text, jsonb),
  public.entity_update(text, uuid, jsonb), public.entity_bulk_update(text, jsonb),
  public.entity_delete(text, uuid), public.entity_delete_many(text, jsonb),
  public.entity_update_many(text, jsonb, jsonb), public.my_access()
  from public, anon;
grant execute on function
  public.entity_list(text, jsonb, text, int, int), public.entity_get(text, uuid),
  public.entity_create(text, jsonb), public.entity_bulk_create(text, jsonb),
  public.entity_update(text, uuid, jsonb), public.entity_bulk_update(text, jsonb),
  public.entity_delete(text, uuid), public.entity_delete_many(text, jsonb),
  public.entity_update_many(text, jsonb, jsonb), public.my_access()
  to authenticated;

-- ─────────────────────────────────────────────────────────── file ──

-- Bucket pubblico con percorsi non indovinabili (<tenant>/<uuid>-nome),
-- come i file di Base44: gli URL finiscono in PDF, email e documenti.
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do nothing;

create or replace function app.my_tenant() returns uuid
language sql stable security definer set search_path = public, app as $$
  select tenant from app.ctx()
$$;
grant execute on function app.my_tenant() to authenticated;

drop policy if exists "uploads insert own tenant" on storage.objects;
create policy "uploads insert own tenant" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = app.my_tenant()::text);

drop policy if exists "uploads delete own tenant" on storage.objects;
create policy "uploads delete own tenant" on storage.objects
  for delete to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = app.my_tenant()::text);
