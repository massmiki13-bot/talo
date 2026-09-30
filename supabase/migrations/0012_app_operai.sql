-- App operai: segnalazioni, richieste (ferie/permessi/malattia), bacheca avvisi.
-- L'operaio legge i suoi dati con operaio_home() e invia con operaio_submit(): i controlli restano qui.

create or replace function app.entities() returns text[]
language sql immutable as $$
  select array[
    'Branch','Collaborator','CollaboratorInvite','CompanyDocument','CompanyProfile',
    'Contact','ContractTemplate','DailyAttendance','DocumentFolder','EmailAccount',
    'EmailMessage','EmailTemplate','Employee','EmployeeDocument','GeneratedContract',
    'Invoice','PriceItem','Quote','QuoteFormat','ReceivedQuote','Reminder','SavedTemplate',
    'Worksite','WorksiteLog','WorksitePayment','WorksitePhoto','WorksiteTransaction',
    'Prezzario','PrezzarioVoce','SafetyPlan','ClockEvent','Equipment',
    'Segnalazione','Richiesta','Avviso'
  ]::text[]
$$;

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
        when 'Segnalazione'     then d->>'dipendente_id' = p_emp
        when 'Richiesta'        then d->>'dipendente_id' = p_emp
        when 'Avviso'           then true
        else false
      end
    else false
  end
$$;

-- Dati per l'app operai: sé stesso, cantieri della propria squadra (senza importi), capocantiere e colleghi,
-- mezzi, POS da firmare, avvisi, richieste e segnalazioni.
create or replace function public.operaio_home() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare
  c record;
  me jsonb;
  res jsonb;
