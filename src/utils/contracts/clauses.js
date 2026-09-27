// Clausole di chiusura standard — il marker §N indica il livello minimo
// della variante in cui la clausola appare (1=min, 2=med, 3=pro)

export const _FORO = `§1
ART. – FORO COMPETENTE
Per ogni controversia derivante dal presente contratto o ad esso connessa, le parti eleggono domicilio presso la sede di {{DITTA}} e convengono che sarà competente in via esclusiva il Foro di {{CITTA_DITTA}}, ferma restando la competenza del Giudice del luogo di esecuzione dell'obbligazione principale ai sensi dell'art. 29 del Codice di Procedura Civile.`;

export const _DATI = `§2
ART. – TRATTAMENTO DEI DATI PERSONALI
Ai sensi del Regolamento (UE) 2016/679 (GDPR) e del Codice in materia di protezione dei dati personali (D.Lgs. 196/2003 e s.m.i.), ciascuna parte dichiara di essere informata in ordine alle finalità e alle modalità del trattamento dei dati personali raccolti tramite il presente contratto, che verranno trattati esclusivamente per le finalità di esecuzione del rapporto contrattuale e per gli adempimenti di legge. Il titolare del trattamento è {{DITTA}}, con sede in {{SEDE}}. L'interessato potrà esercitare in qualsiasi momento i diritti riconosciutigli dalla normativa vigente.`;

export const _RISOLUZIONE = `§2
ART. – RISOLUZIONE DEL CONTRATTO
Il presente contratto potrà essere risolto da ciascuna delle parti in caso di inadempimento dell'altra parte, ai sensi e con le modalità previste dall'art. 1454 del Codice Civile, mediante diffida ad adempiere con concessione di un termine non inferiore a quindici giorni. Le parti convengono altresì che il contratto si intenderà risolto di diritto, senza necessità di ulteriore dichiarazione, qualora ricorrano le ipotesi di risoluzione espressa previste dalla legge o dal presente contratto.`;

export const _NORMATIVA = `§1
ART. – NORME APPLICABILI E RINVIO
Per quanto non espressamente disciplinato dal presente contratto, le parti si rimettono alle norme del Codice Civile e della legislazione vigente in materia. Il presente contratto costituisce l'integrale espressione dell'accordo intervenuto tra le parti e sostituisce ogni precedente intesa, verbale o scritta, sull'argomento. Eventuali modifiche o integrazioni saranno efficaci solo se redatte per iscritto e sottoscritte da entrambe le parti.`;

export const _AVVISO = `§1
NOTA: Il presente documento è una bozza generata automaticamente a scopo operativo e costituisce una base di discussione tra le parti. Prima della sottoscrizione si raccomanda la verifica e l'adattamento da parte di un professionista abilitato (consulente del lavoro, avvocato o esperto del settore), con particolare riguardo alla normativa vigente, al CCNL applicabile e ai requisiti di forma e sostanza previsti dalla legge.`;

export const _NOTE_OPT = `§1
{{#if NOTE_AGGIUNTIVE}}
ART. – NOTE E CONDIZIONI AGGIUNTIVE
{{NOTE_AGGIUNTIVE}}
{{/if}}`;

export const _RISERV_OPT = `§1
{{#if PATTO_RISERVATEZZA}}
ART. – PATTO DI RISERVATEZZA
{{PATTO_RISERVATEZZA}}
{{/if}}`;

// Blocchi firma
const _sign = (labelA, labelB) => `§1
{{#if LUOGO_STIPULA}}{{LUOGO_STIPULA}}, {{/if}}{{DATA_CONTRATTO}}`;

export const _SIGN_LAVORATORE = _sign("Il Datore di Lavoro", "Il/La Lavoratore/Lavoratrice");
export const _SIGN_COMMITTENTE = _sign("Il Committente", "Il/La Prestatore/Prestatrice");
export const _SIGN_COLLABORATORE = _sign("Il Committente", "Il/La Collaboratore/Collaboratrice");
export const _SIGN_APPALTATORE = _sign("Il Committente", "L'Appaltatore");
export const _SIGN_SUBAPPALTATORE = _sign("L'Appaltatore principale", "Il Subappaltatore");
export const _SIGN_FORNITORE = _sign("Il Fornitore", "Il Cliente");
export const _SIGN_CONCEDENTE = _sign("Il Concedente", "Il Beneficiario");
export const _SIGN_NDA = _sign("La Parte A", "La Parte B");
export const _SIGN_INCARICO = _sign("Il Committente", "L'Incaricato/a");
export const _SIGN_VERBALE = _sign("La Parte 1", "La Parte 2");

// Clausole facoltative aggiuntive (comuni a tutti i contratti)
export const _FORZAMAGGIORE_OPT = `§1
{{#if FORZA_MAGGIORE}}
ART. – CASO FORTUITO E FORZA MAGGIORE
Nessuna delle parti sarà responsabile per inadempimento derivante da causa di forza maggiore o caso fortuito, quali a titolo esemplificativo e non esaustivo: eventi naturali eccezionali, epidemie, provvedimenti dell'autorità, scioperi generali, guerre, sommosse. La parte che invoca la forza maggiore dovrà darne tempestiva comunicazione all'altra parte e adoperarsi per limitare i conseguenti danni. Ove l'evento persista per oltre 90 giorni, ciascuna parte potrà recedere dal contratto senza alcun onere.
{{/if}}`;

export const _SOSPENSIONE_OPT = `§1
{{#if SOSPENSIONE_CONTRATTO}}
ART. – SOSPENSIONE DEL CONTRATTO
{{SOSPENSIONE_CONTRATTO}}
{{/if}}`;

export const _RECESSO_OPT = `§1
{{#if DIRITTO_RECESSO}}
ART. – DIRITTO DI RECESSO
{{DIRITTO_RECESSO}}
{{/if}}`;

export const _COMUNICAZIONI_OPT = `§1
{{#if COMUNICAZIONI_PARTI}}
ART. – COMUNICAZIONI TRA LE PARTI
{{COMUNICAZIONI_PARTI}}
{{/if}}`;

export const _SPESE_ACC_OPT = `§1
{{#if SPESE_ACCESSORIE}}
ART. – SPESE E ONERI ACCESSORI
{{SPESE_ACCESSORIE}}
{{/if}}`;

export const _SOPRAVV_OPT = `§1
{{#if SOPRAVVENIENZE_NORMATIVE}}
ART. – SOPRAVVENIENZE NORMATIVE
{{SOPRAVVENIENZE_NORMATIVE}}
{{/if}}`;

// Clausole facoltative lavoro
export const _MALATTIA_OPT = `§1
{{#if MALATTIA_INFORTUNIO}}
ART. – MALATTIA E INFORTUNIO
{{MALATTIA_INFORTUNIO}}
{{/if}}`;

export const _FERIE_OPT = `§1
{{#if ASSENZE_FERIE}}
ART. – FERIE, PERMESSI E ASSENZE
{{ASSENZE_FERIE}}
{{/if}}`;

export const _PROVE_QUAL_OPT = `§1
{{#if PROVE_QUALIFICA}}
ART. – PROVE DI QUALIFICA
{{PROVE_QUALIFICA}}
{{/if}}`;