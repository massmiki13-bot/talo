-- Registro attività ("chi ha modificato cosa") e registro errori dell'app.

-- ─────────────────────────────────────────────── registro attività ──

create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  tenant_id  uuid not null,
  at         timestamptz not null default now(),
  user_id    uuid,
  user_email text,
  entity     text not null,
  record_id  uuid not null,
  action     text not null check (action in ('create', 'update', 'delete')),
  label      text,
  changed    text[]
);
create index if not exists audit_log_tenant_at_idx on public.audit_log (tenant_id, at desc);
create index if not exists audit_log_record_idx on public.audit_log (tenant_id, record_id, at desc);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;

-- Nome leggibile del record (cliente, lavoro, preventivo…).
create or replace function app.record_label(d jsonb) returns text
language sql immutable as $$
  select left(coalesce(
    case when d ? 'cognome' then nullif(trim(concat_ws(' ', d->>'nome', d->>'cognome')), '') end,
    nullif(d->>'nome', ''), nullif(d->>'ragione_sociale', ''), nullif(d->>'titolo', ''),
    nullif(concat_ws(' – ', nullif(d->>'numero', ''), nullif(coalesce(d->>'oggetto', d->>'cliente_nome'), '')), ''),
    nullif(d->>'descrizione', ''), nullif(d->>'nome_file', ''), nullif(d->>'file_name', ''),
    nullif(d->>'data', '')
  ), 140)
$$;

create or replace function app.audit_trg() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  r public.entity_records;
  keys text[];
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  -- Posta sincronizzata e singole voci dei prezzari: troppo numerose, non utili nel registro.
  if r.entity in ('EmailMessage', 'PrezzarioVoce') then return null; end if;
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into keys
      from (select jsonb_object_keys(new.data) k union select jsonb_object_keys(old.data)) s
     where new.data->k is distinct from old.data->k;
    if keys is null then return null; end if;
  end if;
  insert into public.audit_log (tenant_id, user_id, user_email, entity, record_id, action, label, changed)
  values (r.tenant_id, auth.uid(), auth.jwt()->>'email', r.entity, r.id,
          case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end,
          app.record_label(r.data), keys);
  return null;
end $$;

drop trigger if exists entity_records_audit on public.entity_records;
create trigger entity_records_audit
  after insert or update or delete on public.entity_records
  for each row execute function app.audit_trg();

-- Lettura del registro: solo il titolare. Filtri facoltativi per tipo, persona e record.
create or replace function public.audit_list(
  p_limit int default 50,
  p_before timestamptz default null,
  p_entity text default null,
  p_user uuid default null,
  p_record uuid default null
) returns setof public.audit_log
language plpgsql stable security definer set search_path = public, app as $$
declare
  c record;
begin
  select * into c from app.ctx();
  if c.level <> 'host' then
    raise exception 'Permesso negato' using errcode = '42501';
  end if;
  return query
    select * from public.audit_log a
     where a.tenant_id = c.tenant
       and (p_before is null or a.at < p_before)
       and (p_entity is null or a.entity = p_entity)
       and (p_user is null or a.user_id = p_user)
       and (p_record is null or a.record_id = p_record)
     order by a.at desc
     limit least(coalesce(p_limit, 50), 200);
end $$;
revoke execute on function public.audit_list(int, timestamptz, text, uuid, uuid) from public, anon;
grant execute on function public.audit_list(int, timestamptz, text, uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────── registro errori ──

create table if not exists public.app_errors (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  source     text not null check (source in ('client', 'server')),
  tenant_id  uuid,
  user_id    uuid,
  message    text not null,
  stack      text,
  url        text,
  user_agent text,
  extra      jsonb
);
create index if not exists app_errors_at_idx on public.app_errors (at desc);
alter table public.app_errors enable row level security;
revoke all on public.app_errors from anon, authenticated;

-- Errori del browser: al massimo 30 all'ora per utente, testi troncati.
create or replace function public.log_client_error(p jsonb) returns void
language plpgsql security definer set search_path = public, app as $$
declare
  c record;
begin
  select * into c from app.ctx();
  if (select count(*) from public.app_errors
       where user_id = c.uid and at > now() - interval '1 hour') >= 30 then
    return;
  end if;
  insert into public.app_errors (source, tenant_id, user_id, message, stack, url, user_agent, extra)
  values ('client', c.tenant, c.uid, left(coalesce(p->>'message', 'Errore'), 1000), left(p->>'stack', 4000),
          left(p->>'url', 500), left(p->>'user_agent', 300), case when jsonb_typeof(p->'extra') = 'object' then p->'extra' end);
end $$;
revoke execute on function public.log_client_error(jsonb) from public, anon;
grant execute on function public.log_client_error(jsonb) to authenticated;
