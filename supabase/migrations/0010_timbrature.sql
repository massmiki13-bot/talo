-- Timbrature dal telefono (entrata/uscita) con posizione facoltativa, solo nell'istante della timbratura.
-- La posizione si registra solo se il titolare ha attivato la funzione dichiarando di aver
-- adempiuto all'art. 4 della L. 300/1970 (CompanyProfile.data.timbrature.gps = true).

create or replace function app.entities() returns text[]
language sql immutable as $$
  select array[
    'Branch','Collaborator','CollaboratorInvite','CompanyDocument','CompanyProfile',
    'Contact','ContractTemplate','DailyAttendance','DocumentFolder','EmailAccount',
    'EmailMessage','EmailTemplate','Employee','EmployeeDocument','GeneratedContract',
    'Invoice','PriceItem','Quote','QuoteFormat','ReceivedQuote','Reminder','SavedTemplate',
    'Worksite','WorksiteLog','WorksitePayment','WorksitePhoto','WorksiteTransaction',
    'Prezzario','PrezzarioVoce','SafetyPlan','ClockEvent'
  ]::text[]
$$;

-- L'operaio vede solo le proprie timbrature (le crea solo tramite clock_punch).
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
        when 'ClockEvent'       then d->>'dipendente_id' = p_emp
        else false
      end
    else false
  end
$$;

create index if not exists entity_records_clock_idx
  on public.entity_records (tenant_id, (data->>'dipendente_id'), (data->>'data'))
  where entity = 'ClockEvent';

-- Distanza in metri tra due punti (formula dell'emisenoverso).
create or replace function app.distance_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8) returns int
language sql immutable as $$
  select round(2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )))::int
$$;

-- Timbratura del dipendente collegato all'utente. p_client_time: ora reale di una timbratura
-- fatta offline e inviata dopo (accettata fino a 48 ore prima, mai nel futuro).
create or replace function public.clock_punch(
  p_tipo text,
  p_worksite uuid default null,
  p_lat float8 default null,
  p_lng float8 default null,
  p_accuracy float8 default null,
  p_note text default null,
  p_client_time timestamptz default null,
  p_client_id text default null
) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  c record;
  emp jsonb;
  site jsonb;
  prof jsonb;
  gps boolean;
  at_time timestamptz := now();
  late boolean := false;
  doc jsonb;
  r public.entity_records;
  dist int;
begin
  select * into c from app.ctx();
  if c.employee_id is null then
    raise exception 'Il tuo account non è collegato a un dipendente: chiedi al titolare' using errcode = '42501';
  end if;
  if p_tipo not in ('entrata', 'uscita') then
    raise exception 'Tipo di timbratura non valido' using errcode = '22023';
  end if;
  -- Timbratura offline già ricevuta (reinvio dopo un errore di rete): restituisce quella esistente.
  if p_client_id is not null then
    select * into r from public.entity_records
     where tenant_id = c.tenant and entity = 'ClockEvent' and data->>'client_id' = p_client_id limit 1;
    if found then return app.doc(r); end if;
  end if;
  if p_client_time is not null then
    if p_client_time > now() + interval '2 minutes' or p_client_time < now() - interval '48 hours' then
      raise exception 'Ora della timbratura non valida' using errcode = '22023';
    end if;
    late := p_client_time < now() - interval '2 minutes';
    at_time := least(p_client_time, now());
  end if;

  select data || jsonb_build_object('id', id) into emp from public.entity_records
   where tenant_id = c.tenant and entity = 'Employee' and id::text = c.employee_id;
  if p_worksite is not null then
    select data into site from public.entity_records
     where tenant_id = c.tenant and entity = 'Worksite' and id = p_worksite;
    if site is null then raise exception 'Cantiere non trovato' using errcode = 'P0002'; end if;
  end if;
  select data into prof from public.entity_records
   where tenant_id = c.tenant and entity = 'CompanyProfile' order by created_date limit 1;
  gps := coalesce((prof->'timbrature'->>'gps')::boolean, false);

  doc := jsonb_build_object(
    'tipo', p_tipo,
    'at', to_char(at_time at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'data', to_char(at_time at time zone 'Europe/Rome', 'YYYY-MM-DD'),
    'dipendente_id', c.employee_id,
    'dipendente_nome', trim(coalesce(emp->>'nome', '') || ' ' || coalesce(emp->>'cognome', '')),
    'worksite_id', coalesce(p_worksite::text, ''),
    'worksite_nome', coalesce(site->>'nome', ''),
    'note', left(coalesce(p_note, ''), 300),
    'inviata_dopo', late,
    'stato', 'da_confermare'
  );
  if p_client_id is not null then doc := doc || jsonb_build_object('client_id', left(p_client_id, 64)); end if;

  if gps and p_lat is not null and p_lng is not null and abs(p_lat) <= 90 and abs(p_lng) <= 180 then
    doc := doc || jsonb_build_object('posizione', jsonb_build_object(
      'lat', round(p_lat::numeric, 5), 'lng', round(p_lng::numeric, 5), 'accuratezza_m', round(coalesce(p_accuracy, 0)::numeric)));
    if nullif(site->>'lat', '') is not null and nullif(site->>'lng', '') is not null then
      dist := app.distance_m(p_lat, p_lng, (site->>'lat')::float8, (site->>'lng')::float8);
      doc := doc || jsonb_build_object('distanza_m', dist);
    end if;
  end if;

  insert into public.entity_records (entity, tenant_id, created_by_id, created_by, data)
  values ('ClockEvent', c.tenant, c.uid, auth.jwt()->>'email', doc)
  returning * into r;
  return app.doc(r);
end $$;
revoke execute on function public.clock_punch(text, uuid, float8, float8, float8, text, timestamptz, text) from public, anon;
grant execute on function public.clock_punch(text, uuid, float8, float8, float8, text, timestamptz, text) to authenticated;
