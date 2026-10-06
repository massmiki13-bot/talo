# Audit di Talo

Audit: 6 ottobre 2026 sul commit `bc3870f` · Correzioni: 14 commit successivi su `master`

## Da fare subito (tu)

Il codice pubblicato funziona anche senza le nuove migrazioni, ma **le correzioni di sicurezza più importanti diventano attive solo quando le applichi** dall'editor SQL di Supabase, in quest'ordine:

| File | Cosa attiva | Attenzione |
|---|---|---|
| `0017_sicurezza_audit.sql` | Blocca il sequestro dell'account (B1), i link malevoli dagli operai (B3), riduce i dati della ditta visibili agli operai (B7) | Nessuna |
| `0018_permessi_responsabile.sql` | I permessi per modulo del responsabile valgono anche nel database (B2) | **Cambia cosa vedono i responsabili esistenti**: da ora solo i dati dei moduli abilitati. La Dashboard mostra zeri per i moduli non abilitati. Controlla i permessi dei tuoi collaboratori prima di applicarla |
| `0019_limiti_e_aggiornamenti_atomici.sql` | Limiti di frequenza condivisi e tetto giornaliero dell'IA (B5, B6), firme del POS che non si sovrascrivono (B9) | Nessuna |
| `0020_numeri_fattura_unici.sql` | Indice univoco sui numeri di fattura (B10) | Se esistono già numeri doppi l'indice non viene creato e compare un avviso: correggi i doppioni e riesegui |

Tutte e quattro sono state applicate e provate su un database Supabase locale con i dati demo, **non sulla produzione**.

Dopo `0017`, controlla che non esistano collaboratori anomali creati in passato:

```sql
select id, tenant_id, data->>'collaborator_user_id' as utente, data->>'host_user_id' as titolare, created_date
from public.entity_records
where entity = 'Collaborator'
  and (data->>'host_user_id' is distinct from tenant_id::text or data->>'collaborator_user_id' = tenant_id::text);
```

Deve restituire zero righe (oppure solo righe vecchie senza `host_user_id`, da verificare a mano).

Facoltativo su Vercel: `AI_DAILY_LIMIT` (predefinito 400 richieste IA al giorno per azienda) e `AI_DAILY_LIMIT_DEMO` (predefinito 40).

## Esito

| Criterio | Prima | Dopo |
|---|---|---|
| Lint | 25 errori | **0 errori** (copre anche `src/lib`, `src/utils`, `src/hooks`, `api`, script, test) |
| Type-check | 2.699 errori | **0 errori**, con ambito ristretto a `src/lib`, `src/utils`, `src/hooks`, `src/api`, `api`; 5 file di disegno PDF/Excel esclusi con `@ts-nocheck` |
| Build | riuscita, 1 avviso | riuscita, 0 avvisi |
| Test | 124 passati | 124 passati + 8 nuovi sulle regole di accesso (girano solo su Supabase locale) |
| Contenuto tagliato su telefono | 7 pagine a 375 px, 10 a 320 px | **0** a 320, 375, 768, 1440, 1920 px (27 pagine) |
| Violazioni axe WCAG 2.2 AA | 211 elementi | **0** su tutte le pagine dell'app, dell'app operai e pubbliche (1440 e 375 px) |
| Lighthouse Accessibilità | 89–100 | **99–100** (vedi tabella) |
| Dipendenze di produzione | 71 | 38 |

### Lighthouse prima → dopo

Build di produzione servita in locale, senza cache del service worker. Valgono come confronto, non come tempi reali.

| Pagina | Prestazioni tel. | Accessibilità tel. | Accessibilità desktop | SEO |
|---|---|---|---|---|
| Login | 90 → 88 | 96 → **100** | 100 → 100 | 91 → 100 |
| Dashboard | 97 → 97 | 92 → **100** | 96 → 100 | 91 → 100 |
| Preventivi | 86 → 84 | 94 → **100** | 95 → 100 | 91 → 100 |
| Editor preventivo | 95 → 95 | 89 → **100** | 90 → 100 | 91 → 100 |
| Dettaglio lavoro | 92 → 92 | 99 → 99 | 99 → 99 | 91 → 100 |
| Presenze | 97 → 97 | 94 → **100** | 95 → 100 | 91 → 100 |

