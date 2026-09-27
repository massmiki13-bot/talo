-- L'operaio non deve ricevere dati economici: togliamo anche il costo orario
-- dalla sua scheda dipendente (prima era nascosto solo dall'interfaccia).
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
    else d
  end
$$;
