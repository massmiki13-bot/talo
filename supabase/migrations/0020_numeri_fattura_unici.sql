-- 0020: due fatture della stessa azienda non possono avere lo stesso numero nello stesso anno (audit B10).
-- Il numero viene proposto dal browser: con due persone al lavoro insieme poteva uscire doppio.
-- Se nei dati esistono già doppioni l'indice non viene creato (la migrazione non fallisce): vanno
-- prima corretti a mano, poi si rilancia questo file.
do $$
begin
  if exists (
    select 1 from public.entity_records
     where entity = 'Invoice' and coalesce(data->>'numero', '') <> ''
     group by tenant_id, data->>'anno', data->>'numero' having count(*) > 1
  ) then
    raise warning 'Numeri di fattura duplicati: indice univoco NON creato. Correggi i doppioni e riesegui 0020.';
  else
    create unique index if not exists entity_records_invoice_number_idx
      on public.entity_records (tenant_id, (data->>'anno'), (data->>'numero'))
      where entity = 'Invoice' and coalesce(data->>'numero', '') <> '';
  end if;
end $$;
