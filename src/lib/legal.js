// Testi legali di Talo. I dati del fornitore vanno completati qui (un solo punto) e i testi fatti
// rivedere da un legale prima della vendita: sono una base solida, non una consulenza.

export const PROVIDER = {
  nome: "[DA COMPLETARE: ragione sociale del fornitore di Talo]",
  piva: "[DA COMPLETARE: partita IVA]",
  sede: "[DA COMPLETARE: sede legale]",
  email: "talo.application@gmail.com",
  pec: "[DA COMPLETARE: PEC]",
};
export const LEGAL_VERSION = "2026-09-28";
export const LEGAL_UPDATED = "28 settembre 2026";
export const providerIncomplete = () => Object.values(PROVIDER).some((v) => String(v).startsWith("[DA COMPLETARE"));

// Fornitori esterni che trattano dati per conto di Talo (sub-responsabili).
export const SUBPROCESSORS = [
  { nome: "Supabase Inc.", servizio: "Database, autenticazione e archivio file", sede: "Società statunitense; dati nella regione cloud del progetto. Eventuali trasferimenti fuori dall'UE coperti da Clausole Contrattuali Standard UE" },
  { nome: "Vercel Inc.", servizio: "Hosting dell'applicazione e funzioni server", sede: "USA (Clausole Contrattuali Standard UE e Data Privacy Framework)" },
  { nome: "Google LLC (Gemini API)", servizio: "Funzioni di intelligenza artificiale (lettura documenti, testi, suggerimenti)", sede: "USA (Clausole Contrattuali Standard UE e Data Privacy Framework)" },
  { nome: "Fornitori di posta scelti dal Cliente", servizio: "Invio e ricezione email e PEC tramite le caselle collegate dal Cliente", sede: "Secondo il fornitore scelto dal Cliente" },
];

const P = PROVIDER;

