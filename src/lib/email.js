// Utilità per la posta: firma, modelli, indirizzi.

export const escapeHtml = (text) =>
  String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;
export const isEmail = (s) => EMAIL_RE.test(String(s || "").trim());

// Firma HTML: quella personalizzata della casella, altrimenti i dati della ditta.
export function buildSignatureHtml(profile, account) {
  if (account?.firma_html?.trim()) {
    return `<div style="border-top:1px solid #cbd5e1;padding-top:8px;margin-top:16px;font-size:12px;line-height:1.5;color:#475569">${account.firma_html}</div>`;
  }
  if (!profile) return "";
  const lines = [];
  if (profile.logo_url) {
    lines.push(`<img src="${escapeHtml(profile.logo_url)}" alt="Logo" style="max-height:70px;max-width:220px;display:block;margin-bottom:8px" />`);
  }
  if (account?.display_name && account.display_name !== profile.ragione_sociale) {
    lines.push(`<span style="color:#1e293b">${escapeHtml(account.display_name)}</span>`);
  }
  lines.push(`<strong style="font-size:13px;color:#1e293b">${escapeHtml(profile.ragione_sociale)}</strong>`);
  if (profile.indirizzo) lines.push(escapeHtml(profile.indirizzo));
  const city = [profile.cap, profile.citta, profile.provincia && `(${profile.provincia})`].filter(Boolean).join(" ");
  if (city) lines.push(escapeHtml(city));
  const contacts = [];
  if (profile.telefono) contacts.push(`Tel. ${escapeHtml(profile.telefono)}`);
  if (profile.email) contacts.push(escapeHtml(profile.email));
  if (profile.pec) contacts.push(`PEC ${escapeHtml(profile.pec)}`);
  if (profile.sito_web) contacts.push(escapeHtml(profile.sito_web));
  if (contacts.length) lines.push(contacts.join(" · "));
  const fiscal = [];
  if (profile.partita_iva) fiscal.push(`P.IVA ${escapeHtml(profile.partita_iva)}`);
  if (profile.codice_destinatario) fiscal.push(`Cod. SDI ${escapeHtml(profile.codice_destinatario)}`);
  if (fiscal.length) lines.push(fiscal.join(" · "));
  return `<div style="border-top:1px solid #cbd5e1;padding-top:8px;margin-top:16px;font-size:12px;line-height:1.5;color:#475569">${lines.join("<br/>")}</div>`;
}

// Documento completo inviato: stile base leggibile in tutti i client di posta.
export function wrapEmailHtml(bodyHtml, signatureHtml = "") {
  // Stili in linea: molti client di posta ignorano i fogli di stile.
  const body = String(bodyHtml || "")
    .replace(/<p>/g, '<p style="margin:0 0 12px">')
    .replace(/<blockquote>/g, '<blockquote style="margin:12px 0;padding-left:12px;border-left:3px solid #cbd5e1;color:#475569">');
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#0f172a">${body}${signatureHtml}</div>`;
}

export function htmlToText(html) {
  // DOMParser crea un documento inerte: niente script né caricamento immagini.
  const src = String(html || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6])>/gi, "\n");
  const doc = new DOMParser().parseFromString(src, "text/html");
  return (doc.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}

export function textToHtml(text) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

// ─── Modelli ───

export const TEMPLATE_VARIABLES = [
  { key: "cliente", label: "Nome cliente" },
  { key: "numero_preventivo", label: "N° preventivo" },
  { key: "oggetto_preventivo", label: "Oggetto preventivo" },
  { key: "totale", label: "Importo totale" },
  { key: "cantiere", label: "Lavoro / cantiere" },
  { key: "data", label: "Data di oggi" },
  { key: "azienda", label: "Nome della ditta" },
];

export function fillTemplate(text, vars = {}) {
  return String(text || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key) =>
    vars[key] !== undefined && vars[key] !== null && vars[key] !== "" ? String(vars[key]) : m);
}