begin
  select * into c from app.ctx();
  if c.employee_id is null then
    raise exception 'Il tuo account non è collegato a un dipendente' using errcode = '42501';
  end if;
  select data || jsonb_build_object('id', id) into me from public.entity_records
   where tenant_id = c.tenant and entity = 'Employee' and id::text = c.employee_id;

  select jsonb_build_object(
    'employee', jsonb_build_object('id', c.employee_id, 'nome', me->>'nome', 'cognome', me->>'cognome', 'ruolo', coalesce(me->>'ruolo', me->>'qualifica'),
                                   'foto_url', me->>'foto_url', 'lingua', me->>'lingua', 'dpi_consegnati', coalesce(me->'dpi_consegnati', '[]'::jsonb),
                                   'ore_settimanali', me->'ore_settimanali'),
    'company', (select jsonb_build_object('ragione_sociale', data->>'ragione_sociale', 'telefono', data->>'telefono', 'logo_url', data->>'logo_url', 'gps', coalesce(data->'timbrature'->'gps', 'false'::jsonb))
                  from public.entity_records where tenant_id = c.tenant and entity = 'CompanyProfile' order by created_date limit 1),
    'worksites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id, 'nome', w.data->>'nome', 'indirizzo', w.data->>'indirizzo', 'lat', w.data->'lat', 'lng', w.data->'lng', 'stato', w.data->>'stato',
        'data_inizio', w.data->>'data_inizio', 'data_fine_prevista', w.data->>'data_fine_prevista', 'avanzamento', w.data->'avanzamento',
        'capo', (select jsonb_build_object('nome', e.data->>'nome', 'cognome', e.data->>'cognome', 'telefono', coalesce(nullif(e.data->>'cellulare', ''), e.data->>'telefono'))
                   from public.entity_records e where e.tenant_id = c.tenant and e.entity = 'Employee' and e.id::text = w.data->>'responsabile_id'),
        'squadra', coalesce((select jsonb_agg(jsonb_build_object('nome', e.data->>'nome', 'cognome', e.data->>'cognome'))
                   from public.entity_records e where e.tenant_id = c.tenant and e.entity = 'Employee' and e.id::text <> c.employee_id
                   and w.data->'squadra_ids' ? e.id::text), '[]'::jsonb),
        'mezzi', coalesce((select jsonb_agg(jsonb_build_object('nome', m.data->>'nome', 'tipo', m.data->>'tipo', 'targa', m.data->>'targa'))
                   from public.entity_records m where m.tenant_id = c.tenant and m.entity = 'Equipment' and m.data->'assegnazione'->>'worksite_id' = w.id::text), '[]'::jsonb),
        'pos', coalesce((select jsonb_agg(jsonb_build_object('titolo', p.data->>'titolo', 'firma_token', p.data->>'firma_token',
                   'firmato', exists (select 1 from jsonb_array_elements(coalesce(p.data->'firme_raccolte', '[]'::jsonb)) f
                                      where f->>'firmatario_id' = 'lav:' || c.employee_id and (f->>'revisione')::int = coalesce((p.data->>'revisione')::int, 0))))
                   from public.entity_records p where p.tenant_id = c.tenant and p.entity = 'SafetyPlan' and p.data->>'worksite_id' = w.id::text
                   and nullif(p.data->>'firma_token', '') is not null), '[]'::jsonb)
      ) order by w.data->>'data_inizio')
      from public.entity_records w
      where w.tenant_id = c.tenant and w.entity = 'Worksite' and coalesce(w.data->>'stato', '') <> 'finito'
        and (w.data->'squadra_ids' ? c.employee_id or w.data->>'responsabile_id' = c.employee_id)
    ), '[]'::jsonb),
    'altri_cantieri', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'nome', w.data->>'nome') order by w.data->>'nome')
      from public.entity_records w where w.tenant_id = c.tenant and w.entity = 'Worksite' and coalesce(w.data->>'stato', '') <> 'finito'), '[]'::jsonb),
    'mezzi_miei', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'nome', m.data->>'nome', 'tipo', m.data->>'tipo', 'targa', m.data->>'targa', 'ore_km', m.data->>'ore_km',
                   'worksite_nome', m.data->'assegnazione'->>'worksite_nome', 'scadenze', coalesce(m.data->'scadenze', '{}'::jsonb)))
      from public.entity_records m where m.tenant_id = c.tenant and m.entity = 'Equipment' and m.data->'assegnazione'->>'dipendente_id' = c.employee_id), '[]'::jsonb),
    'avvisi', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'titolo', a.data->>'titolo', 'testo', a.data->>'testo', 'data', a.created_date,
                   'richiede_firma', coalesce((a.data->>'richiede_firma')::boolean, false),
                   'letto', exists (select 1 from jsonb_array_elements(coalesce(a.data->'letture', '[]'::jsonb)) l where l->>'dipendente_id' = c.employee_id))
                   order by a.created_date desc)
      from public.entity_records a where a.tenant_id = c.tenant and a.entity = 'Avviso' and a.created_date > now() - interval '90 days'
        and (coalesce(a.data->>'worksite_id', '') = '' or exists (select 1 from public.entity_records w where w.id::text = a.data->>'worksite_id' and w.data->'squadra_ids' ? c.employee_id))), '[]'::jsonb),
    'richieste', coalesce((select jsonb_agg(r.data || jsonb_build_object('id', r.id, 'created_date', r.created_date) order by r.created_date desc)
      from public.entity_records r where r.tenant_id = c.tenant and r.entity = 'Richiesta' and r.data->>'dipendente_id' = c.employee_id and r.created_date > now() - interval '365 days'), '[]'::jsonb),
    'segnalazioni', coalesce((select jsonb_agg(s.data || jsonb_build_object('id', s.id, 'created_date', s.created_date) order by s.created_date desc)
      from public.entity_records s where s.tenant_id = c.tenant and s.entity = 'Segnalazione' and s.data->>'dipendente_id' = c.employee_id and s.created_date > now() - interval '90 days'), '[]'::jsonb)
  ) into res;
  return res;
end $$;
revoke execute on function public.operaio_home() from public, anon;
grant execute on function public.operaio_home() to authenticated;

