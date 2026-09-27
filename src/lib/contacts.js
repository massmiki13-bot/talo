// Costanti e utilità per clienti e fornitori.

export const CATEGORIE_CLIENTE = ["Privato", "Condominio", "Impresa", "Ente pubblico", "Studio tecnico", "Amministratore"];
export const CATEGORIE_FORNITORE = ["Materiali edili", "Ferramenta", "Impianti elettrici", "Idraulica", "Noleggio mezzi", "Subappaltatore", "Trasporti", "Professionista"];

export const MODALITA_PAGAMENTO = [
  "Bonifico bancario",
  "Bonifico 30 gg data fattura",
  "Bonifico 60 gg data fattura",
  "Bonifico 30 gg fine mese",
  "Ri.Ba. 30 gg",
  "Ri.Ba. 60 gg",
  "Contanti / assegno",
  "Acconto 30% – saldo a fine lavori",
  "Acconto, SAL e saldo",
];

export const TIPO_LABEL = { cliente: "Cliente", fornitore: "Fornitore", entrambi: "Cliente e fornitore" };
export const SOGGETTO_LABEL = { privato: "Privato", azienda: "Azienda", ente: "Ente pubblico" };

export const displayName = (c) => (c?.nome || c?.nome_privato || "").trim() || "Senza nome";

// Un contatto "entrambi" compare sia tra i clienti sia tra i fornitori.
export const isCliente = (c) => c.tipo === "cliente" || c.tipo === "entrambi" || !c.tipo;
export const isFornitore = (c) => c.tipo === "fornitore" || c.tipo === "entrambi";

export const fullAddress = (a) => [a?.indirizzo, [a?.cap, a?.citta, a?.provincia && `(${a.provincia})`].filter(Boolean).join(" ")].filter(Boolean).join(", ");

export const mapsUrl = (a) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress(a))}`;

export const phoneHref = (p) => `tel:${String(p || "").replace(/[^\d+]/g, "")}`;

// WhatsApp vuole il numero con prefisso internazionale senza "+".
export const whatsappHref = (p) => {
  let n = String(p || "").replace(/[^\d+]/g, "");
  if (n.startsWith("+")) n = n.slice(1);
  else if (n.startsWith("00")) n = n.slice(2);
  else if (/^3\d{8,9}$/.test(n)) n = `39${n}`;
  return `https://wa.me/${n}`;
};

export const normalize = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, "");

// Possibili doppioni: stessa P.IVA, codice fiscale o email.
export function findDuplicates(contacts, form, excludeId) {
  const keys = [
    ["partita_iva", "P.IVA"],
    ["codice_fiscale", "codice fiscale"],
    ["email", "email"],
  ];
  const out = [];
  for (const c of contacts) {
    if (c.id === excludeId) continue;
    for (const [k, label] of keys) {
      if (form[k] && normalize(c[k]) === normalize(form[k])) {
        out.push({ contact: c, field: label });
        break;
      }
    }
  }
  return out;
}

export const fmtEur = (n) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(Number(n) || 0);
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("it-IT") : "—");
