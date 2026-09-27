import { _FORO, _DATI, _RISOLUZIONE, _NORMATIVA, _AVVISO, _NOTE_OPT,
  _FORZAMAGGIORE_OPT, _SOSPENSIONE_OPT, _RECESSO_OPT, _COMUNICAZIONI_OPT, _SPESE_ACC_OPT, _SOPRAVV_OPT,
  _MALATTIA_OPT, _FERIE_OPT, _PROVE_QUAL_OPT,
  _SIGN_LAVORATORE, _SIGN_COMMITTENTE, _SIGN_COLLABORATORE } from "./clauses";

// Clausole facoltative lavoro (§1, appaiono solo se il campo è compilato)
const _BENEFIT_OPT = `§1
{{#if BENEFIT}}
ART. – BENEFIT
Il/La lavoratore/lavoratrice avrà diritto ai seguenti benefit: {{BENEFIT}}.
{{/if}}`;
const _STRAORD_OPT = `§1
{{#if STRAORDINARI}}
ART. – STRAORDINARI
Gli straordinari sono disciplinati come segue: {{STRAORDINARI}}, nel rispetto dei limiti di legge e del CCNL applicabile.
{{/if}}`;
const _TRASFERTE_OPT = `§1
{{#if TRASFERTE_RIMBORSI}}
ART. – TRASFERTE E RIMBORSI
Le trasferte e i relativi rimborsi sono disciplinati come segue: {{TRASFERTE_RIMBORSI}}.
{{/if}}`;
const _RISERV_OPT = `§1
{{#if PATTO_RISERVATEZZA}}
ART. – PATTO DI RISERVATEZZA
{{PATTO_RISERVATEZZA}}
{{/if}}`;
const _NONCONC_OPT = `§1
{{#if PATTO_NON_CONCORRENZA}}
ART. – PATTO DI NON CONCORRENZA
{{PATTO_NON_CONCORRENZA}}
{{/if}}`;
const _SMART_OPT = `§1
{{#if SMART_WORKING}}
ART. – SMART WORKING
Lo smart working è disciplinato come segue: {{SMART_WORKING}}.
{{/if}}`;
const _CL_ELASTICHE_OPT = `§1
{{#if CLAUSOLE_ELASTICHE}}
ART. – CLAUSOLE ELASTICHE/FLESSIBILI
{{CLAUSOLE_ELASTICHE}}
{{/if}}`;