-- Invii dall'app operai. p_kind: foto | ddt | segnalazione | richiesta | lettura | firma_dpi | km | lingua
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

  if nullif(clean->>'worksite_id', '') is not null then
    select id, data into site from public.entity_records where tenant_id = c.tenant and entity = 'Worksite' and id::text = clean->>'worksite_id';
    if site.id is null then raise exception 'Cantiere non trovato' using errcode = 'P0002'; end if;
  end if;

  if p_kind = 'foto' then
    if site.id is null or nullif(clean->>'foto_url', '') is null then raise exception 'Foto o cantiere mancanti' using errcode = '22023'; end if;
    doc := jsonb_build_object('worksite_id', site.id, 'foto_url', left(clean->>'foto_url', 1000), 'fase', coalesce(nullif(clean->>'fase', ''), 'durante'),
      'didascalia', left(coalesce(clean->>'didascalia', ''), 300), 'data', to_char(now() at time zone 'Europe/Rome', 'YYYY-MM-DD'), 'autore', nome, 'autore_id', c.employee_id);
    insert into public.entity_records (entity, tenant_id, created_by_id, created_by, data) values ('WorksitePhoto', c.tenant, c.uid, auth.jwt()->>'email', doc) returning * into r;

  elsif p_kind = 'ddt' then
    if site.id is null then raise exception 'Scegli il cantiere' using errcode = '22023'; end if;
    doc := jsonb_build_object('tipo', 'uscita', 'categoria', 'Materiali', 'descrizione', left(coalesce(clean->>'descrizione', 'DDT'), 200), 'importo', coalesce((clean->>'importo')::numeric, 0),
      'data', coalesce(nullif(clean->>'data', ''), to_char(now(), 'YYYY-MM-DD')), 'fornitore', left(coalesce(clean->>'fornitore', ''), 200), 'file_url', left(coalesce(clean->>'file_url', ''), 1000),
      'worksite_id', site.id, 'worksite_nome', site.data->>'nome', 'ddt', coalesce(clean->'ddt', '{}'::jsonb), 'inserita_da', nome, 'da_verificare', true);
    insert into public.entity_records (entity, tenant_id, created_by_id, created_by, data) values ('WorksiteTransaction', c.tenant, c.uid, auth.jwt()->>'email', doc) returning * into r;

  elsif p_kind = 'segnalazione' then
    if nullif(trim(coalesce(clean->>'testo', '')), '') is null and jsonb_array_length(coalesce(clean->'foto_urls', '[]'::jsonb)) = 0 then
      raise exception 'Scrivi o registra cosa succede' using errcode = '22023';
    end if;
    doc := jsonb_build_object('tipo', coalesce(nullif(clean->>'tipo', ''), 'altro'), 'urgente', coalesce((clean->>'urgente')::boolean, false),
      'testo', left(coalesce(clean->>'testo', ''), 4000), 'testo_originale', left(coalesce(clean->>'testo_originale', ''), 4000), 'lingua', left(coalesce(clean->>'lingua', 'it'), 5),
      'foto_urls', coalesce(clean->'foto_urls', '[]'::jsonb), 'audio_url', left(coalesce(clean->>'audio_url', ''), 1000),
      'worksite_id', coalesce(site.id::text, ''), 'worksite_nome', coalesce(site.data->>'nome', ''), 'mezzo_id', left(coalesce(clean->>'mezzo_id', ''), 64), 'mezzo_nome', left(coalesce(clean->>'mezzo_nome', ''), 200),
      'dipendente_id', c.employee_id, 'dipendente_nome', nome, 'stato', 'aperta');
    insert into public.entity_records (entity, tenant_id, created_by_id, created_by, data) values ('Segnalazione', c.tenant, c.uid, auth.jwt()->>'email', doc) returning * into r;

  elsif p_kind = 'richiesta' then
    if clean->>'tipo' not in ('ferie', 'permesso', 'malattia') or nullif(clean->>'dal', '') is null then
      raise exception 'Richiesta incompleta' using errcode = '22023';
    end if;
    doc := jsonb_build_object('tipo', clean->>'tipo', 'dal', clean->>'dal', 'al', coalesce(nullif(clean->>'al', ''), clean->>'dal'), 'ore', clean->'ore',
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