- **Prestazioni**: sostanzialmente invariate. Le differenze di 2 punti rientrano nella variabilità della misura; l'LCP su telefono resta 2,5–4,1 s. I font locali tolgono le richieste a Google ma non hanno accorciato il primo rendering in modo misurabile. Vedi P2 e P3 tra i punti aperti.
- **Buone pratiche**: 96 prima e dopo, per un errore in console introdotto dal metodo di misura (service worker disattivato).
- **Preventivo pubblico**: la misura in locale colpisce lo stato «link non valido», perché l'anteprima non serve `/api`. Accessibilità era 94; la causa segnalata (mancava `<main>`) è corretta ma **non è stata rimisurata con Lighthouse**; axe sulla pagina reale dà 0 violazioni. SEO scende a 63 di proposito: quelle pagine ora sono escluse dai motori di ricerca.

### Cosa non è stato possibile provare

Assistente IA (manca la chiave Gemini), invio e ricezione email, uso offline dell'app installata, esportazioni PDF/Excel/FatturaPA, dispositivi reali, e tutto ciò che dipende da Vercel (intestazioni di sicurezza, cron). Le modifiche in queste aree sono verificate solo con build, lint e lettura del codice. **Dopo la pubblicazione conviene provare a mano**: anteprime PDF nei dialoghi (per le nuove intestazioni), invio di un'email, lettura di un DDT con l'IA dall'app operai.

## Decisioni prese senza la tua risposta

Avevi sette domande aperte; con «risolvi tutto» ho applicato le opzioni consigliate. Dimmi se qualcuna va cambiata.

1. **Permessi del responsabile nel database**: sì, con la mappa in `0018`. Più stretta di quella proposta su un punto: la **Dashboard non dà accesso a nulla da sola**. Posta e promemoria restano sempre disponibili ai responsabili, come oggi.
2. **Type-check**: ambito ristretto (opzione a).
3. **Aree di tocco**: 44 px solo con puntatore touch.
4. **Grigi**: unificati su `zinc`.
5. **Preventivo salvato senza cliente**: lasciato com'è (trattato come bozza).
6. **`api/system-email`**: eliminato.
7. **Miglioramenti**: fatti M1 (in parte), M2, M4 (in parte), M7. Non fatti M3, M5, M6, M8.

---

## Problemi trovati e stato

**Verificato** = riprodotto sul database o nel browser locale. Stato: ✅ corretto · 🟡 corretto in parte · ⬜ aperto.

### 1. Backend, API, data layer

