-- 0013: firma DPI — l'indice deve esistere (con elenco vuoto jsonb_agg darebbe NULL e svuoterebbe il dipendente).

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
