# Talo — note per Claude

Leggi `README.md` per architettura e comandi.

- Il frontend accede ai dati solo tramite `src/api/client.js` (`api.entities.X...`)
  o `src/lib/db.js`. Non chiamare mai direttamente la tabella `entity_records`.
- Le regole di accesso stanno nel database (`supabase/migrations/`): ogni nuova
  entità va aggiunta a `app.entities()` e, se serve, a `app.can_read`/`app.can_write`.
- Modifiche allo schema = nuova migrazione numerata, mai editare quelle già applicate.
- Le funzioni in `api/` usano il client di servizio (`admin()`): verificare sempre
  prima l'utente con `requireUser` e filtrare per `tenantId`.
- Mai stampare o committare chiavi: stanno in `.env.local` (ignorato da git) e su Vercel.
- Testi dell'interfaccia in italiano.
- Dev server: voce `talo` in `.claude/launch.json`, porta 5330.