| ID | Gravità | Problema | Dove | Stato |
|---|---|---|---|---|
| B1 | Critica | Qualsiasi account poteva creare un record `Collaborator` che puntava a un altro utente, estromettendolo dalla propria azienda. Verificato. | `0001_init.sql` (`app.ctx`, `entity_create`, `entity_update`) | ✅ `0017`: il record si crea solo dal server e non cambia utente né azienda; test automatico |
| B2 | Alta | I permessi per modulo del responsabile valevano solo nell'interfaccia. Verificato. | `0001_init.sql` (`can_read`, `can_write`) | ✅ `0018`; test automatico |
| B3 | Alta | Un operaio poteva salvare un link `javascript:` che il titolare apriva. Verificato. | `0015`, `WorksiteTransactions.jsx`, `WorksiteMaterials.jsx` | ✅ `0017` accetta solo file dell'archivio della propria azienda; il browser blocca i link `javascript:`/`data:` (`src/lib/privateFiles.js`) |
| B4 | Alta | `api/system-email` inviava email libere dalla casella di Talo per chiunque avesse un account. | `api/system-email.js` | ✅ endpoint eliminato |
| B5 | Alta | Assistente IA senza limiti di spesa, anche per la demo pubblica. | `api/llm.js` | ✅ tetto giornaliero per azienda (attivo con `0019`) |
| B6 | Media | Limiti di frequenza solo in memoria per istanza. | `api/_lib/server.js` | ✅ contatore sul database (`0019`), con quello in memoria come riserva |
| B7 | Media | L'operaio leggeva l'intero profilo ditta (IBAN, obiettivo di fatturato). Verificato. | `0012`, `app.redact` | ✅ `0017`; test automatico |
| B8 | Media | Nessuna intestazione di sicurezza. | `vercel.json` | 🟡 aggiunte `nosniff`, `Referrer-Policy`, `frame-ancestors 'self'`, `Permissions-Policy`. Manca una Content-Security-Policy completa su script e stili: richiede prove su Vercel |
| B9 | Media | Aggiornamenti leggi-poi-scrivi: due firme del POS insieme si sovrascrivevano. | `api/_lib/sign.js`, `server.js`, `mailbox.js`, `quote-public.js` | ✅ funzioni atomiche (`0019`); verificato con 4 firme simultanee, 4 salvate |
| B10 | Media | Numeri di fattura e preventivo calcolati nel browser, senza unicità. | `src/lib/invoices.js`, `src/utils/quoteNumbering.js` | 🟡 fatture: indice univoco (`0020`) e nuovo tentativo in caso di conflitto. Preventivi invariati (le revisioni condividono il numero) |
| B11 | Media | Una semplice GET segnava il preventivo come «visto» (anteprime di WhatsApp). | `api/quote-public.js` | ✅ lo segna la pagina dopo essersi aperta; verificato |
| B12 | Media | La demo consegna una sessione completa. | `api/account.js` | 🟡 la password si ripristina da sola a ogni accesso demo e l'IA ha un tetto basso. I caricamenti di file dalla demo restano possibili |
| B13 | Bassa | Mittente di un'email non filtrato in una ricerca PostgREST. | `api/_lib/mailbox.js` | ✅ |
| B14 | Bassa | Errori interni mostrati al client. Verificato. | `api/mail-attachment.js`, `quote-public.js`, `server.js` | ✅ 400 per input non valido, messaggio generico per i 5xx |
| B15 | Bassa | Record inesistente → HTTP 500. Verificato. | `0001_init.sql` | ✅ `0017`: 404 |
| B16 | Bassa | Dipendenze con avvisi (12). | `package.json` | ⬜ invariati: `react-router` è già all'ultima 6.x e la correzione richiede la 7; `react-quill` non ha una versione corretta; il resto è la catena di build di Tailwind 3 |
| B17 | Bassa | Le immagini remote nelle email rivelavano l'apertura al mittente. | `MessageView.jsx` | ✅ bloccate finché non si preme «Mostra immagini» (non provato con email reali) |

### 2. Funzionalità

| ID | Gravità | Problema | Stato |
|---|---|---|---|
| F1 | Alta | Pagina bianca per un responsabile senza il permesso «Dashboard». Verificato. | ✅ va alla prima sezione abilitata; verificato |
| F2 | Media | Errori di caricamento invisibili (115 `catch` vuoti; Dashboard, Analisi, Presenze mostrano zeri). | ⬜ serve uno stato di errore comune (M3) |
| F3 | Media | Registrazione: sempre «inserisci il codice», anche per email già registrate. | ✅ (da codice; la conferma via email non è attiva in locale) |
| F4 | Media | Ruolo non caricabile → interfaccia da titolare. | ✅ schermata con «Riprova» |
| F5 | Media | Validazione solo con avviso a comparsa. Verificato. | 🟡 modulo contatto: campo evidenziato e messo a fuoco. Gli altri moduli (dipendente, lavoro, mezzo, fattura) usano ancora solo l'avviso |
| F6 | Media | Circa 30 `confirm()` del browser. | ✅ 43 conferme passate a un dialogo dell'app; verificato su una spesa di cantiere |
| F7 | Bassa | «Lavoro collegato:» senza nome. Verificato. | ✅ |
| F8 | Bassa | Preventivo nuovo salvato senza cliente. | ⬜ lasciato com'è (decisione 5) |
| F9 | Bassa | Avvisi di conferma di 2 secondi. | ✅ 4 s, errori 7 s |
| F10 | Bassa | Un errore in una pagina bloccava tutta l'app. | ✅ confinato alla pagina, si azzera cambiando sezione |
| F11 | Bassa | «Ctrl K» anche su Mac. | ✅ |
| F12 | Bassa | Suggerimento della festività sovrascritto. | ✅ |

