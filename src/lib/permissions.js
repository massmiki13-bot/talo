export const PERMISSION_MODULES = [
  { key: "dashboard", label: "Dashboard", path: "/" },
  { key: "contatti", label: "Clienti e Fornitori", path: "/contatti" },
  { key: "preventivi", label: "Preventivi", path: "/preventivi" },
  { key: "prezzari", label: "Prezzari", path: "/prezzari", legacyPerms: ["preventivi"] },
  { key: "fatture", label: "Fatture", path: "/fatture" },
  { key: "scadenzario", label: "Scadenzario incassi", path: "/scadenzario", legacyPerms: ["fatture"] },
  { key: "lavori", label: "Lavori", path: "/lavori" },
  { key: "cronoprogramma", label: "Cronoprogramma", path: "/cronoprogramma", legacyPerms: ["lavori"] },
  { key: "mezzi", label: "Mezzi e attrezzature", path: "/mezzi", legacyPerms: ["lavori"] },
  { key: "dipendenti", label: "Dipendenti", path: "/dipendenti" },
  { key: "sicurezza", label: "Sicurezza (POS)", path: "/sicurezza" },
  { key: "documenti_ditta", label: "Documenti Ditta", path: "/documenti-ditta" },
  { key: "promemoria", label: "Promemoria", path: "/promemoria" },
  { key: "contratti", label: "Contratti", path: "/contratti" },
  { key: "presenze", label: "Presenze", path: "/presenze" },
  { key: "squadra", label: "Richieste e segnalazioni", path: "/squadra", legacyPerms: ["presenze", "dipendenti"] },
  { key: "analisi", label: "Analisi", path: "/analisi", legacyPerms: ["report_annuale"] },
];

export const HOST_ONLY_PATHS = ["/profilo-ditta", "/collaboratori"];