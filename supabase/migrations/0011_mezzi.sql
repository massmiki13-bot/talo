-- Mezzi e attrezzature (revisioni, assicurazioni, manutenzioni, assegnazione a cantieri e persone).
create or replace function app.entities() returns text[]
language sql immutable as $$
  select array[
    'Branch','Collaborator','CollaboratorInvite','CompanyDocument','CompanyProfile',
    'Contact','ContractTemplate','DailyAttendance','DocumentFolder','EmailAccount',
    'EmailMessage','EmailTemplate','Employee','EmployeeDocument','GeneratedContract',
    'Invoice','PriceItem','Quote','QuoteFormat','ReceivedQuote','Reminder','SavedTemplate',
    'Worksite','WorksiteLog','WorksitePayment','WorksitePhoto','WorksiteTransaction',
    'Prezzario','PrezzarioVoce','SafetyPlan','ClockEvent','Equipment'
  ]::text[]
$$;