### 3. Frontend, codice

| ID | Gravità | Problema | Stato |
|---|---|---|---|
| C1 | Alta | Type-check inutilizzabile (2.699 errori). | 🟡 0 errori nell'ambito ristretto; pagine e componenti restano fuori dal controllo |
| C2 | Media | Lint: 25 errori, copertura parziale. | ✅ 0 errori su tutto il progetto; restano 112 avvisi (variabili inutilizzate, dipendenze degli effetti) |
| C3 | Media | Dipendenze e componenti `ui` inutilizzati. | ✅ rimosse 35 dipendenze e 27 componenti |
| C4 | Media | React Query installato ma mai usato. | ⬜ (M3) |
| C5 | Media | Pagine da 600–800 righe. | ⬜ |
| C6 | Bassa | `Node.prototype.removeChild`/`insertBefore` modificati globalmente. | ⬜ non toccato: toglierlo senza poter riprodurre il difetto originale è un rischio |
| C7 | Bassa | Logica duplicata tra server e browser. | ⬜ |
| C8 | Bassa | Codice morto. | 🟡 rimosso quello di autenticazione; `legacy/base44` resta |
| C9 | Bassa | Nessun test su regole SQL, nessuna CI. | 🟡 8 test sulle regole di accesso (`tests/access-rules.local.test.js`). Nessuna CI: per pubblicare un workflow serve un permesso che non ho verificato |

### 4. Responsiveness

| ID | Gravità | Problema | Stato |
|---|---|---|---|
| R1 | Alta | Contenuto tagliato a destra su telefono, mascherato da `overflow-x: clip`. Verificato su Lavori, Mezzi, Posta, Fatture, Sicurezza, dettaglio lavoro, Analisi. | ✅ 0 elementi oltre il bordo a 320, 375, 768 px. `overflow-x: clip` resta come rete di sicurezza |
| R2 | Media | Aree di tocco sotto i 44 px. | 🟡 pulsanti, campi e menu a 44 px con puntatore touch. Restano sotto soglia link nel testo, caselle di spunta, cursori, e i pulsanti di stato della giornaliera (36 px di larghezza) |
| R3 | Bassa | Schede scorrevoli tagliate senza indizio. | ⬜ |
| R4 | Bassa | A 768 px si usa il layout da telefono. | ⬜ |
| R5 | Bassa | Intestazione della Dashboard a tutto schermo su telefono; doppio «Salva» nell'editor preventivo. | ⬜ |

### 5. Accessibilità (WCAG 2.2 AA)