export const TEMPLATE_TYPES = [
  { value: "preventivo", label: "Preventivo" },
  { value: "sollecito", label: "Sollecito pagamento" },
  { value: "appuntamento", label: "Appuntamento" },
  { value: "documenti", label: "Invio documenti" },
  { value: "fattura", label: "Fattura" },
  { value: "pec", label: "PEC" },
  { value: "generico", label: "Generico" },
];

// Modelli pronti, proposti finché l'azienda non ne crea di propri.
export const DEFAULT_TEMPLATES = [
  {
    id: "default-preventivo",
    nome: "Invio preventivo",
    tipo: "preventivo",
    oggetto: "Preventivo n. {{numero_preventivo}} – {{oggetto_preventivo}}",
    corpo: "<p>Gentile {{cliente}},</p><p>come da accordi, Le inviamo in allegato il preventivo n. {{numero_preventivo}} relativo a <strong>{{oggetto_preventivo}}</strong>, per un importo complessivo di {{totale}}.</p><p>Restiamo a disposizione per qualsiasi chiarimento o modifica. Per accettare l'offerta è sufficiente rispondere a questa email o restituirci il documento firmato.</p><p>Cordiali saluti</p>",
  },
  {
    id: "default-sollecito",
    nome: "Sollecito di pagamento",
    tipo: "sollecito",
    oggetto: "Sollecito di pagamento – {{cantiere}}",
    corpo: "<p>Gentile {{cliente}},</p><p>dalle nostre verifiche risulta ancora da saldare l'importo di {{totale}} relativo ai lavori <strong>{{cantiere}}</strong>.</p><p>La preghiamo di provvedere al pagamento entro 10 giorni dal ricevimento della presente. Qualora avesse già provveduto, La preghiamo di non considerare questo messaggio e di inviarci copia della contabile.</p><p>Cordiali saluti</p>",
  },
  {
    id: "default-appuntamento",
    nome: "Conferma appuntamento",
    tipo: "appuntamento",
    oggetto: "Conferma appuntamento – {{cantiere}}",
    corpo: "<p>Gentile {{cliente}},</p><p>Le confermiamo l'appuntamento per il sopralluogo/i lavori presso <strong>{{cantiere}}</strong> in data <strong>[data e ora]</strong>.</p><p>In caso di imprevisti La preghiamo di avvisarci con almeno 24 ore di anticipo.</p><p>Cordiali saluti</p>",
  },
  {
    id: "default-documenti",
    nome: "Invio documenti",
    tipo: "documenti",
    oggetto: "Invio documentazione – {{cantiere}}",
    corpo: "<p>Gentile {{cliente}},</p><p>in allegato Le trasmettiamo la documentazione richiesta relativa a <strong>{{cantiere}}</strong>.</p><p>Restiamo a disposizione per ogni ulteriore necessità.</p><p>Cordiali saluti</p>",
  },
  {
    id: "default-pec",
    nome: "Comunicazione formale (PEC)",
    tipo: "pec",
    oggetto: "Comunicazione – {{azienda}}",
    corpo: "<p>Spett.le {{cliente}},</p><p>con la presente, a mezzo Posta Elettronica Certificata, Vi comunichiamo quanto segue:</p><p>[testo della comunicazione]</p><p>La presente ha valore di comunicazione formale ai sensi di legge.</p><p>Distinti saluti</p>",
  },
];

export const formatBytes = (n) => {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

export const MAX_ATTACHMENTS_BYTES = 20 * 1024 * 1024;

export const PEC_LABELS = {
  "posta-certificata": "PEC",
  accettazione: "Ricevuta di accettazione",
  "avvenuta-consegna": "Ricevuta di consegna",
  "non-accettazione": "Mancata accettazione",
  "errore-consegna": "Errore di consegna",
  "preavviso-errore-consegna": "Preavviso errore consegna",
  "presa-in-carico": "Presa in carico",
  errore: "Anomalia PEC",
};
