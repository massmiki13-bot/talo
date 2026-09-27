// Dati di un'azienda dalla partita IVA (registro europeo VIES).
import { handler, requireUser, HttpError, rateLimit } from "./_lib/server.js";

const titleCase = (s) => String(s || "").toLowerCase().replace(/(^|[\s'’.-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

// "VIA ROMA 12 \n39100 BOLZANO BZ\n" → { indirizzo, cap, citta, provincia }
export function parseItalianAddress(raw) {
  const lines = String(raw || "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out = { indirizzo: "", cap: "", citta: "", provincia: "" };
  if (!lines.length) return out;
  const last = lines[lines.length - 1];
  const m = last.match(/^(\d{5})\s+(.+?)(?:\s+([A-Z]{2}))?$/);
  if (m) {
    out.cap = m[1];
    out.citta = titleCase(m[2]);
    out.provincia = m[3] || "";
    out.indirizzo = titleCase(lines.slice(0, -1).join(", "));
  } else {
    out.indirizzo = titleCase(lines.join(", "));
  }
  return out;
}

export default handler(async (req, body) => {
  const { user } = await requireUser(req);
  rateLimit(`vies:${user.id}`, 20, 60_000);
  const raw = String(body.partita_iva || "").replace(/\s+/g, "").toUpperCase();
  const country = /^[A-Z]{2}/.test(raw) ? raw.slice(0, 2) : "IT";
  const vat = raw.replace(/^[A-Z]{2}/, "");
  if (!/^[0-9A-Z]{8,12}$/.test(vat)) throw new HttpError(400, "Partita IVA non valida");

  let data;
  try {
    const res = await fetch(`https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${country}/vat/${vat}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    data = await res.json();
  } catch {
    throw new HttpError(503, "Il servizio europeo di verifica P.IVA non risponde, riprova tra poco");
  }
  if (data.userError && !["VALID", "INVALID"].includes(data.userError)) {
    throw new HttpError(503, "Il servizio europeo di verifica P.IVA è temporaneamente non disponibile");
  }
  if (!data.isValid) return { valid: false };

  const name = data.name && data.name !== "---" ? data.name.trim() : "";
  return {
    valid: true,
    ragione_sociale: name ? name.replace(/\s+/g, " ") : "",
    ...(data.address && data.address !== "---" ? parseItalianAddress(data.address) : {}),
  };
});
