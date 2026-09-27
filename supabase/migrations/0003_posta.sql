-- Posta: messaggi inviati/ricevuti (EmailMessage).
create or replace function app.entities() returns text[]
language sql immutable as $$
  select array[
    'Branch','Collaborator','CollaboratorInvite','CompanyDocument','CompanyProfile',
    'Contact','ContractTemplate','DailyAttendance','DocumentFolder','EmailAccount',
    'EmailMessage','EmailTemplate','Employee','EmployeeDocument','GeneratedContract',
    'Invoice','Quote','QuoteFormat','ReceivedQuote','Reminder','SavedTemplate',
    'Worksite','WorksitePayment','WorksitePhoto','WorksiteTransaction'
  ]::text[]
$$;

create index if not exists entity_records_email_msg_idx
  on public.entity_records ((data->>'account_id'), (data->>'imap_uid'))
  where entity = 'EmailMessage';
