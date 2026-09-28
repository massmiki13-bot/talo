// Firma da telefono di contratti e POS: link segreto, impronta del testo, stato delle firme.
// Le impronte devono restare identiche a quelle del server (api/_lib/sign.js).
async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const contractHash = (d) => sha256(JSON.stringify([d.titolo || "", d.contenuto_finale || ""]));
export const posHash = (d) => sha256(JSON.stringify([d.titolo || "", Number(d.revisione) || 0, d.dati || {}]));

export const signUrl = (token) => `${window.location.origin}/firma/${token}`;

/** Stesso elenco del server: lavoratori, preposto, RLS, RSPP. */
export function posSigners(plan) {
  const d = plan.dati || {};
  const i = d.impresa || {};
  const list = (d.lavoratori || []).filter((l) => l.nome).map((l) => ({ id: `lav:${l.id || l.nome}`, nome: l.nome, ruolo: l.mansione || "Lavoratore" }));
  if (i.capocantiere) list.push({ id: "preposto", nome: i.capocantiere, ruolo: "Preposto / capocantiere" });
  if (i.rls) list.push({ id: "rls", nome: i.rls, ruolo: "RLS / RLST" });
  if (i.rspp) list.push({ id: "rspp", nome: i.rspp, ruolo: "RSPP" });
  return list;
}

export const fmtDateTime = (s) => (s ? new Date(s).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
