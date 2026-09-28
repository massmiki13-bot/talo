import { _FORO, _DATI, _RISOLUZIONE, _NORMATIVA, _AVVISO, _NOTE_OPT, _RISERV_OPT,
  _FORZAMAGGIORE_OPT, _SOSPENSIONE_OPT, _RECESSO_OPT, _COMUNICAZIONI_OPT, _SPESE_ACC_OPT, _SOPRAVV_OPT,
  _SIGN_APPALTATORE, _SIGN_SUBAPPALTATORE, _SIGN_FORNITORE,
  _SIGN_CONCEDENTE, _SIGN_NDA, _SIGN_INCARICO, _SIGN_VERBALE } from "./clauses";

export const schemasCommerciale = {
  appalto: {
    title: "Contratto di Appalto",
    required: ["NOME_CONTROPARTE", "PIVA_CONTROPARTE", "OGGETTO_LAVORI", "LUOGO_ESECUZIONE", "IMPORTO", "DATA_INIZIO", "DATA_FINE"],
    optional: ["SEDE_CONTROPARTE", "PENALI", "GARANZIE_FIDEIUSSIONI", "SUBAPPALTO_AMMESSO", "MODALITA_COLLAUDO", "ASSICURAZIONI", "SICUREZZA_POS", "VARIANTI", "MODALITA_PAGAMENTO", "IBAN_PAGAMENTO", "LUOGO_STIPULA", "DATA_CONTRATTO", "NOTE_AGGIUNTIVE", "FORZA_MAGGIORE", "SOSPENSIONE_CONTRATTO", "DIRITTO_RECESSO", "COMUNICAZIONI_PARTI", "SPESE_ACCESSORIE", "SOPRAVVENIENZE_NORMATIVE"],
    body: `§1
CONTRATTO DI APPALTO PER L'ESECUZIONE DI LAVORI

TRA

{{DITTA}}, con sede legale in {{SEDE}}, Partita IVA {{PIVA}} (di seguito, "Committente");

E

{{NOME_CONTROPARTE}}{{#if SEDE_CONTROPARTE}}, con sede in {{SEDE_CONTROPARTE}}{{/if}}{{#if PIVA_CONTROPARTE}}, Partita IVA {{PIVA_CONTROPARTE}}{{/if}} (di seguito, "Appaltatore");

§1
PREMESSO CHE

Il Committente intende affidare all'Appaltatore l'esecuzione dei lavori di seguito descritti. L'Appaltatore dichiara di avere i requisiti tecnici, professionali e di legge per eseguirli a regola d'arte.

§1
TUTTO CIÒ PREMESSO, SI CONVIENE E SI STIPULA QUANTO SEGUE

§1
ART. 1 – OGGETTO DELL'APPALTO
L'Appaltatore si impegna ad eseguire a regola d'arte, a proprie cura e spese, i seguenti lavori:

{{OGGETTO_LAVORI}}

{{#if LUOGO_ESECUZIONE}}
§1
ART. 2 – LUOGO DI ESECUZIONE
I lavori verranno eseguiti presso: {{LUOGO_ESECUZIONE}}.
{{/if}}
§1
ART. 3 – CORRISPETTIVO
L'importo complessivo dell'appalto è stabilito in € {{IMPORTO}}, più IVA, inteso a corpo e comprensivo di tutti gli oneri, le spese e gli accessori.

§1
ART. 4 – TEMPI DI ESECUZIONE
I lavori avranno inizio il {{DATA_INIZIO}}{{#if DATA_FINE}} e dovranno essere completati entro il {{DATA_FINE}}{{/if}}.

§1
ART. 5 – MODALITÀ DI PAGAMENTO
Il pagamento verrà effettuato{{#if MODALITA_PAGAMENTO}} secondo la seguente modalità: {{MODALITA_PAGAMENTO}}{{/if}}{{#if IBAN_PAGAMENTO}} sul conto corrente con IBAN {{IBAN_PAGAMENTO}}{{/if}}. Gli stati di avanzamento lavori verranno approvati previa verifica della regolare esecuzione.

§1
ART. 6 – OBBLIGHI DELLE PARTI
L'Appaltatore si impegna a eseguire i lavori a regola d'arte e a osservare le norme di sicurezza. Il Committente si impegna a mettere a disposizione l'area di cantiere e a corrispondere i pagamenti nei termini stabiliti.
{{#if PENALI}}
§2
ART. – PENALI PER RITARDO
In caso di ritardo rispetto al termine stabilito, l'Appaltatore corrisponderà al Committente una penale pari a: {{PENALI}}.
{{/if}}
{{#if GARANZIE_FIDEIUSSIONI}}
§2
ART. – GARANZIE E FIDEIUSSIONI
{{GARANZIE_FIDEIUSSIONI}}
{{/if}}
{{#if SUBAPPALTO_AMMESSO}}
§2
ART. – SUBAPPALTO
Il subappalto è {{SUBAPPALTO_AMMESSO}}. In ogni caso, l'Appaltatore rimane unico responsabile verso il Committente.
{{/if}}
{{#if MODALITA_COLLAUDO}}
§2
ART. – COLLAUDO
{{MODALITA_COLLAUDO}}
{{/if}}
{{#if ASSICURAZIONI}}
§2
ART. – ASSICURAZIONI
{{ASSICURAZIONI}}
{{/if}}
{{#if SICUREZZA_POS}}
§2
ART. – SICUREZZA
{{SICUREZZA_POS}}
{{/if}}
{{#if VARIANTI}}
§3
ART. – VARIANTI
{{VARIANTI}}
{{/if}}
§2
ART. – OBBLIGHI DELL'APPALTATORE
L'Appaltatore si impegna a eseguire i lavori a regola d'arte con materiali conformi, a osservare le norme di sicurezza (D.Lgs. 81/2008), a garantire la regolarità contributiva e fiscale (DURC), a utilizzare manodopera regolarmente assunta e a rispondere dei vizi e dei difetti di esecuzione.

§2
ART. – GARANZIA E COLLAUDO
L'Appaltatore garantisce i lavori per il periodo previsto dalla legge (10 anni per i lavori edili, art. 1669 c.c.). Al termine, il Committente procederà al collaudo.

§3
ART. – SICUREZZA E RESPONSABILITÀ
L'Appaltatore è responsabile della sicurezza del cantiere e dei propri dipendenti. Manterrà indenne il Committente da ogni responsabilità derivante da inadempienze dell'Appaltatore.

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

${_SIGN_APPALTATORE}`
  },

  subappalto: {
    title: "Contratto di Subappalto",
    required: ["NOME_CONTROPARTE", "PIVA_CONTROPARTE", "OGGETTO_LAVORI", "LUOGO_ESECUZIONE", "IMPORTO", "DATA_INIZIO", "DATA_FINE"],
    optional: ["SEDE_CONTROPARTE", "RIFERIMENTO_APPALTO_PRINCIPALE", "PENALI", "GARANZIE_FIDEIUSSIONI", "SICUREZZA_POS", "ASSICURAZIONI", "MODALITA_PAGAMENTO", "IBAN_PAGAMENTO", "LUOGO_STIPULA", "DATA_CONTRATTO", "NOTE_AGGIUNTIVE", "FORZA_MAGGIORE", "SOSPENSIONE_CONTRATTO", "DIRITTO_RECESSO", "COMUNICAZIONI_PARTI", "SPESE_ACCESSORIE", "SOPRAVVENIENZE_NORMATIVE"],
    body: `§1
CONTRATTO DI SUBAPPALTO PER L'ESECUZIONE DI LAVORI

TRA

{{DITTA}}, con sede legale in {{SEDE}}, Partita IVA {{PIVA}} (di seguito, "Appaltatore principale");

E

{{NOME_CONTROPARTE}}{{#if SEDE_CONTROPARTE}}, con sede in {{SEDE_CONTROPARTE}}{{/if}}{{#if PIVA_CONTROPARTE}}, Partita IVA {{PIVA_CONTROPARTE}}{{/if}} (di seguito, "Subappaltatore");

§1
PREMESSO CHE

L'Appaltatore principale, titolare del contratto di appalto principale{{#if RIFERIMENTO_APPALTO_PRINCIPALE}} ({{RIFERIMENTO_APPALTO_PRINCIPALE}}){{/if}}, intende subappaltare parte dei lavori al Subappaltatore, che accetta e dichiara di possedere i requisiti di legge necessari.

§1
TUTTO CIÒ PREMESSO, SI CONVIENE E SI STIPULA QUANTO SEGUE

§1
ART. 1 – RIFERIMENTO E OGGETTO
{{#if RIFERIMENTO_APPALTO_PRINCIPALE}}Il presente subappalto si riferisce al contratto di appalto principale: {{RIFERIMENTO_APPALTO_PRINCIPALE}}. {{/if}}Il Subappaltatore si impegna ad eseguire a regola d'arte i seguenti lavori:

{{OGGETTO_LAVORI}}

{{#if LUOGO_ESECUZIONE}}
§1
ART. 2 – LUOGO DI ESECUZIONE
I lavori verranno eseguiti presso: {{LUOGO_ESECUZIONE}}.
{{/if}}
§1
ART. 3 – CORRISPETTIVO
L'importo complessivo del subappalto è stabilito in € {{IMPORTO}}, più IVA, inteso a corpo e comprensivo di tutti gli oneri.

§1
ART. 4 – TEMPI DI ESECUZIONE
I lavori avranno inizio il {{DATA_INIZIO}}{{#if DATA_FINE}} e dovranno essere ultimati entro il {{DATA_FINE}}{{/if}}.

§1
ART. 5 – MODALITÀ DI PAGAMENTO
Il pagamento verrà effettuato{{#if MODALITA_PAGAMENTO}} secondo la modalità: {{MODALITA_PAGAMENTO}}{{/if}}{{#if IBAN_PAGAMENTO}} sul conto corrente con IBAN {{IBAN_PAGAMENTO}}{{/if}}, salvo buon fine del pagamento da parte del Committente.

§1
ART. 6 – OBBLIGHI DELLE PARTI
Il Subappaltatore si impegna a eseguire i lavori a regola d'arte e a rispettare le normative applicabili. L'Appaltatore principale si impegna a mettere a disposizione l'area di intervento e a corrispondere i pagamenti nei termini stabiliti.
{{#if PENALI}}
§2
ART. – PENALI
In caso di ritardo, il Subappaltatore corrisponderà una penale pari a: {{PENALI}}.
{{/if}}
{{#if GARANZIE_FIDEIUSSIONI}}
§2
ART. – GARANZIE
{{GARANZIE_FIDEIUSSIONI}}
{{/if}}
{{#if SICUREZZA_POS}}
§2
ART. – SICUREZZA
{{SICUREZZA_POS}}
{{/if}}
{{#if ASSICURAZIONI}}
§2
ART. – ASSICURAZIONI
{{ASSICURAZIONI}}
{{/if}}
§2
ART. – OBBLIGHI DEL SUBAPPALTATORE
Il Subappaltatore si impegna a eseguire i lavori a regola d'arte, a osservare le norme di sicurezza (D.Lgs. 81/2008), a garantire la regolarità contributiva e fiscale (DURC), a utilizzare manodopera regolarmente assunta e a rispettare le condizioni del contratto di appalto principale.

§2
ART. – RESPONSABILITÀ E COLLAUDO
Il Subappaltatore risponde verso l'Appaltatore principale della corretta esecuzione e manterrà indenne l'Appaltatore da ogni responsabilità derivante da inadempienze del Subappaltatore. Al termine, l'Appaltatore procederà alla verifica e al collaudo.

  ${_FORZAMAGGIORE_OPT}
  ${_SOSPENSIONE_OPT}
  ${_RECESSO_OPT}
  ${_COMUNICAZIONI_OPT}
  ${_SPESE_ACC_OPT}
  ${_SOPRAVV_OPT}

§3
ART. – DIVIETO DI ULTERIORE SUBAPPALTO
Il Subappaltatore non potrà subappaltare a terzi i lavori senza il preventivo consenso scritto dell'Appaltatore principale.

${_RISOLUZIONE}

${_FORO}

${_DATI}

${_NOTE_OPT}

${_NORMATIVA}

${_AVVISO}

${_SIGN_SUBAPPALTATORE}`
  },

  fornitura: {
    title: "Contratto di Fornitura",
    required: ["NOME_CONTROPARTE", "PIVA_CONTROPARTE", "OGGETTO_FORNITURA", "QUANTITA", "PREZZO_UNITARIO", "IMPORTO", "DATA_CONSEGNA"],
    optional: ["SEDE_CONTROPARTE", "DURATA_FORNITURA", "LUOGO_CONSEGNA", "PENALI", "GARANZIA", "MODALITA_RESO", "TRASPORTO_SPESE", "MODALITA_PAGAMENTO", "IBAN_PAGAMENTO", "LUOGO_STIPULA", "DATA_CONTRATTO", "NOTE_AGGIUNTIVE", "FORZA_MAGGIORE", "SOSPENSIONE_CONTRATTO", "DIRITTO_RECESSO", "COMUNICAZIONI_PARTI", "SPESE_ACCESSORIE", "SOPRAVVENIENZE_NORMATIVE"],
    body: `§1
CONTRATTO DI FORNITURA DI BENI E PRODOTTI

TRA

{{DITTA}}, con sede legale in {{SEDE}}, Partita IVA {{PIVA}} (di seguito, "Fornitore");

E

{{NOME_CONTROPARTE}}{{#if SEDE_CONTROPARTE}}, con sede in {{SEDE_CONTROPARTE}}{{/if}}{{#if PIVA_CONTROPARTE}}, Partita IVA {{PIVA_CONTROPARTE}}{{/if}} (di seguito, "Cliente");

§1
PREMESSO CHE

Il Fornitore è in possesso dei prodotti richiesti dal Cliente e si impegna a fornirli alle condizioni di seguito stabilite.

§1
TUTTO CIÒ PREMESSO, SI CONVIENE E SI STIPULA QUANTO SEGUE

§1
ART. 1 – OGGETTO DELLA FORNITURA
Il Fornitore si impegna a fornire al Cliente i seguenti beni:

{{OGGETTO_FORNITURA}}

§1
ART. 2 – QUANTITÀ E PREZZO
{{#if QUANTITA}}La quantità oggetto della fornitura è: {{QUANTITA}}.{{/if}}
{{#if PREZZO_UNITARIO}}Il prezzo unitario è di € {{PREZZO_UNITARIO}}.{{/if}}
L'importo complessivo è di € {{IMPORTO}}, più IVA.
{{#if DURATA_FORNITURA}}
§1
ART. – DURATA
La fornitura ha la seguente durata: {{DURATA_FORNITURA}}.
{{/if}}
§1
ART. 3 – CONSEGNA
La merce dovrà essere consegnata{{#if DATA_CONSEGNA}} entro il {{DATA_CONSEGNA}}{{/if}}{{#if LUOGO_CONSEGNA}} presso: {{LUOGO_CONSEGNA}}{{/if}}.
{{#if TRASPORTO_SPESE}}
ART. – TRASPORTO E SPESE
{{TRASPORTO_SPESE}}
{{/if}}
§1
ART. 4 – PAGAMENTO
Il pagamento verrà effettuato{{#if MODALITA_PAGAMENTO}} secondo la modalità: {{MODALITA_PAGAMENTO}}{{/if}}{{#if IBAN_PAGAMENTO}} sul conto corrente con IBAN {{IBAN_PAGAMENTO}}{{/if}}. Il Cliente può contestare difetti entro 8 giorni dal ricevimento.
{{#if PENALI}}
§2
ART. – PENALI
{{PENALI}}
{{/if}}
{{#if GARANZIA}}
§2
ART. – GARANZIA
Sui beni forniti è applicata la seguente garanzia: {{GARANZIA}}.
{{/if}}
{{#if MODALITA_RESO}}
§2
ART. – RESO
{{MODALITA_RESO}}
{{/if}}
§2
ART. – OBBLIGHI DELLE PARTI
Il Fornitore si impegna a consegnare i beni conformi alle specifiche e alle normative, a fornire la documentazione tecnica e a sostituire i beni difettosi. Il Cliente si impegna a corrispondere il prezzo e a verificare i beni ricevuti.

§3
ART. – PROPRIETÀ E RESPONSABILITÀ
La proprietà e il rischio si trasferiscono al Cliente al momento della consegna. Fino al pagamento integrale, il Fornitore si riserva la proprietà dei beni (art. 1523 c.c.). Il Fornitore risponde dei vizi dei beni (artt. 1490 e segg. c.c.).

§3
ART. – DOCUMENTAZIONE E CONFORMITÀ
Il Fornitore consegnerà, unitamente ai beni, tutta la documentazione prevista dalla legge: certificato di conformità, istruzioni per l'uso e ogni altra certificazione richiesta.

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

${_SIGN_FORNITORE}`
  },

  noleggio_comodato: {
    title: "Contratto di Noleggio / Comodato",
    required: ["NOME_CONTROPARTE", "DESCRIZIONE_BENE", "DATA_INIZIO", "DATA_FINE", "IMPORTO_CANONE"],
    optional: ["CF_CONTROPARTE", "INDIRIZZO_CONTROPARTE", "TIPO_CONTRATTO", "LUOGO_BENE", "TIPO_CANONE", "CAUZIONE", "STATO_BENE_CONSEGNA", "MANUTENZIONE_OBBLIGHI", "RESPONSABILITA_DANNI", "GARANZIA", "MODALITA_PAGAMENTO", "IBAN_PAGAMENTO", "LUOGO_STIPULA", "DATA_CONTRATTO", "NOTE_AGGIUNTIVE", "FORZA_MAGGIORE", "SOSPENSIONE_CONTRATTO", "DIRITTO_RECESSO", "COMUNICAZIONI_PARTI", "SPESE_ACCESSORIE", "SOPRAVVENIENZE_NORMATIVE"],
    body: `§1
CONTRATTO DI {{TIPO_CONTRATTO|NOLEGGIO/COMODATO}} DI BENI MOBILI

TRA

{{DITTA}}, con sede legale in {{SEDE}}, Partita IVA {{PIVA}} (di seguito, "Concedente");

E

Il/La Sig./Sig.ra {{NOME_CONTROPARTE}}{{#if CF_CONTROPARTE}}, codice fiscale {{CF_CONTROPARTE}}{{/if}}{{#if INDIRIZZO_CONTROPARTE}}, residente in {{INDIRIZZO_CONTROPARTE}}{{/if}} (di seguito, "Beneficiario");

§1
PREMESSO CHE

Il Concedente è proprietario del bene oggetto del presente contratto e intende concederlo in uso al Beneficiario, che dichiara di aver visionato il bene e di accettarlo nelle condizioni in cui si trova.

§1
TUTTO CIÒ PREMESSO, SI CONVIENE E SI STIPULA QUANTO SEGUE

§1
ART. 1 – OGGETTO
Il Concedente consegna al Beneficiario, che accetta, il seguente bene:

{{DESCRIZIONE_BENE}}

§1
ART. 2 – DURATA
Il presente contratto ha decorrenza dal {{DATA_INIZIO}}{{#if DATA_FINE}} e scadenza il {{DATA_FINE}}{{/if}}.
{{#if CAUZIONE}}
§1
ART. – CAUZIONE
{{CAUZIONE}}
{{/if}}
{{#if STATO_BENE_CONSEGNA}}
§1
ART. – STATO DEL BENE ALLA CONSEGNA
{{STATO_BENE_CONSEGNA}}
{{/if}}
{{#if LUOGO_BENE}}
§1
ART. 3 – LUOGO DI CONSEGNA E RESTITUZIONE
Il bene sarà custodito e utilizzato presso: {{LUOGO_BENE}}. La restituzione avverrà presso il medesimo luogo.
{{/if}}
{{#if IMPORTO_CANONE}}
§1
ART. 4 – CANONE
L'importo del canone è di € {{IMPORTO_CANONE}}{{#if TIPO_CANONE}} (tipo {{TIPO_CANONE}}){{/if}}{{#if MODALITA_PAGAMENTO}}, da corrispondersi tramite {{MODALITA_PAGAMENTO}}{{/if}}{{#if IBAN_PAGAMENTO}} sul conto corrente con IBAN {{IBAN_PAGAMENTO}}{{/if}}.
{{/if}}
§2
ART. – OBBLIGHI DEL BENEFICIARIO
Il Beneficiario si impegna a custodire il bene con la diligenza del buon padre di famiglia, a utilizzarlo conformemente alla sua destinazione d'uso, a non cederlo a terzi e a segnalare tempestivamente guasti o danni.
{{#if MANUTENZIONE_OBBLIGHI}}
ART. – MANUTENZIONE
{{MANUTENZIONE_OBBLIGHI}}
{{/if}}
§2
ART. – OBBLIGHI DEL CONCEDENTE
Il Concedente si impegna a consegnare il bene in buono stato di funzionamento e a garantire il pacifico godimento per tutta la durata del contratto.
{{#if RESPONSABILITA_DANNI}}
§2
ART. – RESPONSABILITÀ PER DANNI
{{RESPONSABILITA_DANNI}}
{{/if}}
§2
ART. – RESPONSABILITÀ E RISCHI
Il Beneficiario assume la custodia del bene e risponde dei danni per fatto proprio, colpa o negligenza. Il rischio si trasmette al Beneficiario dal momento della consegna fino alla restituzione.
{{#if GARANZIA}}
§3
ART. – GARANZIA
{{GARANZIA}}
{{/if}}
§3
ART. – RESTITUZIONE
Al termine del contratto, il Beneficiario dovrà restituire il bene nello stesso stato in cui lo ha ricevuto, fatte salve le normali usure. In caso di ritardo, corrisponderà un indennizzo pari al canone giornaliero per ogni giorno di ritardo.

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

${_SIGN_CONCEDENTE}`
  },

  nda: {
    title: "Accordo di Riservatezza (NDA)",
    required: ["NOME_CONTROPARTE", "OGGETTO_NDA", "DURATA_NDA"],
    optional: ["CF_CONTROPARTE", "INDIRIZZO_CONTROPARTE", "SCOPO_NDA", "PENALE_NDA", "OBBLIGHI_CESSAZIONE", "ECCEZIONI_RISERVATEZZA", "LUOGO_STIPULA", "DATA_CONTRATTO", "NOTE_AGGIUNTIVE", "FORZA_MAGGIORE", "SOSPENSIONE_CONTRATTO", "DIRITTO_RECESSO", "COMUNICAZIONI_PARTI", "SPESE_ACCESSORIE", "SOPRAVVENIENZE_NORMATIVE"],
    body: `§1
ACCORDO DI RISERVATEZZA (NON-DISCLOSURE AGREEMENT)

TRA

{{DITTA}}, con sede legale in {{SEDE}}, Partita IVA {{PIVA}} (di seguito, "Parte A");

E

Il/La Sig./Sig.ra {{NOME_CONTROPARTE}}{{#if CF_CONTROPARTE}}, codice fiscale {{CF_CONTROPARTE}}{{/if}}{{#if INDIRIZZO_CONTROPARTE}}, residente in {{INDIRIZZO_CONTROPARTE}}{{/if}} (di seguito, "Parte B");

§1
PREMESSO CHE

{{#if SCOPO_NDA}}Le parti intendono scambiarsi informazioni di natura riservata nell'ambito della seguente finalità:

{{SCOPO_NDA}}{{/if}}

§1
TUTTO CIÒ PREMESSO, SI CONVIENE E SI STIPULA QUANTO SEGUE

§1
ART. 1 – OGGETTO DELLE INFORMAZIONI RISERVATE
Sono oggetto del presente accordo le seguenti informazioni riservate:

{{OGGETTO_NDA}}

§1
ART. 2 – OBBLIGHI DELLE PARTI
Ciascuna parte si impegna a non divulgare a terzi le Informazioni Riservate ricevute, a utilizzarle esclusivamente per le finalità di cui in premessa, ad adottare ogni misura di sicurezza idonea a prevenire la diffusione non autorizzata e a non utilizzarle per finalità concorrenziali.

§1
ART. 3 – DURATA
L'obbligo di riservatezza{{#if DURATA_NDA}} ha durata di {{DURATA_NDA}} anni dalla data del presente accordo, e{{/if}} sopravvive alla eventuale cessazione del rapporto tra le parti.
{{#if ECCEZIONI_RISERVATEZZA}}
§2
ART. – ECCEZIONI
{{ECCEZIONI_RISERVATEZZA}}
{{/if}}
§2
ART. – PROPRIETÀ DELLE INFORMAZIONI
Tutte le Informazioni Riservate rimangono di proprietà esclusiva della parte divulgante. Il presente accordo non costituisce concessione di licenza o altri diritti, salvo espressa diversa volontà scritta.
{{#if PENALE_NDA}}
§2
ART. – PENALE
In caso di violazione degli obblighi di riservatezza, la parte inadempiente corrisponderà una penale pari a € {{PENALE_NDA}}, oltre al risarcimento dell'eventuale ulteriore danno (art. 1382 c.c.).
{{/if}}
{{#if OBBLIGHI_CESSAZIONE}}
§3
ART. – OBBLIGHI ALLA CESSAZIONE
{{OBBLIGHI_CESSAZIONE}}
{{/if}}
§3
ART. – DIVIETO DI SOLLECITAZIONE
Per tutta la durata del presente accordo e per i 12 mesi successivi alla sua cessazione, ciascuna parte si impegna a non sollecitare o assumere i dipendenti dell'altra parte con cui sia venuta in contatto in virtù del presente accordo.

§3
ART. – REGIME RECIPROCO
Il presente accordo è stipulato tra le parti in via recettizia: ciascuna parte agisce sia come divulgante che come ricevente.

  ${_FORZAMAGGIORE_OPT}
  ${_SOSPENSIONE_OPT}
  ${_RECESSO_OPT}
  ${_COMUNICAZIONI_OPT}
  ${_SPESE_ACC_OPT}
  ${_SOPRAVV_OPT}

${_FORO}

${_DATI}

${_NOTE_OPT}

${_NORMATIVA}

${_AVVISO}

${_SIGN_NDA}`
  },

  lettera_incarico: {
    title: "Lettera di Incarico",
    required: ["NOME_CONTROPARTE", "OGGETTO_INCARICO", "DATA_INIZIO", "COMPENSO"],
    optional: ["CF_CONTROPARTE", "INDIRIZZO_CONTROPARTE", "DATA_FINE", "MODALITA_ESECUZIONE", "PATTO_RISERVATEZZA", "RIMBORSI_SPESE", "MODALITA_PAGAMENTO", "IBAN_PAGAMENTO", "LUOGO_STIPULA", "DATA_CONTRATTO", "NOTE_AGGIUNTIVE", "FORZA_MAGGIORE", "SOSPENSIONE_CONTRATTO", "DIRITTO_RECESSO", "COMUNICAZIONI_PARTI", "SPESE_ACCESSORIE", "SOPRAVVENIENZE_NORMATIVE"],
    body: `§1
LETTERA DI INCARICO PROFESSIONALE

Il/La sottoscritto/a {{DITTA}}, con sede legale in {{SEDE}}, Partita IVA {{PIVA}},

PREMESSO

- Che la propria attività richiede l'esecuzione di specifiche prestazioni professionali da affidare a soggetto esterno qualificato;
- Che il/La Sig./Sig.ra {{NOME_CONTROPARTE}}{{#if CF_CONTROPARTE}}, codice fiscale {{CF_CONTROPARTE}}{{/if}}{{#if INDIRIZZO_CONTROPARTE}}, residente in {{INDIRIZZO_CONTROPARTE}}{{/if}} (di seguito, "Incaricato/a"), ha dichiarato di possedere i requisiti professionali necessari;

CON LA PRESENTE

AFFIDA A

Il/La Sig./Sig.ra {{NOME_CONTROPARTE}},

il seguente incarico professionale:

{{OGGETTO_INCARICO}}

§1
ART. 1 – DURATA
L'incarico ha decorrenza dal {{DATA_INIZIO}}{{#if DATA_FINE}} e dovrà essere completato entro il {{DATA_FINE}}{{/if}}.

§1
ART. 2 – COMPENSO E PAGAMENTO
Il compenso pattuito per l'incarico è di € {{COMPENSO}}{{#if MODALITA_PAGAMENTO}}, da corrispondersi tramite {{MODALITA_PAGAMENTO}}{{/if}}{{#if IBAN_PAGAMENTO}} sul conto corrente con IBAN {{IBAN_PAGAMENTO}}{{/if}}. Il compenso è al netto degli oneri fiscali e previdenziali a carico dell'Incaricato/a.
{{#if MODALITA_ESECUZIONE}}
§1
ART. – MODALITÀ DI SVOLGIMENTO
{{MODALITA_ESECUZIONE}}
{{/if}}
{{#if RIMBORSI_SPESE}}
§1
ART. – RIMBORSI SPESE
{{RIMBORSI_SPESE}}
{{/if}}
§1
ART. 3 – OBBLIGHI DELLE PARTI
L'Incaricato/a si impegna a svolgere l'incarico con diligenza e a regola d'arte, in piena autonomia organizzativa. Il Committente si impegna a corrispondere il compenso e a fornire le informazioni necessarie.
${_RISERV_OPT}

§2
ART. – RESPONSABILITÀ E GARANZIA
L'Incaricato/a risponde della corretta esecuzione dell'incarico e si impegna a porre rimedio a eventuali difetti a proprie spese. È responsabile dei danni per dolo o colpa grave.

§3
ART. – PROPRIETÀ INTELLETTUALE E PREVIDENZA
Gli elaborati e i prodotti dell'incarico sono di proprietà del Committente, salvi i diritti morali dell'Incaricato/a. L'Incaricato/a è responsabile degli adempimenti fiscali e previdenziali propri, compresa l'eventuale iscrizione alla gestione separata INPS.

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

${_SIGN_INCARICO}`
  },

  verbale_generico: {
    title: "Verbale di Accordo",
    required: ["NOME_CONTROPARTE", "OGGETTO_ACCORDO", "DATA_INIZIO", "LUOGO_STIPULA"],
    optional: ["CF_CONTROPARTE", "CONDIZIONI", "DATA_FINE", "IMPEGNI_SPECIFICI", "TEMPISTICHE", "PENALI", "IMPORTO", "MODALITA_PAGAMENTO", "IBAN_PAGAMENTO", "DATA_CONTRATTO", "NOTE_AGGIUNTIVE", "FORZA_MAGGIORE", "SOSPENSIONE_CONTRATTO", "DIRITTO_RECESSO", "COMUNICAZIONI_PARTI", "SPESE_ACCESSORIE", "SOPRAVVENIENZE_NORMATIVE"],
    body: `§1
VERBALE DI ACCORDO TRA LE PARTI

TRA

1) {{DITTA}}, con sede legale in {{SEDE}}, Partita IVA {{PIVA}} (di seguito, "Parte 1");

2) {{NOME_CONTROPARTE}}{{#if CF_CONTROPARTE}}, codice fiscale {{CF_CONTROPARTE}}{{/if}} (di seguito, "Parte 2");

§1
PREMESSO CHE

Le parti si incontrano per definire e formalizzare il seguente accordo, nell'interesse reciproco e in base alle rispettive esigenze.

§1
LE PARTI CONVENGONO QUANTO SEGUE

§1
ART. 1 – OGGETTO DELL'ACCORDO
Oggetto del presente accordo è:

{{OGGETTO_ACCORDO}}

§1
{{#if CONDIZIONI}}
ART. 2 – CONTENUTO E PUNTI CONCORDATI
Le condizioni pattuite tra le parti sono le seguenti:

{{CONDIZIONI}}
{{/if}}

§1
ART. 3 – DATA E LUOGO
L'accordo ha decorrenza dal {{DATA_INIZIO}}{{#if DATA_FINE}} e scadenza il {{DATA_FINE}}{{/if}}{{#if LUOGO_STIPULA}}, stipulato a {{LUOGO_STIPULA}}{{/if}}.
{{#if IMPEGNI_SPECIFICI}}
§2
ART. – IMPEGNI SPECIFICI
{{IMPEGNI_SPECIFICI}}
{{/if}}
{{#if TEMPISTICHE}}
§2
ART. – TEMPISTICHE
{{TEMPISTICHE}}
{{/if}}
{{#if IMPORTO}}
§2
ART. – CORRISPETTIVO
L'importo complessivo pattuito è di € {{IMPORTO}}, più IVA ove applicabile{{#if MODALITA_PAGAMENTO}}. Il pagamento verrà effettuato tramite {{MODALITA_PAGAMENTO}}{{/if}}{{#if IBAN_PAGAMENTO}} sul conto corrente con IBAN {{IBAN_PAGAMENTO}}{{/if}}.
{{/if}}
{{#if PENALI}}
§2
ART. – PENALI
{{PENALI}}
{{/if}}
§2
ART. – OBBLIGHI DELLE PARTI
Ciascuna parte si impegna a eseguire le proprie obbligazioni con diligenza e buona fede (art. 1375 c.c.), a comunicare tempestivamente eventuali difficoltà e a mantenere la riservatezza sulle informazioni acquisite.

§2
ART. – RESPONSABILITÀ
Ciascuna parte risponde dell'inadempimento delle proprie obbligazioni e dei danni cagionati per dolo o colpa (artt. 1218 e 1223 c.c.).

§3
ART. – VARIAZIONI E INTESE
Eventuali variazioni o modifiche saranno efficaci solo se redatte per iscritto e sottoscritte da entrambe le parti.

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

${_SIGN_VERBALE}`
  },
};