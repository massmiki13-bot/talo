-- 0018: i permessi per modulo del responsabile valgono anche nel database (audit B2).
-- Prima erano applicati solo dall'interfaccia: con una chiamata diretta un responsabile abilitato a un
-- solo modulo leggeva e modificava quasi tutto. Ora ogni modulo dà accesso alle sole entità che le sue
-- pagine usano. La mappa segue src/lib/permissions.js (comprese le chiavi «storiche» equivalenti).
-- La Dashboard non dà accesso a nulla di suo: mostra i dati dei moduli a cui la persona è abilitata.

-- Entità che ogni modulo può leggere (r) e modificare (w).
create or replace function app.module_map() returns jsonb
language sql immutable as $$
  select '{
    "contatti":        {"r": ["Contact","Quote","ReceivedQuote","Worksite","WorksitePayment","GeneratedContract"],
                        "w": ["Contact"]},
    "preventivi":      {"r": ["Quote","QuoteFormat","ReceivedQuote","PriceItem","Prezzario","PrezzarioVoce","SavedTemplate","Contact","Worksite"],
                        "w": ["Quote","QuoteFormat","ReceivedQuote","PriceItem","Prezzario","PrezzarioVoce","SavedTemplate","Contact","Worksite"]},
    "prezzari":        {"r": ["Prezzario","PrezzarioVoce","PriceItem"],
                        "w": ["Prezzario","PrezzarioVoce","PriceItem"]},
    "fatture":         {"r": ["Invoice","Contact","Quote","Worksite","WorksitePayment"],
                        "w": ["Invoice","WorksitePayment"]},
    "scadenzario":     {"r": ["Invoice","Contact","Worksite","WorksitePayment","WorksiteTransaction"],
                        "w": ["Invoice","Worksite","WorksitePayment"]},
    "lavori":          {"r": ["Worksite","WorksiteLog","WorksitePayment","WorksitePhoto","WorksiteTransaction","Contact","Quote","ReceivedQuote","DailyAttendance","ClockEvent","Employee","CompanyDocument","Equipment"],
                        "w": ["Worksite","WorksiteLog","WorksitePayment","WorksitePhoto","WorksiteTransaction","ReceivedQuote","DailyAttendance","ClockEvent","CompanyDocument"]},
    "cronoprogramma":  {"r": ["Worksite","Employee","Equipment"], "w": []},
    "mezzi":           {"r": ["Equipment","Employee","Worksite"], "w": ["Equipment"]},
    "dipendenti":      {"r": ["Employee","EmployeeDocument","DailyAttendance","Worksite"],
                        "w": ["Employee","EmployeeDocument"]},
    "sicurezza":       {"r": ["SafetyPlan","Worksite","Employee","EmployeeDocument","Contact","CompanyDocument","Equipment"],
                        "w": ["SafetyPlan","CompanyDocument"]},
    "documenti_ditta": {"r": ["CompanyDocument","DocumentFolder","Worksite","Contact","Employee","EmployeeDocument"],
                        "w": ["CompanyDocument","DocumentFolder","EmployeeDocument","WorksiteTransaction"]},
    "qualificazioni":  {"r": ["Qualificazione","CompanyDocument","Employee","EmployeeDocument","Equipment","Worksite","WorksiteTransaction","Segnalazione"],
                        "w": ["Qualificazione","Worksite"]},
    "promemoria":      {"r": ["EmployeeDocument"], "w": []},
    "contratti":       {"r": ["GeneratedContract","ContractTemplate","Contact","Employee","Worksite","Quote"],
                        "w": ["GeneratedContract","ContractTemplate"]},
    "presenze":        {"r": ["DailyAttendance","ClockEvent","Employee","Worksite"],
                        "w": ["DailyAttendance","ClockEvent","WorksitePhoto"]},
    "squadra":         {"r": ["Avviso","Richiesta","Segnalazione","Employee","Worksite","DailyAttendance"],
                        "w": ["Avviso","Richiesta","Segnalazione","DailyAttendance"]},
    "analisi":         {"r": ["Quote","Invoice","Worksite","WorksitePayment","WorksiteTransaction","DailyAttendance","Employee"],
                        "w": []}
  }'::jsonb
$$;

-- Chiavi storiche che valgono anche per un modulo più recente (legacyPerms nell'interfaccia).
create or replace function app.module_aliases() returns jsonb
language sql immutable as $$
  select '{
    "prezzari": ["preventivi"], "scadenzario": ["fatture"], "cronoprogramma": ["lavori"], "mezzi": ["lavori"],
    "qualificazioni": ["documenti_ditta"], "squadra": ["presenze","dipendenti"], "analisi": ["report_annuale"]
  }'::jsonb
$$;

-- Entità accessibili al responsabile corrente. p_mode: 'r' lettura, 'w' scrittura.
-- Sempre disponibili: profilo ditta e collaboratori (sola lettura), posta e promemoria.
create or replace function app.resp_entities(p_mode text) returns text[]
language sql stable security definer set search_path = public, app as $$
  with me as (select permissions as p from app.ctx()),
  granted as (
    select m.key, m.value
      from jsonb_each(app.module_map()) m, me
     where me.p ? m.key
        or exists (select 1 from jsonb_array_elements_text(coalesce(app.module_aliases() -> m.key, '[]'::jsonb)) a where me.p ? a)
  )
  select coalesce(array_agg(distinct e), '{}') ||
         case when p_mode = 'w' then array['EmailMessage','EmailTemplate','Reminder']
              else array['CompanyProfile','Collaborator','Branch','EmailAccount','EmailMessage','EmailTemplate','Reminder'] end
    from granted g, jsonb_array_elements_text(g.value -> p_mode) e
$$;
revoke all on function app.resp_entities(text) from public, anon;
grant execute on function app.resp_entities(text) to authenticated;

-- La sottoquery senza riferimenti alla riga viene calcolata una volta per interrogazione, non per record.
create or replace function app.can_read(p_entity text, d jsonb, p_level text, p_uid uuid, p_emp text)
returns boolean language sql stable as $$
  select case p_level
    when 'host' then true
    when 'responsabile' then p_entity <> 'CollaboratorInvite' and p_entity = any((select app.resp_entities('r'))::text[])
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

create or replace function app.can_write(p_entity text, p_level text) returns boolean
language sql stable as $$
  select case p_level
    when 'host' then true
    when 'responsabile' then not (p_entity = any(array[
      'Collaborator','CollaboratorInvite','CompanyProfile','EmailAccount','Branch'
    ])) and p_entity = any((select app.resp_entities('w'))::text[])
    else false
  end
$$;
