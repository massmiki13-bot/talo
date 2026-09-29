// DDT e materiali di cantiere: l'IA legge la bolla, la assegna al lavoro e ne registra le righe.
import { api } from "@/lib/db";

const str = { type: "string" };
const num = { type: "number" };

export async function readDdt(fileUrl, worksites = []) {
  const r = await api.integrations.Core.InvokeLLM({
    prompt: `Leggi questo documento di trasporto (DDT/bolla) o fattura di materiali edili.
Estrai: fornitore, numero del documento, data (AAAA-MM-GG), luogo di destinazione della merce, e TUTTE le righe con descrizione, quantità, unità di misura (pz, kg, mq, mc, ml, sacchi, bancali, lt, t…) e, se presenti, prezzo unitario e importo di riga (euro, IVA esclusa); totale_imponibile se indicato.
Poi confronta destinazione, riferimenti e note con questi cantieri: ${JSON.stringify(worksites.map((w) => ({ id: w.id, nome: w.nome, indirizzo: w.indirizzo, cliente: w.cliente_nome })))}.
Indica worksite_id solo se la corrispondenza è chiara, altrimenti lascialo vuoto. Non inventare quantità o prezzi.`,
    file_urls: [fileUrl],
    response_json_schema: {
      type: "object",
      properties: {
        fornitore: str, numero: str, data: str, destinazione: str, worksite_id: str, totale_imponibile: num,
        righe: { type: "array", items: { type: "object", properties: { descrizione: str, quantita: num, unita: str, prezzo_unitario: num, importo: num } } },
      },
    },
  });
  const righe = (r.righe || []).filter((x) => x.descrizione).map((x) => ({
    descrizione: x.descrizione.trim(), quantita: Number(x.quantita) || 0, unita: (x.unita || "").trim(),
    prezzo_unitario: Number(x.prezzo_unitario) || 0, importo: Number(x.importo) || (Number(x.quantita) || 0) * (Number(x.prezzo_unitario) || 0),
  }));
  const tot = Number(r.totale_imponibile) || righe.reduce((s, x) => s + x.importo, 0);
  return {
    fornitore: r.fornitore || "", numero: r.numero || "", data: /^\d{4}-\d{2}-\d{2}$/.test(r.data || "") ? r.data : new Date().toISOString().slice(0, 10),
    destinazione: r.destinazione || "", worksite_id: worksites.some((w) => w.id === r.worksite_id) ? r.worksite_id : "",
    righe, importo: Math.round(tot * 100) / 100,
  };
}

/** Movimento di spesa con la bolla allegata e le righe dei materiali. */
export const ddtTransaction = (d, worksite, fileUrl) => ({
  tipo: "uscita", categoria: "Materiali", descrizione: `DDT${d.numero ? ` n. ${d.numero}` : ""}${d.fornitore ? ` – ${d.fornitore}` : ""}`,
  importo: d.importo || 0, data: d.data, fornitore: d.fornitore, file_url: fileUrl, worksite_id: worksite.id, worksite_nome: worksite.nome,
  ddt: { numero: d.numero, destinazione: d.destinazione, righe: d.righe },
});

const key = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Materiali arrivati in cantiere: somma delle righe dei DDT per descrizione e unità. */
export function materialsOf(transactions = []) {
  const map = new Map();
  for (const t of transactions) {
    for (const r of t.ddt?.righe || []) {
      const k = `${key(r.descrizione)}|${key(r.unita)}`;
      const m = map.get(k) || { descrizione: r.descrizione, unita: r.unita, quantita: 0, importo: 0, ddt: 0, fornitori: new Set(), ultima: "" };
      m.quantita += Number(r.quantita) || 0;
      m.importo += Number(r.importo) || 0;
      m.ddt += 1;
      if (t.fornitore) m.fornitori.add(t.fornitore);
      if (t.data > m.ultima) m.ultima = t.data;
      map.set(k, m);
    }
  }
  return [...map.values()].map((m) => ({ ...m, fornitori: [...m.fornitori] })).sort((a, b) => b.importo - a.importo || a.descrizione.localeCompare(b.descrizione));
}
