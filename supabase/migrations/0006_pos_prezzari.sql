-- Prezzari (listini ufficiali regionali/comunali o di ditta), loro voci e Piani Operativi di Sicurezza (POS).
create or replace function app.entities() returns text[]
language sql immutable as $$
  select array[
    'Branch','Collaborator','CollaboratorInvite','CompanyDocument','CompanyProfile',
    'Contact','ContractTemplate','DailyAttendance','DocumentFolder','EmailAccount',
    'EmailMessage','EmailTemplate','Employee','EmployeeDocument','GeneratedContract',
    'Invoice','PriceItem','Quote','QuoteFormat','ReceivedQuote','Reminder','SavedTemplate',
    'Worksite','WorksiteLog','WorksitePayment','WorksitePhoto','WorksiteTransaction',
    'Prezzario','PrezzarioVoce','SafetyPlan'
  ]::text[]
$$;

-- Le ricerche nelle voci del prezzario filtrano per prezzario: indice dedicato.
create index if not exists entity_records_prezzario_voce_idx
  on public.entity_records (tenant_id, (data->>'prezzario_id'))
  where entity = 'PrezzarioVoce';
