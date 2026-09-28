export const PERMISSION_MODULES = [
  { key: "dashboard", label: "Dashboard", path: "/" },
  { key: "contatti", label: "Clienti e Fornitori", path: "/contatti" },
  { key: "preventivi", label: "Preventivi", path: "/preventivi" },
  { key: "lavori", label: "Lavori", path: "/lavori" },
  { key: "dipendenti", label: "Dipendenti", path: "/dipendenti" },
  { key: "documenti_ditta", label: "Documenti Ditta", path: "/documenti-ditta" },
  { key: "promemoria", label: "Promemoria", path: "/promemoria" },
  { key: "contratti", label: "Contratti", path: "/contratti" },
  { key: "presenze", label: "Presenze", path: "/presenze" },
  { key: "analisi", label: "Analisi", path: "/analisi", legacyPerms: ["report_annuale"] },
];

export const HOST_ONLY_PATHS = ["/profilo-ditta", "/collaboratori"];