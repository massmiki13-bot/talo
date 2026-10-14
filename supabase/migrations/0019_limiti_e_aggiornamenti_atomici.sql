-- 0019: limiti di frequenza condivisi tra le istanze del server (audit B5, B6) e aggiornamenti
-- atomici dei documenti fatti dalle funzioni server (audit B9).
-- Le funzioni qui sotto sono riservate al server (service_role): il browser non può chiamarle.

create table if not exists public.rate_counters (
  key          text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (key, window_start)
);
alter table public.rate_counters enable row level security;
revoke all on public.rate_counters from anon, authenticated;

-- Conta una richiesta nella finestra corrente e dice se è entro il limite.
create or replace function public.rate_hit(p_key text, p_max int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / greatest(p_window_seconds, 1)) * greatest(p_window_seconds, 1));
  n int;
begin
  insert into public.rate_counters as rc (key, window_start, count) values (left(p_key, 200), w, 1)
  on conflict (key, window_start) do update set count = rc.count + 1
  returning count into n;
  if random() < 0.02 then
    delete from public.rate_counters where window_start < now() - interval '2 days';
  end if;
  return n <= p_max;
end $$;
revoke all on function public.rate_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_hit(text, int, int) to service_role;

-- Unisce p_patch al documento in un'unica istruzione (niente «leggi e poi riscrivi»).
create or replace function public.server_patch_record(p_id uuid, p_patch jsonb) returns jsonb
language sql security definer set search_path = public as $$
  update public.entity_records set data = data || coalesce(p_patch, '{}'::jsonb), updated_date = now()
   where id = p_id
  returning data
$$;
revoke all on function public.server_patch_record(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.server_patch_record(uuid, jsonb) to service_role;

-- Aggiunge (o sostituisce, per lo stesso firmatario e la stessa revisione) una firma di presa visione
-- del POS: due firme arrivate insieme non si sovrascrivono più.
create or replace function public.server_add_pos_signature(p_id uuid, p_firma jsonb) returns jsonb
language sql security definer set search_path = public as $$
  update public.entity_records
     set data = jsonb_set(data, '{firme_raccolte}',
           coalesce((select jsonb_agg(f) from jsonb_array_elements(coalesce(data->'firme_raccolte', '[]'::jsonb)) f
                      where not (f->>'firmatario_id' = p_firma->>'firmatario_id' and f->'revisione' = p_firma->'revisione')), '[]'::jsonb)
           || jsonb_build_array(p_firma)),
         updated_date = now()
   where id = p_id and entity = 'SafetyPlan'
  returning data
$$;
revoke all on function public.server_add_pos_signature(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.server_add_pos_signature(uuid, jsonb) to service_role;
