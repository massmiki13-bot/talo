// Area cliente: con il link segreto del lavoro (data.cliente_token) il cliente vede avanzamento, foto,
// diario dei lavori e i documenti segnati "visibili al cliente". Mai costi, margini o note interne.
import { admin, HttpError } from "./server.js";
import { privatePath, signPrivateUrl } from "./files.js";

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined && obj?.[k] !== null).map((k) => [k, obj[k]]));

async function rows(entity, tenantId, field, value, limit = 200) {
  const { data } = await admin().from("entity_records").select("id, data, created_date").eq("tenant_id", tenantId).eq("entity", entity).eq(`data->>${field}`, value)
    .order("created_date", { ascending: false }).limit(limit);
  return (data || []).map((r) => ({ id: r.id, ...r.data, created_date: r.created_date }));
}

// I file privati si aprono con un link firmato di 2 ore; quelli pubblici restano come sono.
async function openUrl(url) {
  const path = url && privatePath(url);
  if (!path) return url || "";
  return signPrivateUrl(path, 7200).catch(() => "");
}

export async function getClientArea(token) {
  if (!token || !/^[A-Za-z0-9_-]{20,40}$/.test(token)) throw new HttpError(404, "Link non valido");
  const { data: row, error } = await admin().from("entity_records").select("*").eq("entity", "Worksite").eq("data->>cliente_token", token).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!row) throw new HttpError(404, "Link non valido o disattivato");
  const w = row.data;
  const share = { foto: true, documenti: true, diario: true, pagamenti: false, ...(w.cliente_condivisione || {}) };

  const { data: prof } = await admin().from("entity_records").select("data").eq("entity", "CompanyProfile").eq("tenant_id", row.tenant_id).order("created_date").limit(1).maybeSingle();
  const [photos, docs, logs, payments] = await Promise.all([
    share.foto ? rows("WorksitePhoto", row.tenant_id, "worksite_id", row.id, 120) : [],
    share.documenti ? rows("CompanyDocument", row.tenant_id, "worksite_id", row.id, 100) : [],
    share.diario ? rows("WorksiteLog", row.tenant_id, "worksite_id", row.id, 30) : [],
    share.pagamenti ? rows("WorksitePayment", row.tenant_id, "worksite_id", row.id, 100) : [],
  ]);

  return {
    impresa: pick(prof?.data, ["ragione_sociale", "telefono", "email", "logo_url", "indirizzo", "citta"]),
    lavoro: {
      ...pick(w, ["nome", "indirizzo", "tipo_intervento", "stato", "data_inizio", "data_fine_prevista", "data_fine_effettiva", "avanzamento", "cliente_nome", "direttore_lavori"]),
      fasi: (w.fasi || []).map((f) => pick(f, ["nome", "peso", "completamento"])),
      aggiornato: row.updated_date,
    },
    foto: await Promise.all(photos.map(async (p) => ({ url: await openUrl(p.foto_url), fase: p.fase, didascalia: p.didascalia || "", data: p.data }))),
    documenti: await Promise.all(docs.filter((d) => d.visibile_cliente && d.file_url).map(async (d) => ({ titolo: d.titolo, tipo: d.tipo, data: d.data_emissione, url: await openUrl(d.file_url) }))),
    diario: logs.sort((a, b) => String(b.data).localeCompare(String(a.data))).map((l) => pick(l, ["data", "meteo", "attivita", "presenti"])),
    pagamenti: share.pagamenti ? {
      totale: Number(w.importo_totale) || 0,
      incassato: payments.reduce((s, p) => s + (Number(p.importo) || 0), 0),
      rate: (w.piano_pagamenti || []).map((r) => pick(r, ["descrizione", "importo", "scadenza"])),
    } : null,
  };
}