export const schemasLavoro = {
  determinato: {
    title: "Contratto di Lavoro Subordinato a Tempo Determinato",
    required: ["NOME_CONTROPARTE", "CF_CONTROPARTE", "DATA_NASCITA", "DATA_INIZIO", "DATA_FINE", "MANSIONE", "LIVELLO", "CCNL_APPLICABILE", "LUOGO_LAVORO", "ORE_SETTIMANALI", "RETRIBUZIONE"],
    optional: ["LUOGO_NASCITA", "INDIRIZZO_CONTROPARTE", "GIORNI_PROVA", "CAUSALE_TERMINE", "DISTRIBUZIONE_ORARIO", "MODALITA_PAGAMENTO", "IBAN_PAGAMENTO", "BENEFIT", "STRAORDINARI", "TRASFERTE_RIMBORSI", "PATTO_RISERVATEZZA", "SMART_WORKING", "LUOGO_STIPULA", "DATA_CONTRATTO", "NOTE_AGGIUNTIVE", "FORZA_MAGGIORE", "SOSPENSIONE_CONTRATTO", "DIRITTO_RECESSO", "COMUNICAZIONI_PARTI", "SPESE_ACCESSORIE", "SOPRAVVENIENZE_NORMATIVE", "MALATTIA_INFORTUNIO", "ASSENZE_FERIE", "PROVE_QUALIFICA"],
    body: `§1
CONTRATTO DI LAVORO SUBORDINATO A TEMPO DETERMINATO

TRA

{{DITTA}}, con sede legale in {{SEDE}}, Partita IVA {{PIVA}}, in persona del legale rappresentante pro tempore (di seguito, "Datore di Lavoro");

E

Il/La Sig./Sig.ra {{NOME_CONTROPARTE}}{{#if DATA_NASCITA}}, nato/a {{#if LUOGO_NASCITA}}a {{LUOGO_NASCITA}} {{/if}}il {{DATA_NASCITA}}{{/if}}{{#if CF_CONTROPARTE}}, codice fiscale {{CF_CONTROPARTE}}{{/if}}{{#if INDIRIZZO_CONTROPARTE}}, residente in {{INDIRIZZO_CONTROPARTE}}{{/if}} (di seguito, "Lavoratore/Lavoratrice");

§1
PREMESSO CHE

Il Datore di Lavoro intende assumere il/la Lavoratore/Lavoratrice con contratto a tempo determinato per lo svolgimento della mansione di seguito indicata. Le parti dichiarano di aver verificato l'insussistenza delle condizioni ostative all'assunzione a termine previste dalla normativa vigente.

§1
TUTTO CIÒ PREMESSO, SI CONVIENE E SI STIPULA QUANTO SEGUE

§1
ART. 1 – OGGETTO E DURATA
Il/La Lavoratore/Lavoratrice viene assunto/a dal Datore di Lavoro con contratto di lavoro subordinato a tempo determinato, con effetto dal {{DATA_INIZIO}}{{#if DATA_FINE}} e fino al {{DATA_FINE}}{{/if}}, per lo svolgimento della mansione di {{MANSIONE}}. Il rapporto si conclude automaticamente alla scadenza, senza necessità di preavviso.
{{#if CAUSALE_TERMINE}}
La causale del termine, ai sensi della normativa vigente, è la seguente: {{CAUSALE_TERMINE}}.
{{/if}}
§1
ART. 2 – INQUADRAMENTO E CCNL
{{#if LIVELLO}}Il/La Lavoratore/Lavoratrice viene inquadrato/a al livello {{LIVELLO}}.{{/if}}
{{#if CCNL_APPLICABILE}}Si applica il CCNL per i dipendenti {{CCNL_APPLICABILE}}. Per quanto non disciplinato dal presente contratto, si applicano le norme del predetto CCNL e della legislazione vigente.{{/if}}

§1
ART. 3 – LUOGO E ORARIO DI LAVORO
{{#if LUOGO_LAVORO}}La prestazione verrà resa presso la sede di {{LUOGO_LAVORO}}.{{/if}}
{{#if ORE_SETTIMANALI}}L'orario normale di lavoro è fissato in {{ORE_SETTIMANALI}} ore settimanali, nel rispetto dei limiti di legge e del CCNL in materia di riposi giornalieri e settimanali.{{/if}}
{{#if DISTRIBUZIONE_ORARIO}}
La distribuzione dell'orario è la seguente: {{DISTRIBUZIONE_ORARIO}}.
{{/if}}
§1
ART. 4 – RETRIBUZIONE
La retribuzione lorda è stabilita in € {{RETRIBUZIONE}}, da corrispondersi con cadenza mensile{{#if MODALITA_PAGAMENTO}} tramite {{MODALITA_PAGAMENTO}}{{/if}}{{#if IBAN_PAGAMENTO}} sul conto corrente con IBAN {{IBAN_PAGAMENTO}}{{/if}}, comprensiva degli emolumenti previsti dal CCNL applicabile.

§1
{{#if GIORNI_PROVA}}
ART. 5 – PERIODO DI PROVA
È previsto un periodo di prova di {{GIORNI_PROVA}} giorni, durante il quale ciascuna parte può recedere dal rapporto senza preavviso né indennità.
{{/if}}
§1
ART. 6 – OBBLIGHI DELLE PARTI
Il/La Lavoratore/Lavoratrice si impegna a prestare la propria opera con diligenza, professionalità e fedeltà, osservando le direttive del Datore di Lavoro e le norme di sicurezza. Il Datore di Lavoro si impegna a corrispondere regolarmente la retribuzione e a garantire condizioni di lavoro conformi alla legge.

${_BENEFIT_OPT}
${_STRAORD_OPT}
${_TRASFERTE_OPT}
${_RISERV_OPT}
${_SMART_OPT}

§2
ART. – OBBLIGHI DEL DATORE DI LAVORO
Il Datore di Lavoro si impegna a corrispondere regolarmente la retribuzione, a garantire condizioni di lavoro conformi al D.Lgs. 81/2008, a assicurare il/la lavoratore/lavoratrice presso gli enti previdenziali e a riconoscere i trattamenti previsti dalla legge e dal CCNL in materia di ferie, permessi e malattia.

§3
ART. – MALATTIA, FERIE E TFR
In caso di malattia o infortunio, il/la lavoratore/lavoratrice darà tempestiva comunicazione e recapiterà il certificato medico nei termini di legge. Il comporto e i trattamenti sono disciplinati dalla normativa vigente e dal CCNL. Spettano il TFR (art. 2120 c.c.) e i trattamenti previdenziali di legge.

  ${_MALATTIA_OPT}
  ${_FERIE_OPT}
  ${_PROVE_QUAL_OPT}
  ${_FORZAMAGGIORE_OPT}
  ${_SOSPENSIONE_OPT}
  ${_RECESSO_OPT}
  ${_COMUNICAZIONI_OPT}
  ${_SPESE_ACC_OPT}
  ${_SOPRAVV_OPT}

${_RISOLUZIONE}

${_FORO}

${_DATI}

${_NOTE_OPT}

${_NORMATIVA}

${_AVVISO}

${_SIGN_LAVORATORE}`
  },

  indeterminato: {
    title: "Contratto di Lavoro Subordinato a Tempo Indeterminato",
    required: ["NOME_CONTROPARTE", "CF_CONTROPARTE", "DATA_NASCITA", "DATA_INIZIO", "MANSIONE", "LIVELLO", "CCNL_APPLICABILE", "LUOGO_LAVORO", "ORE_SETTIMANALI", "RETRIBUZIONE"],
    optional: ["LUOGO_NASCITA", "INDIRIZZO_CONTROPARTE", "GIORNI_PROVA", "DISTRIBUZIONE_ORARIO", "MODALITA_PAGAMENTO", "IBAN_PAGAMENTO", "BENEFIT", "STRAORDINARI", "TRASFERTE_RIMBORSI", "PATTO_RISERVATEZZA", "PATTO_NON_CONCORRENZA", "SMART_WORKING", "LUOGO_STIPULA", "DATA_CONTRATTO", "NOTE_AGGIUNTIVE", "FORZA_MAGGIORE", "SOSPENSIONE_CONTRATTO", "DIRITTO_RECESSO", "COMUNICAZIONI_PARTI", "SPESE_ACCESSORIE", "SOPRAVVENIENZE_NORMATIVE", "MALATTIA_INFORTUNIO", "ASSENZE_FERIE", "PROVE_QUALIFICA"],
    body: `§1
CONTRATTO DI LAVORO SUBORDINATO A TEMPO INDETERMINATO
...
Il/La Sig./Sig.ra {{NOME_CONTROPARTE}}{{#if DATA_NASCITA}}, nato/a {{#if LUOGO_NASCITA}}a {{LUOGO_NASCITA}} {{/if}}il {{DATA_NASCITA}}{{/if}}{{#if CF_CONTROPARTE}}, codice fiscale {{CF_CONTROPARTE}}{{/if}}{{#if INDIRIZZO_CONTROPARTE}}, residente in {{INDIRIZZO_CONTROPARTE}}{{/if}} (di seguito, "Lavoratore/Lavoratrice");

§1
PREMESSO CHE

Il Datore di Lavoro intende assumere il/la Lavoratore/Lavoratrice con rapporto di lavoro subordinato a tempo indeterminato per lo svolgimento della mansione di seguito indicata.

§1
TUTTO CIÒ PREMESSO, SI CONVIENE E SI STIPULA QUANTO SEGUE

§1
ART. 1 – OGGETTO E DECORRENZA
Il/La Lavoratore/Lavoratrice viene assunto/a con contratto di lavoro subordinato a tempo indeterminato, con decorrenza dal {{DATA_INIZIO}}, per lo svolgimento della mansione di {{MANSIONE}}.

§1
ART. 2 – INQUADRAMENTO E CCNL
{{#if LIVELLO}}Il/La Lavoratore/Lavoratrice viene inquadrato/a al livello {{LIVELLO}}.{{/if}}
{{#if CCNL_APPLICABILE}}Si applica il CCNL per i dipendenti {{CCNL_APPLICABILE}}.{{/if}}

§1
ART. 3 – LUOGO E ORARIO DI LAVORO
{{#if LUOGO_LAVORO}}La prestazione verrà resa presso la sede di {{LUOGO_LAVORO}}.{{/if}}
{{#if ORE_SETTIMANALI}}L'orario normale di lavoro è di {{ORE_SETTIMANALI}} ore settimanali, nel rispetto dei limiti di legge sui riposi.{{/if}}
{{#if DISTRIBUZIONE_ORARIO}}
La distribuzione dell'orario è la seguente: {{DISTRIBUZIONE_ORARIO}}.
{{/if}}
§1
ART. 4 – RETRIBUZIONE
La retribuzione lorda è stabilita in € {{RETRIBUZIONE}}, da corrispondersi con cadenza mensile{{#if MODALITA_PAGAMENTO}} tramite {{MODALITA_PAGAMENTO}}{{/if}}{{#if IBAN_PAGAMENTO}} sul conto corrente con IBAN {{IBAN_PAGAMENTO}}{{/if}}.

§1
{{#if GIORNI_PROVA}}
ART. 5 – PERIODO DI PROVA
È previsto un periodo di prova di {{GIORNI_PROVA}} giorni, durante il quale ciascuna parte può recedere senza preavviso.
{{/if}}
§1
ART. 6 – OBBLIGHI DELLE PARTI
Il/La Lavoratore/Lavoratrice si impegna a prestare la propria opera con diligenza e fedeltà, osservando le direttive del Datore di Lavoro. Il Datore di Lavoro si impegna a corrispondere la retribuzione e a garantire condizioni di lavoro conformi alla legge.

${_BENEFIT_OPT}
${_STRAORD_OPT}
${_TRASFERTE_OPT}
${_RISERV_OPT}
${_NONCONC_OPT}
${_SMART_OPT}

§2
ART. – OBBLIGHI DEL DATORE DI LAVORO
Il Datore di Lavoro si impegna a corrispondere regolarmente la retribuzione, a garantire condizioni di lavoro conformi al D.Lgs. 81/2008, a assicurare il/la lavoratore/lavoratrice e a riconoscere i trattamenti previsti dalla legge e dal CCNL.

§3
ART. – MALATTIA, FERIE E TFR
In caso di malattia o infortunio, il/la lavoratore/lavoratrice darà tempestiva comunicazione. Il comporto e i trattamenti sono disciplinati dalla normativa vigente e dal CCNL. Spettano il TFR e i trattamenti previdenziali di legge.

  ${_MALATTIA_OPT}
  ${_FERIE_OPT}
  ${_PROVE_QUAL_OPT}
  ${_FORZAMAGGIORE_OPT}
  ${_SOSPENSIONE_OPT}
  ${_RECESSO_OPT}
  ${_COMUNICAZIONI_OPT}
  ${_SPESE_ACC_OPT}
  ${_SOPRAVV_OPT}

${_RISOLUZIONE}

${_FORO}

${_DATI}

${_NOTE_OPT}

${_NORMATIVA}

${_AVVISO}

${_SIGN_LAVORATORE}`
  },

  apprendistato: {
    title: "Contratto di Apprendistato",
    required: ["NOME_CONTROPARTE", "CF_CONTROPARTE", "DATA_NASCITA", "DATA_INIZIO", "DURATA_APPRENDISTATO", "MANSIONE", "LIVELLO", "CCNL_APPLICABILE", "LUOGO_LAVORO", "ORE_SETTIMANALI", "RETRIBUZIONE"],
    optional: ["LUOGO_NASCITA", "INDIRIZZO_CONTROPARTE", "TIPOLOGIA_APPRENDISTATO", "PIANO_FORMATIVO", "TUTOR_AZIENDALE", "ENTE_FORMATIVO", "MODALITA_PAGAMENTO", "IBAN_PAGAMENTO", "BENEFIT", "LUOGO_STIPULA", "DATA_CONTRATTO", "NOTE_AGGIUNTIVE", "FORZA_MAGGIORE", "SOSPENSIONE_CONTRATTO", "DIRITTO_RECESSO", "COMUNICAZIONI_PARTI", "SPESE_ACCESSORIE", "SOPRAVVENIENZE_NORMATIVE", "MALATTIA_INFORTUNIO", "ASSENZE_FERIE", "PROVE_QUALIFICA"],
    body: `§1
CONTRATTO DI APPRENDISTATO

TRA

{{DITTA}}, con sede legale in {{SEDE}}, Partita IVA {{PIVA}}, in persona del legale rappresentante pro tempore (di seguito, "Datore di Lavoro");

E

Il/La Sig./Sig.ra {{NOME_CONTROPARTE}}{{#if DATA_NASCITA}}, nato/a {{#if LUOGO_NASCITA}}a {{LUOGO_NASCITA}} {{/if}}il {{DATA_NASCITA}}{{/if}}{{#if CF_CONTROPARTE}}, codice fiscale {{CF_CONTROPARTE}}{{/if}}{{#if INDIRIZZO_CONTROPARTE}}, residente in {{INDIRIZZO_CONTROPARTE}}{{/if}} (di seguito, "Apprendista");

§1
PREMESSO CHE

Il Datore di Lavoro intende assumere l'Apprendista ai sensi del D.Lgs. 81/2015, garantendo l'adempimento dell'obbligo di formazione.

§1
TUTTO CIÒ PREMESSO, SI CONVIENE E SI STIPULA QUANTO SEGUE

§1
ART. 1 – TIPOLOGIA, OGGETTO E DURATA
L'Apprendista viene assunto/a con contratto di apprendistato{{#if TIPOLOGIA_APPRENDISTATO}} di tipo {{TIPOLOGIA_APPRENDISTATO}}{{/if}}, a decorrere dal {{DATA_INIZIO}}. {{#if DURATA_APPRENDISTATO}}La durata del periodo di apprendistato è di {{DURATA_APPRENDISTATO}} mesi. {{/if}}Al termine, previa valutazione positiva, il rapporto prosegue come ordinario rapporto a tempo indeterminato.

§1
ART. 2 – MANSIONE E QUALIFICA
L'Apprendista svolgerà la mansione di {{MANSIONE}}{{#if LIVELLO}}, con la qualifica da conseguire di {{LIVELLO}}{{/if}}, seguendo i percorsi formativi predisposti dal Datore di Lavoro.

§1
ART. 3 – CCNL E INQUADRAMENTO
{{#if CCNL_APPLICABILE}}Al rapporto si applica il CCNL per i dipendenti {{CCNL_APPLICABILE}}.{{/if}}
{{#if LIVELLO}}L'Apprendista viene inquadrato/a al livello {{LIVELLO}}.{{/if}}

§1
ART. 4 – PIANO FORMATIVO E TUTOR
{{#if PIANO_FORMATIVO}}Il Datore di Lavoro eroga la seguente formazione: {{PIANO_FORMATIVO}}.{{/if}}{{#if TUTOR_AZIENDALE}} Il tutor aziendale designato per l'affiancamento è: {{TUTOR_AZIENDALE}}.{{/if}}
{{#if ENTE_FORMATIVO}}
La formazione esterna verrà erogata presso: {{ENTE_FORMATIVO}}.
{{/if}}
§1
ART. 5 – LUOGO E ORARIO
{{#if LUOGO_LAVORO}}La prestazione verrà resa presso la sede di {{LUOGO_LAVORO}}.{{/if}}
{{#if ORE_SETTIMANALI}}L'orario di lavoro è di {{ORE_SETTIMANALI}} ore settimanali. Le ore di formazione sono computate nell'orario di lavoro.{{/if}}

§1
ART. 6 – RETRIBUZIONE
La retribuzione lorda mensile è stabilita in € {{RETRIBUZIONE}}, commisurata alle percentuali previste dal CCNL per gli apprendisti{{#if MODALITA_PAGAMENTO}}, da corrispondersi tramite {{MODALITA_PAGAMENTO}}{{/if}}{{#if IBAN_PAGAMENTO}} sul conto corrente con IBAN {{IBAN_PAGAMENTO}}{{/if}}.

§1
ART. 7 – OBBLIGHI DELLE PARTI
L'Apprendista si impegna a prestare la propria opera con diligenza e a partecipare alle attività formative. Il Datore di Lavoro si impegna a erogare la formazione, a corrispondere la retribuzione e a garantire condizioni di lavoro sicure.

${_BENEFIT_OPT}

§2
ART. – OBBLIGHI DEL DATORE DI LAVORO
Il Datore di Lavoro garantisce la presenza di personale qualificato per l'affiancamento, versa i contributi con le agevolazioni previste dalla legge e osserva le norme di sicurezza (D.Lgs. 81/2008).

§3
ART. – VERIFICA E CONFERMA
Al termine del periodo di apprendistato, previa valutazione positiva dell'esito del percorso formativo, il rapporto verrà confermato a tempo indeterminato. In caso di valutazione negativa, si applicano le disposizioni di legge.

  ${_MALATTIA_OPT}
  ${_FERIE_OPT}
  ${_PROVE_QUAL_OPT}
  ${_FORZAMAGGIORE_OPT}
  ${_SOSPENSIONE_OPT}
  ${_RECESSO_OPT}
  ${_COMUNICAZIONI_OPT}
  ${_SPESE_ACC_OPT}
  ${_SOPRAVV_OPT}

${_RISOLUZIONE}

${_FORO}

${_DATI}

${_NOTE_OPT}

${_NORMATIVA}

${_AVVISO}

${_SIGN_LAVORATORE}`
  },

  part_time: {
    title: "Contratto di Lavoro Part-Time",
    required: ["NOME_CONTROPARTE", "CF_CONTROPARTE", "DATA_INIZIO", "TIPO_TEMPO", "MANSIONE", "LIVELLO", "CCNL_APPLICABILE", "ORE_SETTIMANALI", "DISTRIBUZIONE_ORARIO", "RETRIBUZIONE"],
    optional: ["INDIRIZZO_CONTROPARTE", "TIPO_PART_TIME", "LUOGO_LAVORO", "DATA_FINE", "CLAUSOLE_ELASTICHE", "BENEFIT", "STRAORDINARI", "MODALITA_PAGAMENTO", "IBAN_PAGAMENTO", "LUOGO_STIPULA", "DATA_CONTRATTO", "NOTE_AGGIUNTIVE", "FORZA_MAGGIORE", "SOSPENSIONE_CONTRATTO", "DIRITTO_RECESSO", "COMUNICAZIONI_PARTI", "SPESE_ACCESSORIE", "SOPRAVVENIENZE_NORMATIVE", "MALATTIA_INFORTUNIO", "ASSENZE_FERIE", "PROVE_QUALIFICA"],
    body: `§1
CONTRATTO DI LAVORO A TEMPO PARZIALE (PART-TIME)

TRA

{{DITTA}}, con sede legale in {{SEDE}}, Partita IVA {{PIVA}}, in persona del legale rappresentante pro tempore (di seguito, "Datore di Lavoro");

E

Il/La Sig./Sig.ra {{NOME_CONTROPARTE}}{{#if CF_CONTROPARTE}}, codice fiscale {{CF_CONTROPARTE}}{{/if}}{{#if INDIRIZZO_CONTROPARTE}}, residente in {{INDIRIZZO_CONTROPARTE}}{{/if}} (di seguito, "Lavoratore/Lavoratrice");

§1
PREMESSO CHE

Le parti intendono regolare il rapporto di lavoro a tempo parziale ai sensi della normativa vigente. Il/La Lavoratore/Lavoratrice è consapevole che il trattamento economico sarà proporzionato all'orario ridotto.

§1
TUTTO CIÒ PREMESSO, SI CONVIENE E SI STIPULA QUANTO SEGUE

§1
ART. 1 – TIPO DI RAPPORTO E DECORRENZA
Il/La Lavoratore/Lavoratrice viene assunto/a{{#if TIPO_TEMPO}} a tempo {{TIPO_TEMPO}}{{/if}} con decorrenza dal {{DATA_INIZIO}}{{#if DATA_FINE}} e scadenza il {{DATA_FINE}}{{/if}}.

§1
ART. 2 – TIPOLOGIA E ORARIO PART-TIME
Il rapporto è a tempo parziale{{#if TIPO_PART_TIME}} di tipo {{TIPO_PART_TIME}}{{/if}}.{{#if ORE_SETTIMANALI}} L'orario di lavoro è di {{ORE_SETTIMANALI}} ore settimanali{{#if DISTRIBUZIONE_ORARIO}}, con la seguente distribuzione: {{DISTRIBUZIONE_ORARIO}}{{/if}}.{{/if}}

§1
ART. 3 – MANSIONE E INQUADRAMENTO
La mansione affidata è quella di {{MANSIONE}}{{#if LIVELLO}}, con inquadramento al livello {{LIVELLO}}{{/if}}{{#if CCNL_APPLICABILE}} del CCNL per i dipendenti {{CCNL_APPLICABILE}}{{/if}}.

§1
{{#if LUOGO_LAVORO}}
ART. 4 – LUOGO DI LAVORO
La prestazione verrà resa presso la sede di {{LUOGO_LAVORO}}.
{{/if}}
§1
ART. 5 – RETRIBUZIONE
La retribuzione lorda mensile è stabilita in € {{RETRIBUZIONE}}, rapportata all'orario ridotto{{#if MODALITA_PAGAMENTO}}, da corrispondersi tramite {{MODALITA_PAGAMENTO}}{{/if}}{{#if IBAN_PAGAMENTO}} sul conto corrente con IBAN {{IBAN_PAGAMENTO}}{{/if}}.

§1
ART. 6 – OBBLIGHI DELLE PARTI
Il/La Lavoratore/Lavoratrice si impegna a prestare la propria opera con diligenza e fedeltà. Il Datore di Lavoro si impegna a corrispondere la retribuzione e a garantire condizioni di lavoro conformi alla legge.

${_CL_ELASTICHE_OPT}
${_BENEFIT_OPT}
${_STRAORD_OPT}

§2
ART. – TRATTAMENTO E NORMATIVO
Il trattamento economico e normativo è proporzionato all'orario part-time, fermo restando il diritto a ferie, permessi, malattia e altri istituti calcolati in proporzione. Il Datore di Lavoro osserva le norme di sicurezza (D.Lgs. 81/2008).

§3
ART. – LAVORI SUPPLEMENTARI
I lavori supplementari e straordinari sono ammessi nei limiti e alle condizioni previste dalla legge e dal CCNL, in caso di comprovate esigenze tecnico-produttive.

  ${_MALATTIA_OPT}
  ${_FERIE_OPT}
  ${_PROVE_QUAL_OPT}
  ${_FORZAMAGGIORE_OPT}
  ${_SOSPENSIONE_OPT}
  ${_RECESSO_OPT}
  ${_COMUNICAZIONI_OPT}
  ${_SPESE_ACC_OPT}
  ${_SOPRAVV_OPT}

${_RISOLUZIONE}

${_FORO}

${_DATI}

${_NOTE_OPT}

${_NORMATIVA}

${_AVVISO}

${_SIGN_LAVORATORE}`
  },

  prestazione_occasionale: {
    title: "Contratto di Prestazione Occasionale",
    required: ["NOME_CONTROPARTE", "CF_CONTROPARTE", "OGGETTO_PRESTAZIONE", "DATA_INIZIO", "DATA_FINE", "COMPENSO"],
    optional: ["INDIRIZZO_CONTROPARTE", "LUOGO_SVOLGIMENTO", "MODALITA_ESECUZIONE", "MODALITA_PAGAMENTO", "RIMBORSI_SPESE", "PATTO_RISERVATEZZA", "IBAN_PAGAMENTO", "LUOGO_STIPULA", "DATA_CONTRATTO", "NOTE_AGGIUNTIVE", "FORZA_MAGGIORE", "SOSPENSIONE_CONTRATTO", "DIRITTO_RECESSO", "COMUNICAZIONI_PARTI", "SPESE_ACCESSORIE", "SOPRAVVENIENZE_NORMATIVE"],
    body: `§1
CONTRATTO DI PRESTAZIONE OCCASIONALE

TRA

{{DITTA}}, con sede legale in {{SEDE}}, Partita IVA {{PIVA}} (di seguito, "Committente");

E

Il/La Sig./Sig.ra {{NOME_CONTROPARTE}}{{#if CF_CONTROPARTE}}, codice fiscale {{CF_CONTROPARTE}}{{/if}}{{#if INDIRIZZO_CONTROPARTE}}, residente in {{INDIRIZZO_CONTROPARTE}}{{/if}} (di seguito, "Prestatore/Prestatrice");

§1
PREMESSO CHE

Il Committente necessita di una prestazione di natura occasionale e il/la Prestatore/Prestatrice si dichiara disponibile a svolgerla in piena autonomia, senza vincolo di subordinazione.

§1
TUTTO CIÒ PREMESSO, SI CONVIENE E SI STIPULA QUANTO SEGUE

§1
ART. 1 – OGGETTO
Il/La Prestatore/Prestatrice si impegna a svolgere la seguente prestazione occasionale:

{{OGGETTO_PRESTAZIONE}}

§1
ART. 2 – DURATA
La prestazione avrà inizio il {{DATA_INIZIO}}{{#if DATA_FINE}} e si concluderà entro il {{DATA_FINE}}{{/if}}.
{{#if LUOGO_SVOLGIMENTO}}
La prestazione verrà svolta presso: {{LUOGO_SVOLGIMENTO}}.
{{/if}}
{{#if MODALITA_ESECUZIONE}}
ART. – MODALITÀ DI ESECUZIONE
{{MODALITA_ESECUZIONE}}
{{/if}}
§1
ART. 3 – COMPENSO E PAGAMENTO
Il compenso pattuito per la prestazione è di € {{COMPENSO}}, da corrispondersi al termine della prestazione, previa verifica della corretta esecuzione{{#if MODALITA_PAGAMENTO}} tramite {{MODALITA_PAGAMENTO}}{{/if}}{{#if IBAN_PAGAMENTO}} sul conto corrente con IBAN {{IBAN_PAGAMENTO}}{{/if}}.
{{#if RIMBORSI_SPESE}}
ART. – RIMBORSI SPESE
{{RIMBORSI_SPESE}}
{{/if}}
§1
ART. 4 – NATURA DEL RAPPORTO
Le parti dichiarano che la prestazione ha natura occasionale, non costituendo rapporto di lavoro subordinato né continuativo. Il/La Prestatore/Prestatrice organizza autonomamente la propria attività.

§2
ART. – OBBLIGHI DELLE PARTI
Il/La Prestatore/Prestatrice si impegna a eseguire la prestazione con diligenza e a regola d'arte, a utilizzare strumenti propri e a comunicare tempestivamente eventuali difficoltà. Il Committente si impegna a corrispondere il compenso e a fornire le informazioni necessarie.
${_RISERV_OPT}

§2
ART. – RESPONSABILITÀ E SICUREZZA
Il/La Prestatore/Prestatrice risponde della corretta esecuzione della prestazione ed è responsabile dell'osservanza delle norme di sicurezza (D.Lgs. 81/2008) per la parte di propria competenza.

§3
ART. – ESCLUSIONE DI RAPPORTI
Le parti confermano espressamente che la prestazione non configura rapporto di lavoro subordinato, di collaborazione coordinata e continuativa, né alcun altro rapporto continuativo.

  ${_FORZAMAGGIORE_OPT}
  ${_SOSPENSIONE_OPT}
  ${_RECESSO_OPT}
  ${_COMUNICAZIONI_OPT}
  ${_SPESE_ACC_OPT}
  ${_SOPRAVV_OPT}

${_RISOLUZIONE}

${_FORO}

${_DATI}

${_NOTE_OPT}

${_NORMATIVA}

${_AVVISO}

${_SIGN_COMMITTENTE}`
  },

  collaborazione: {
    title: "Contratto di Collaborazione Coordinata e Continuativa",
    required: ["NOME_CONTROPARTE", "CF_CONTROPARTE", "OGGETTO_COLLABORAZIONE", "DATA_INIZIO", "DATA_FINE", "COMPENSO"],
    optional: ["INDIRIZZO_CONTROPARTE", "LUOGO_SVOLGIMENTO", "STRUMENTI_FORNITI", "PATTO_RISERVATEZZA", "PROPRIETA_INTELLETTUALE", "RIMBORSI_SPESE", "MODALITA_PAGAMENTO", "IBAN_PAGAMENTO", "LUOGO_STIPULA", "DATA_CONTRATTO", "NOTE_AGGIUNTIVE", "FORZA_MAGGIORE", "SOSPENSIONE_CONTRATTO", "DIRITTO_RECESSO", "COMUNICAZIONI_PARTI", "SPESE_ACCESSORIE", "SOPRAVVENIENZE_NORMATIVE"],
    body: `§1
CONTRATTO DI COLLABORAZIONE COORDINATA E CONTINUATIVA

TRA

{{DITTA}}, con sede legale in {{SEDE}}, Partita IVA {{PIVA}} (di seguito, "Committente");

E

Il/La Sig./Sig.ra {{NOME_CONTROPARTE}}{{#if CF_CONTROPARTE}}, codice fiscale {{CF_CONTROPARTE}}{{/if}}{{#if INDIRIZZO_CONTROPARTE}}, residente in {{INDIRIZZO_CONTROPARTE}}{{/if}} (di seguito, "Collaboratore/Collaboratrice");

§1
PREMESSO CHE

Il Committente necessita di un'attività di collaborazione coordinata e continuativa e il/la Collaboratore/Collaboratrice si dichiara disponibile a prestare la propria opera, senza vincolo di subordinazione.

§1
TUTTO CIÒ PREMESSO, SI CONVIENE E SI STIPULA QUANTO SEGUE

§1
ART. 1 – OGGETTO
Il/La Collaboratore/Collaboratrice si impegna a prestare la propria attività per:

{{OGGETTO_COLLABORAZIONE}}

§1
ART. 2 – DURATA
Il rapporto ha decorrenza dal {{DATA_INIZIO}}{{#if DATA_FINE}} e scadenza il {{DATA_FINE}}{{/if}}, salvo rinnovo espresso.
{{#if LUOGO_SVOLGIMENTO}}
L'attività verrà svolta presso: {{LUOGO_SVOLGIMENTO}}.
{{/if}}
{{#if STRUMENTI_FORNITI}}
ART. – STRUMENTI FORNITI
{{STRUMENTI_FORNITI}}
{{/if}}
§1
ART. 3 – COMPENSO E PAGAMENTO
Il compenso mensile è stabilito in € {{COMPENSO}}, da corrispondersi entro il giorno 15 del mese successivo, previa presentazione di regolare documentazione{{#if MODALITA_PAGAMENTO}} tramite {{MODALITA_PAGAMENTO}}{{/if}}{{#if IBAN_PAGAMENTO}} sul conto corrente con IBAN {{IBAN_PAGAMENTO}}{{/if}}.
{{#if RIMBORSI_SPESE}}
ART. – RIMBORSI SPESE
{{RIMBORSI_SPESE}}
{{/if}}
§1
ART. 4 – MODALITÀ DI SVOLGIMENTO
L'attività verrà svolta in piena autonomia organizzativa, con coordinamento con il Committente per gli obiettivi e le tempistiche.

§2
ART. – OBBLIGHI DELLE PARTI
Il/La Collaboratore/Collaboratrice si impegna a prestare la propria attività con diligenza e professionalità, a rispettare le direttive per obiettivi e tempi e a non svolgere attività in concorrenza. Il Committente si impegna a corrispondere il compenso e a fornire le informazioni necessarie.
${_RISERV_OPT}
{{#if PROPRIETA_INTELLETTUALE}}
§2
ART. – PROPRIETÀ INTELLETTUALE
{{PROPRIETA_INTELLETTUALE}}
{{/if}}
§3
ART. – RESPONSABILITÀ E PREVIDENZA
Il/La Collaboratore/Collaboratrice risponde della corretta esecuzione dell'attività ed è responsabile degli adempimenti fiscali e previdenziali propri, compresa l'iscrizione alla gestione separata INPS.

  ${_FORZAMAGGIORE_OPT}
  ${_SOSPENSIONE_OPT}
  ${_RECESSO_OPT}
  ${_COMUNICAZIONI_OPT}
  ${_SPESE_ACC_OPT}
  ${_SOPRAVV_OPT}

${_RISOLUZIONE}

${_FORO}

${_DATI}

${_NOTE_OPT}

${_NORMATIVA}

${_AVVISO}

${_SIGN_COLLABORATORE}`
  },
};