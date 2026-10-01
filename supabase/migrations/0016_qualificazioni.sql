-- 0016: qualificazioni dell'impresa (attestazione SOA, certificazione ISO 9001).
-- Accesso: come le altre entità operative (titolare e responsabili); gli operai non le vedono.
create or replace function app.entities() returns text[]
language sql immutable as $$
  select array[
    'Branch','Collaborator','CollaboratorInvite','CompanyDocument','CompanyProfile',
    'Contact','ContractTemplate','DailyAttendance','DocumentFolder','EmailAccount',
    'EmailMessage','EmailTemplate','Employee','EmployeeDocument','GeneratedContract',
    'Invoice','PriceItem','Quote','QuoteFormat','ReceivedQuote','Reminder','SavedTemplate',
    'Worksite','WorksiteLog','WorksitePayment','WorksitePhoto','WorksiteTransaction',
    'Prezzario','PrezzarioVoce','SafetyPlan','ClockEvent','Equipment',
    'Segnalazione','Richiesta','Avviso','Qualificazione'
  ]::text[]
$$;