| ID | Gravità | Problema | Stato |
|---|---|---|---|
| A1 | Alta | Avvisi a comparsa non annunciati. | ✅ `role="status"`/`"alert"` |
| A2 | Alta | 69 pulsanti senza nome. | ✅ |
| A3 | Alta | 52 campi senza etichetta. | ✅ i campi si collegano all'etichetta visibile vicina (`src/lib/autoLabel.js`), più etichette esplicite sui filtri |
| A4 | Media | Contrasto insufficiente. | ✅ |
| A5 | Media | Errori di accesso non annunciati. | ✅ |
| A6 | Media | Titolo della scheda sempre «Talo». | ✅ |
| A7 | Media | Righe cliccabili solo con il mouse. | 🟡 elenchi di Contatti, Dipendenti, Lavori, Preventivi apribili con Invio. Le celle del riepilogo ore restano solo mouse |
| A8 | Media | Menu «Altro» su telefono non era un dialogo. | ✅ (da codice: Esc e blocco del focus non provati su dispositivo) |
| A9 | Bassa | Difetti di struttura. | 🟡 corretti elenco di definizioni, grafico, tabellone ore, bersagli piccoli. Restano l'ordine dei titoli nel dettaglio lavoro e le intestazioni di tabella in Preventivi (segnalati da Lighthouse) |
| A10 | Bassa | Preventivo pubblico senza `<main>`. | ✅ |

I controlli automatici coprono una parte dei criteri WCAG: non sostituiscono una prova con lettore di schermo, che non è stata fatta.

### 6. Design

| ID | Gravità | Problema | Stato |
|---|---|---|---|
| D1 | Media | Due scale di grigi mescolate. | ✅ 1.735 classi `slate` → `zinc` |
| D2 | Media | Conferme del browser. | ✅ (F6) |
| D3 | Bassa | Testi a 8–11 px con valori liberi. | ⬜ |
| D4 | Bassa | Colore del pulsante principale riscritto 51 volte. | ⬜ |
| D5 | Bassa | Punto decimale nei campi numerici. | ⬜ |

### 7. Performance e SEO

| ID | Gravità | Problema | Stato |
|---|---|---|---|
| P1 | Media | Font da Google con `@import`. | ✅ serviti dall'app (`@fontsource/barlow`, `@fontsource/barlow-condensed`) |
| P2 | Media | Blocco iniziale pesante. | 🟡 da 526 a 466 kB togliendo gli schemi delle entità dal pacchetto. Nessun effetto misurabile sul punteggio |
| P3 | Media | Dashboard e Analisi caricano migliaia di record; filtri valutati riga per riga. | ⬜ (M5) |
| P4 | Bassa | Firme salvate come immagine dentro il record. | ⬜ |
| P5 | Bassa | Niente `robots.txt`, pagine con token indicizzabili. | 🟡 `robots.txt` e `noindex` sulle pagine con token. Nessuna anteprima Open Graph |
| P6 | Bassa | Nessuna source map. | ⬜ pubblicarle le renderebbe scaricabili da chiunque: serve un servizio che le tenga private |
| P7 | Bassa | Spostamento del layout in Preventivi su telefono (0,078 → 0,064). | ⬜ |

---

## Prossimi passi consigliati

1. **Applicare le quattro migrazioni** e fare il controllo SQL sui collaboratori.
2. **Provare a mano dopo la pubblicazione** ciò che non ho potuto verificare: anteprime PDF, invio email, IA dall'app operai, app installata offline.
3. **F2 + M3**: stato di errore comune con «Riprova», adottando React Query da Dashboard, Preventivi, Lavori, Contatti. È il punto aperto che pesa di più sul criterio «ogni azione ha stati chiari».
4. **P3 + M5**: riepiloghi calcolati dal database per Dashboard e Analisi, prima che i dati reali crescano.
5. **M6**: verifica in due passaggi per i titolari.
6. **CI** con lint, type-check, test e build, e il controllo automatico dei layout (M8).
7. **B8**: Content-Security-Policy completa, partendo in modalità solo-report.
8. **F5**: errori accanto al campo negli altri moduli.

## Come rifare le verifiche

```bash
npm run lint && npm run typecheck && npm test && npm run build
# regole di accesso, su Supabase locale con le migrazioni applicate:
TALO_TEST_SUPABASE_URL=http://127.0.0.1:54321 TALO_TEST_PUBLISHABLE_KEY=… TALO_TEST_SECRET_KEY=… npm test
```
