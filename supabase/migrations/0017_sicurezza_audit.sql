-- 0017: correzioni di sicurezza emerse dall'audit (AUDIT.md: B1, B3, B7, B15).

-- ───────────── B1: nessuno può «arruolare» un altro utente come proprio collaboratore ─────────────
-- Il record Collaborator decide a quale azienda appartiene un utente (app.ctx): lo crea solo il server
-- quando l'invito viene confermato con il codice (api/confirm-invite.js). Dal browser non si crea,
-- e negli aggiornamenti i campi che identificano l'utente e l'azienda non si possono cambiare.
create or replace function public.entity_create(p_entity text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  c record;
  r public.entity_records;
  clean jsonb := app.strip_reserved(p_data);
begin
  perform app.assert_entity(p_entity);
  select * into c from app.ctx();
  if p_entity = 'Collaborator' or not app.can_write(p_entity, c.level) then
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
  clean := app.strip_reserved(p_patch);
  if p_entity = 'Collaborator' then
    clean := clean - 'collaborator_user_id' - 'host_user_id';
  end if;
  clean := app.store_secret(p_entity, p_id, clean);
  update public.entity_records
     set data = data || clean, updated_date = now()
   where id = p_id and entity = p_entity and tenant_id = c.tenant
  returning * into r;
  return app.mask_secret(p_entity, app.doc(r));
end $$;

create or replace function public.entity_update_many(p_entity text, p_filter jsonb, p_patch jsonb) returns int
language plpgsql security definer set search_path = public, app as $$
declare
  c record;
  n int;
  clean jsonb := app.strip_reserved(p_patch) - 'smtp_password';
begin
  perform app.assert_entity(p_entity);
  select * into c from app.ctx();
  if not app.can_write(p_entity, c.level) then
    raise exception 'Permesso negato' using errcode = '42501';
  end if;
  if p_entity = 'Collaborator' then
    clean := clean - 'collaborator_user_id' - 'host_user_id';
  end if;
  update public.entity_records r
     set data = r.data || clean, updated_date = now()
   where r.tenant_id = c.tenant and r.entity = p_entity
     and app.match(app.doc(r), coalesce(p_filter, '{}'::jsonb));
  get diagnostics n = row_count;
  return n;
end $$;

-- Un utente che è titolare di una propria azienda con dati non può essere spostato altrove da un
-- record incoerente: valgono solo i Collaborator la cui azienda coincide con host_user_id e che non
-- puntano al titolare stesso.
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
     and coalesce(nullif(r.data->>'host_user_id', ''), r.tenant_id::text) = r.tenant_id::text
     and r.tenant_id <> uid
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

-- ───────────── B3: gli operai possono allegare solo file dell'archivio della propria azienda ─────────────
create or replace function app.safe_file_url(p_url text, p_tenant uuid) returns text
language plpgsql immutable as $$
begin
  if p_url is null or p_url = '' then
    return '';
  end if;
  if length(p_url) > 1000
     or p_url !~ ('^(https://[A-Za-z0-9.-]+|http://(127\.0\.0\.1|localhost)(:[0-9]+)?)/storage/v1/object/(public/uploads|authenticated/private)/' || p_tenant::text || '/[^?#[:space:]]+$') then
    raise exception 'File non valido' using errcode = '22023';
  end if;
  return p_url;
end $$;

create or replace function app.safe_file_urls(p_urls jsonb, p_tenant uuid) returns jsonb
language sql immutable as $$
  select coalesce((
    select jsonb_agg(app.safe_file_url(u #>> '{}', p_tenant))
      from (select u from jsonb_array_elements(case when jsonb_typeof(p_urls) = 'array' then p_urls else '[]'::jsonb end) u limit 20) s
  ), '[]'::jsonb)
$$;

-- Invii dall'app operai (come 0015, con indirizzi dei file e importi controllati).
create or replace function public.operaio_submit(p_kind text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  c record;
  me jsonb;
  nome text;
  site record;
  r public.entity_records;
  doc jsonb;
  clean jsonb := coalesce(p_data, '{}'::jsonb);
begin
  select * into c from app.ctx();
  if c.employee_id is null then
    raise exception 'Il tuo account non è collegato a un dipendente' using errcode = '42501';
  end if;
  select data into me from public.entity_records where tenant_id = c.tenant and entity = 'Employee' and id::text = c.employee_id;
  nome := trim(coalesce(me->>'nome', '') || ' ' || coalesce(me->>'cognome', ''));
  select null::uuid as id, null::jsonb as data into site; -- senza cantiere: record vuoto, non «non assegnato»

  if nullif(clean->>'worksite_id', '') is not null then
    select id, data into site from public.entity_records where tenant_id = c.tenant and entity = 'Worksite' and id::text = clean->>'worksite_id';
    if site.id is null then raise exception 'Cantiere non trovato' using errcode = 'P0002'; end if;
  end if;

  if p_kind = 'foto' then
    if site.id is null or nullif(clean->>'foto_url', '') is null then raise exception 'Foto o cantiere mancanti' using errcode = '22023'; end if;
    doc := jsonb_build_object('worksite_id', site.id, 'foto_url', app.safe_file_url(clean->>'foto_url', c.tenant), 'fase', coalesce(nullif(clean->>'fase', ''), 'durante'),
      'didascalia', left(coalesce(clean->>'didascalia', ''), 300), 'categoria', left(coalesce(clean->>'categoria', ''), 60), 'data', to_char(now() at time zone 'Europe/Rome', 'YYYY-MM-DD'), 'autore', nome, 'autore_id', c.employee_id);
    insert into public.entity_records (entity, tenant_id, created_by_id, created_by, data) values ('WorksitePhoto', c.tenant, c.uid, auth.jwt()->>'email', doc) returning * into r;

  elsif p_kind = 'ddt' then
    if site.id is null then raise exception 'Scegli il cantiere' using errcode = '22023'; end if;
    doc := jsonb_build_object('tipo', 'uscita', 'categoria', 'Materiali', 'descrizione', left(coalesce(clean->>'descrizione', 'DDT'), 200), 'importo', least(greatest(coalesce((clean->>'importo')::numeric, 0), 0), 10000000),
      'data', coalesce(nullif(clean->>'data', ''), to_char(now(), 'YYYY-MM-DD')), 'fornitore', left(coalesce(clean->>'fornitore', ''), 200), 'file_url', app.safe_file_url(clean->>'file_url', c.tenant),
      'worksite_id', site.id, 'worksite_nome', site.data->>'nome', 'ddt', case when jsonb_typeof(clean->'ddt') = 'object' and length((clean->'ddt')::text) < 20000 then clean->'ddt' else '{}'::jsonb end, 'inserita_da', nome, 'da_verificare', true);
    insert into public.entity_records (entity, tenant_id, created_by_id, created_by, data) values ('WorksiteTransaction', c.tenant, c.uid, auth.jwt()->>'email', doc) returning * into r;

  elsif p_kind = 'segnalazione' then
    if nullif(trim(coalesce(clean->>'testo', '')), '') is null and jsonb_array_length(coalesce(clean->'foto_urls', '[]'::jsonb)) = 0 then
      raise exception 'Scrivi o registra cosa succede' using errcode = '22023';
    end if;
    doc := jsonb_build_object('tipo', coalesce(nullif(clean->>'tipo', ''), 'altro'), 'urgente', coalesce((clean->>'urgente')::boolean, false),
      'testo', left(coalesce(clean->>'testo', ''), 4000), 'testo_originale', left(coalesce(clean->>'testo_originale', ''), 4000), 'lingua', left(coalesce(clean->>'lingua', 'it'), 5),
      'foto_urls', app.safe_file_urls(clean->'foto_urls', c.tenant), 'audio_url', app.safe_file_url(clean->>'audio_url', c.tenant),
      'worksite_id', coalesce(site.id::text, ''), 'worksite_nome', coalesce(site.data->>'nome', ''), 'mezzo_id', left(coalesce(clean->>'mezzo_id', ''), 64), 'mezzo_nome', left(coalesce(clean->>'mezzo_nome', ''), 200),
      'dettagli', case when jsonb_typeof(clean->'dettagli') = 'object' and length((clean->'dettagli')::text) < 4000 then clean->'dettagli' else '{}'::jsonb end,
      'dipendente_id', c.employee_id, 'dipendente_nome', nome, 'stato', 'aperta');
    insert into public.entity_records (entity, tenant_id, created_by_id, created_by, data) values ('Segnalazione', c.tenant, c.uid, auth.jwt()->>'email', doc) returning * into r;

  elsif p_kind = 'richiesta' then
    if clean->>'tipo' not in ('ferie', 'permesso', 'malattia') or nullif(clean->>'dal', '') is null then
      raise exception 'Richiesta incompleta' using errcode = '22023';
    end if;
    doc := jsonb_build_object('tipo', clean->>'tipo', 'dal', clean->>'dal', 'al', coalesce(nullif(clean->>'al', ''), clean->>'dal'), 'ore', case when jsonb_typeof(clean->'ore') = 'number' then clean->'ore' else null end,
      'dalle', left(coalesce(clean->>'dalle', ''), 5), 'alle', left(coalesce(clean->>'alle', ''), 5),
      'note', left(coalesce(clean->>'note', ''), 1000), 'certificato', left(coalesce(clean->>'certificato', ''), 60),
      'dipendente_id', c.employee_id, 'dipendente_nome', nome, 'stato', 'in_attesa');
    insert into public.entity_records (entity, tenant_id, created_by_id, created_by, data) values ('Richiesta', c.tenant, c.uid, auth.jwt()->>'email', doc) returning * into r;

  elsif p_kind = 'lettura' then
    update public.entity_records set data = jsonb_set(data, '{letture}',
        coalesce((select jsonb_agg(l) from jsonb_array_elements(coalesce(data->'letture', '[]'::jsonb)) l where l->>'dipendente_id' <> c.employee_id), '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object('dipendente_id', c.employee_id, 'nome', nome, 'at', now(), 'firma', left(coalesce(clean->>'firma', ''), 400000)))),
        updated_date = now()
     where tenant_id = c.tenant and entity = 'Avviso' and id::text = clean->>'avviso_id'
    returning * into r;
    if r.id is null then raise exception 'Avviso non trovato' using errcode = 'P0002'; end if;

  elsif p_kind = 'firma_dpi' then
    if nullif(clean->>'firma', '') is null then raise exception 'Firma mancante' using errcode = '22023'; end if;
    if coalesce(clean->>'index', '') !~ '^[0-9]{1,4}$' or (clean->>'index')::int >= jsonb_array_length(coalesce(me->'dpi_consegnati', '[]'::jsonb)) then
      raise exception 'Consegna DPI non trovata' using errcode = 'P0002';
    end if;
    update public.entity_records set data = jsonb_set(data, '{dpi_consegnati}',
        (select jsonb_agg(case when x.i - 1 = (clean->>'index')::int then x.v || jsonb_build_object('firma', left(clean->>'firma', 400000), 'firmato_il', now()) else x.v end order by x.i)
           from jsonb_array_elements(coalesce(data->'dpi_consegnati', '[]'::jsonb)) with ordinality as x(v, i))), updated_date = now()
     where tenant_id = c.tenant and entity = 'Employee' and id::text = c.employee_id
    returning * into r;

  elsif p_kind = 'km' then
    update public.entity_records set data = data || jsonb_build_object('ore_km', left(clean->>'ore_km', 20), 'ore_km_aggiornato', now(), 'ore_km_da', nome), updated_date = now()
     where tenant_id = c.tenant and entity = 'Equipment' and id::text = clean->>'mezzo_id' and data->'assegnazione'->>'dipendente_id' = c.employee_id
    returning * into r;
    if r.id is null then raise exception 'Mezzo non assegnato a te' using errcode = '42501'; end if;

  elsif p_kind = 'lingua' then
    if clean->>'lingua' not in ('it', 'ro', 'sq') then raise exception 'Lingua non disponibile' using errcode = '22023'; end if;
    update public.entity_records set data = data || jsonb_build_object('lingua', clean->>'lingua'), updated_date = now()
     where tenant_id = c.tenant and entity = 'Employee' and id::text = c.employee_id returning * into r;

  else
    raise exception 'Operazione non valida' using errcode = '22023';
  end if;
  return jsonb_build_object('id', r.id, 'ok', true);
end $$;
revoke execute on function public.operaio_submit(text, jsonb) from public, anon;
grant execute on function public.operaio_submit(text, jsonb) to authenticated;


-- ───────────── B7: all'operaio arrivano solo i dati della ditta che la sua app usa ─────────────
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
    when p_entity = 'Employee' then
      d - 'costo_orario'
    when p_entity = 'CompanyProfile' then
      (select jsonb_object_agg(key, value) from jsonb_each(d)
        where key = any(array['id','created_date','updated_date','ragione_sociale','partita_iva','indirizzo','cap','citta','provincia',
          'telefono','email','logo_url','logo_larghezza','logo_altezza','logo_posizione','colore_principale','colore_secondario',
          'timbrature','termine_sezioni']))
    else d
  end
$$;

-- ───────────── B15: record inesistente → 404 (prima PostgREST rispondeva 500) ─────────────
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
    raise sqlstate 'PT404' using message = 'Record non trovato';
  end if;
  return app.mask_secret(p_entity, app.redact(p_entity, d, c.level, c.employee_id));
end $$;
