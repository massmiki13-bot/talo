-- Preventivi: listino prezzi (PriceItem) e ricerca del link pubblico.
create or replace function app.entities() returns text[]
language sql immutable as $$
  select array[
    'Branch','Collaborator','CollaboratorInvite','CompanyDocument','CompanyProfile',
    'Contact','ContractTemplate','DailyAttendance','DocumentFolder','EmailAccount',
    'EmailMessage','EmailTemplate','Employee','EmployeeDocument','GeneratedContract',
    'Invoice','PriceItem','Quote','QuoteFormat','ReceivedQuote','Reminder','SavedTemplate',
    'Worksite','WorksitePayment','WorksitePhoto','WorksiteTransaction'
  ]::text[]
$$;

create unique index if not exists entity_records_quote_token_idx
  on public.entity_records ((data->>'public_token'))
  where entity = 'Quote' and data->>'public_token' is not null;

-- Il listino contiene i costi interni: l'operaio non lo vede (già escluso da can_read).