export const DOCS = {
  privacy: {
    title: "Informativa privacy",
    intro: `Questa informativa spiega come ${P.nome} tratta i dati personali di chi si registra e usa Talo, ai sensi degli artt. 13 e 14 del Regolamento (UE) 2016/679 ("GDPR").`,
    sections: [
      ["Titolare del trattamento", `${P.nome}, P.IVA ${P.piva}, con sede in ${P.sede}. Contatti: ${P.email} – PEC ${P.pec}.`],
      ["Quali dati trattiamo", "Dati dell'account (nome, email, password cifrata), dati di utilizzo e tecnici (indirizzo IP, data e ora degli accessi, registri di sicurezza), comunicazioni con l'assistenza. I dati che le imprese inseriscono in Talo su propri dipendenti, clienti e fornitori sono trattati da noi solo per conto dell'impresa, come responsabile del trattamento: per quelli vale l'Accordo sul trattamento dei dati."],
      ["Perché e su quale base", "a) fornire il servizio e gestire l'account (esecuzione del contratto, art. 6.1.b); b) sicurezza, prevenzione di abusi e continuità del servizio (legittimo interesse, art. 6.1.f); c) adempimenti di legge, fiscali e contabili (obbligo legale, art. 6.1.c); d) comunicazioni sul servizio, come aggiornamenti e scadenze dell'abbonamento (esecuzione del contratto)."],
      ["Per quanto tempo", "Per la durata dell'account e, dopo la cancellazione, fino a 30 giorni per le copie di sicurezza; i dati di fatturazione per 10 anni come richiesto dalla legge; i registri di sicurezza per 12 mesi."],
      ["A chi li comunichiamo", "Solo ai fornitori che ci servono per erogare il servizio, nominati responsabili del trattamento (hosting, database, email, intelligenza artificiale), e alle autorità quando la legge lo impone. Non vendiamo dati e non li usiamo per pubblicità."],
      ["Trasferimenti fuori dall'UE", "Alcuni fornitori hanno sede negli Stati Uniti: il trasferimento avviene con le Clausole Contrattuali Standard approvate dalla Commissione europea e, dove disponibile, con il Data Privacy Framework UE-USA."],
      ["Intelligenza artificiale", "Le funzioni con IA inviano al fornitore del modello solo il testo o il documento necessario per la richiesta. Secondo le condizioni del servizio API usato, questi dati non vengono impiegati per addestrare i modelli. I risultati sono suggerimenti da verificare."],
      ["I tuoi diritti", "Puoi chiedere accesso, rettifica, cancellazione, limitazione, portabilità e opporti al trattamento scrivendo a " + P.email + ". Puoi esportare e cancellare i tuoi dati anche da Profilo ditta › Dati e privacy. Hai diritto di presentare reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it)."],
      ["Cookie", "Talo usa solo archiviazione tecnica necessaria al funzionamento (sessione di accesso e preferenze dell'interfaccia). Non usa cookie di profilazione né strumenti pubblicitari."],
    ],
  },
  termini: {
    title: "Termini di servizio",
    intro: `Questi termini regolano l'uso di Talo, il gestionale per imprese edili e di impianti fornito da ${P.nome} ("Fornitore") all'impresa che crea l'account ("Cliente").`,
    sections: [
      ["Il servizio", "Talo è un software in cloud per gestire clienti, preventivi, lavori, presenze, documenti, contratti, sicurezza, fatture e analisi, con funzioni di intelligenza artificiale. Le funzioni disponibili dipendono dal piano scelto."],
      ["Account e accessi", "Il Cliente è responsabile delle credenziali proprie e dei collaboratori che invita, dei permessi che assegna e delle attività svolte con il suo account. Deve avvisare subito il Fornitore in caso di accesso non autorizzato."],
      ["Dati del Cliente", "I dati inseriti restano del Cliente. Il Fornitore li tratta solo per erogare il servizio, come responsabile del trattamento secondo l'Accordo sul trattamento dei dati, che fa parte di questi termini. Il Cliente garantisce di avere una base giuridica per trattare i dati dei propri dipendenti, clienti e fornitori e di averli informati."],
      ["Documenti generati e IA", "Preventivi, contratti, POS, fatture e testi prodotti o suggeriti da Talo, anche con l'intelligenza artificiale, sono strumenti di lavoro: il Cliente li verifica e ne resta responsabile. Talo non sostituisce il consulente legale, fiscale, il commercialista o il responsabile della sicurezza. I file XML delle fatture vanno trasmessi dal Cliente al Sistema di Interscambio tramite il proprio intermediario."],
      ["Uso consentito", "È vietato usare Talo per attività illecite, caricare contenuti che violano diritti di terzi, tentare di accedere a dati di altri clienti o compromettere la sicurezza del servizio."],
      ["Disponibilità e assistenza", "Il Fornitore si impegna a mantenere il servizio disponibile e sicuro, con copie di sicurezza periodiche, ma non garantisce un funzionamento privo di interruzioni. Gli interventi programmati sono comunicati quando possibile."],
      ["Corrispettivi", "I prezzi e la durata dei piani sono indicati al momento dell'acquisto. In caso di mancato pagamento il Fornitore può sospendere l'accesso dopo un preavviso."],
      ["Responsabilità", "Nei limiti di legge, la responsabilità del Fornitore è limitata ai danni diretti e all'importo pagato dal Cliente nei 12 mesi precedenti l'evento. Restano esclusi i casi di dolo o colpa grave."],
      ["Recesso, esportazione e cancellazione", "Il Cliente può recedere in qualsiasi momento. Prima di cancellare l'account può esportare tutti i dati e i documenti da Profilo ditta › Dati e privacy. Dopo la cancellazione i dati sono eliminati; le copie di sicurezza vengono sovrascritte entro 30 giorni."],
      ["Modifiche", "Il Fornitore può aggiornare questi termini comunicandolo con almeno 30 giorni di anticipo; il Cliente che non accetta può recedere."],
      ["Legge e foro", "Si applica la legge italiana. Per le controversie tra imprese è competente in via esclusiva il foro della sede del Fornitore."],
    ],
  },
  dpa: {
    title: "Accordo sul trattamento dei dati",
    intro: `Accordo ai sensi dell'art. 28 GDPR tra il Cliente, titolare del trattamento, e ${P.nome}, responsabile del trattamento, per i dati personali che il Cliente inserisce in Talo.`,
    sections: [
      ["Oggetto e durata", "Il Responsabile tratta i dati personali per conto del Cliente al solo scopo di fornire Talo, per tutta la durata del contratto e per il tempo necessario alla restituzione o cancellazione dei dati."],
      ["Categorie di interessati e di dati", "Dipendenti e collaboratori del Cliente (anagrafica, contatti, dati contrattuali e retributivi, presenze e ore, formazione, idoneità alla mansione, documenti d'identità), clienti e fornitori del Cliente (anagrafica, dati fiscali, contatti, comunicazioni, documenti), referenti di cantiere. Il giudizio di idoneità del medico competente è un dato relativo alla salute (art. 9): il Cliente carica solo il giudizio di idoneità, non cartelle sanitarie."],
      ["Istruzioni", "Il Responsabile tratta i dati solo su istruzione documentata del Cliente, costituita da questo accordo e dall'uso delle funzioni di Talo, e informa il Cliente se ritiene che un'istruzione violi la normativa."],
      ["Riservatezza", "Le persone autorizzate dal Responsabile a trattare i dati sono vincolate alla riservatezza."],
      ["Misure di sicurezza (art. 32)", "Comunicazioni cifrate (HTTPS/TLS); separazione logica dei dati di ogni cliente con controlli d'accesso sul database; ruoli e permessi per i collaboratori; documenti sensibili in archivio privato apribili solo con link firmati a scadenza; password delle caselle email conservate separatamente e mai restituite all'applicazione; copie di sicurezza; registri degli accessi e delle modifiche."],
      ["Sub-responsabili", "Il Cliente autorizza il ricorso ai sub-responsabili elencati sotto. Il Responsabile impone loro obblighi equivalenti e comunica con anticipo eventuali cambiamenti, consentendo al Cliente di opporsi."],
      ["Assistenza al Cliente", "Il Responsabile aiuta il Cliente a rispondere alle richieste degli interessati (accesso, rettifica, cancellazione, portabilità), anche con le funzioni di esportazione e cancellazione di Talo, e nelle valutazioni d'impatto quando necessarie."],
      ["Violazioni dei dati", "Il Responsabile comunica al Cliente ogni violazione dei dati personali senza ingiustificato ritardo e comunque entro 48 ore da quando ne è venuto a conoscenza, con le informazioni disponibili per consentire al Cliente di notificarla entro 72 ore."],
      ["Fine del trattamento", "Alla cessazione del servizio il Cliente può esportare i propri dati; il Responsabile li cancella entro 30 giorni, salvo obblighi di legge di conservazione."],
      ["Verifiche", "Il Responsabile mette a disposizione le informazioni necessarie a dimostrare il rispetto di questo accordo e consente verifiche ragionevoli, con preavviso e a spese del Cliente."],
    ],
  },
};
