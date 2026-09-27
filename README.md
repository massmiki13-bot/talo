# Talo

Gestionale per imprese edili e di impianti: preventivi, cantieri, dipendenti,
presenze, contratti, promemoria, email e analisi.

## Architettura

| Parte | Tecnologia |
|---|---|
| Interfaccia | React 18 + Vite + Tailwind (`src/`) |
| Database, login, file | Supabase (progetto `dvphtmdzktrkwsrjdxdq`, regione EU) |
| Funzioni server | Vercel Functions (`api/`) — in locale le serve Vite |
| AI | Google Gemini (`api/llm.js`) |
| Posta | Invio SMTP e ricezione IMAP di email e PEC delle aziende (`api/_lib/mailbox.js`), casella di sistema per gli avvisi |
| Promemoria giornalieri | Vercel Cron → `api/cron-reminders.js` (8:00 ora italiana) |

### Dati

Le 24 entità (`schema/entities/*.jsonc`) sono salvate in `public.entity_records`
come documenti JSON. Il browser non accede mai alla tabella: usa le funzioni
`entity_*` di `supabase/migrations/0001_init.sql`, che applicano

- **isolamento per azienda**: ogni titolare vede solo i propri dati;
- **ruoli collaboratore**: `responsabile` (tutto tranne impostazioni ditta e
  collaboratori) e `operaio` (solo proprie ore, propri documenti, nessun importo).

Le password SMTP stanno in `public.email_secrets`, mai leggibili dal browser.

## Sviluppo locale

```bash
npm install
cp .env.example .env.local   # poi compila i valori
npm run dev -- --port 5330
```

## Variabili d'ambiente

Vedi `.env.example`. Le `VITE_*` sono pubbliche; tutte le altre sono segrete e
vanno impostate anche su Vercel (Project → Settings → Environment Variables).

## Database

Le migrazioni sono in `supabase/migrations/`. Si applicano dall'editor SQL di
Supabase (o con `supabase db push`).

## Collaudo

```bash
node scripts/smoke-test.mjs   # dati, permessi, inviti, file, AI
node scripts/mail-test.mjs    # posta: invio, ricezione, allegati, bozze
```

Per provare la versione online: `APP_BASE=https://talo-kohl.vercel.app`. In locale l'antivirus può bloccare IMAP/SMTP cifrati (errore di certificato): il collaudo della posta va fatto online.

## Cartelle

- `api/` — funzioni server (un file = un endpoint `/api/<nome>`)
- `schema/entities/` — definizione campi e valori predefiniti delle entità
- `supabase/` — schema del database e regole di accesso
- `legacy/base44/` — codice originale Base44, solo come riferimento
