-- Liste "leggere": come entity_list (stessi permessi, filtri e oscuramenti) ma restituiscono solo i campi
-- richiesti. Le pagine elenco non scaricano più righe di preventivi, testi di contratti o email per intero.
create or replace function public.entity_list_fields(
  p_entity text,
  p_fields text[],
  p_filter jsonb default '{}'::jsonb,
  p_sort text default '-created_date',
  p_limit int default null,
  p_skip int default 0
) returns setof jsonb
language sql stable security definer set search_path = public, app as $$
  select coalesce(
           (select jsonb_object_agg(k, d -> k)
              from unnest(array_cat(coalesce(p_fields, '{}'), array['id', 'created_date', 'updated_date', 'created_by_id'])) k
             where d ? k),
           '{}'::jsonb)
    from public.entity_list(p_entity, p_filter, p_sort, p_limit, p_skip) d
$$;
grant execute on function public.entity_list_fields(text, text[], jsonb, text, int, int) to authenticated;

-- Indici per i collegamenti più usati nelle pagine e nei calcoli.
create index if not exists entity_records_worksite_idx
  on public.entity_records (tenant_id, entity, (data->>'worksite_id'));
create index if not exists entity_records_employee_idx
  on public.entity_records (tenant_id, entity, (data->>'dipendente_id'));
create index if not exists entity_records_data_date_idx
  on public.entity_records (tenant_id, entity, (data->>'data'));
