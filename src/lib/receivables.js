// Scadenzario incassi: rate dei lavori e fatture non ancora incassate, con i testi dei solleciti.
import { installments, incomeOf } from "@/lib/worksites";
import { computeInvoice } from "@/lib/invoices";

const n = (v) => Number(v) || 0;
const dayMs = 86_400_000;
const daysFrom = (iso, today) => Math.round((+new Date(iso) - +new Date(today)) / dayMs);

/**
 * Tutte le somme da incassare. Le fatture già emesse per una rata di lavoro sostituiscono la rata
 * (niente doppioni): la rata resta solo se non è ancora stata fatturata.
 */
export function buildReceivables({ worksites = [], payments = [], transactions = [], invoices = [], contacts = [] }, today = new Date().toISOString().slice(0, 10)) {
  const contactOf = (id) => contacts.find((c) => c.id === id);
  const out = [];
  for (const inv of invoices) {
    if (inv.stato === "pagata" || inv.stato === "bozza" || inv.tipo_documento === "TD04") continue;
    const importo = n(inv.totale) || computeInvoice(inv).daPagare;
    if (importo <= 0) continue;
    const scadenza = inv.scadenza || inv.data;
    out.push({
      key: `inv-${inv.id}`, kind: "fattura", id: inv.id, titolo: `Fattura ${inv.numero}`, descrizione: inv.oggetto || "", cliente_id: inv.cliente_id, cliente_nome: inv.cliente_nome,
      worksite_id: inv.worksite_id || "", worksite_nome: inv.worksite_nome || "", importo, scadenza, giorni: daysFrom(scadenza, today), solleciti: inv.solleciti || [],
      email: contactOf(inv.cliente_id)?.pec && !contactOf(inv.cliente_id)?.email ? contactOf(inv.cliente_id).pec : contactOf(inv.cliente_id)?.email || "", rif: inv,
    });
  }
  const invoiced = new Set(invoices.filter((i) => i.worksite_id && i.rata_rif != null).map((i) => `${i.worksite_id}|${i.rata_rif}`));
  for (const w of worksites) {
    if (!w.piano_pagamenti?.length) continue;
    const income = incomeOf(payments.filter((p) => p.worksite_id === w.id), transactions.filter((t) => t.worksite_id === w.id));
    installments(w.piano_pagamenti, income).forEach((r) => {
      if (r.stato === "pagata" || r.residuo <= 0.005) return;
      const idx = w.piano_pagamenti.findIndex((x) => x.descrizione === r.descrizione && x.scadenza === r.scadenza);
      if (invoiced.has(`${w.id}|${idx}`) || invoiced.has(`${w.id}|${r.descrizione}`)) return;
      const scadenza = r.scadenza || w.data_fine_prevista || today;
      out.push({
        key: `rata-${w.id}-${idx}`, kind: "rata", id: w.id, rata_index: idx, titolo: r.descrizione || "Rata", descrizione: w.nome, cliente_id: w.cliente_id, cliente_nome: w.cliente_nome,
        worksite_id: w.id, worksite_nome: w.nome, importo: r.residuo, scadenza, giorni: daysFrom(scadenza, today), solleciti: w.piano_pagamenti[idx]?.solleciti || [],
        email: contactOf(w.cliente_id)?.email || contactOf(w.cliente_id)?.pec || "", parziale: r.stato === "parziale",
      });
    });
  }
  return out.sort((a, b) => a.scadenza.localeCompare(b.scadenza));
}

export const bucketOf = (r) => (r.giorni < -60 ? "oltre60" : r.giorni < 0 ? "scaduto" : r.giorni <= 30 ? "30" : "dopo");
export const BUCKETS = [
  { key: "oltre60", label: "Scaduto da oltre 60 giorni", cls: "text-red-800" },
  { key: "scaduto", label: "Scaduto", cls: "text-red-700" },
  { key: "30", label: "Entro 30 giorni", cls: "text-amber-800" },
  { key: "dopo", label: "Più avanti", cls: "text-zinc-600" },
];

export const TONI = [
  { key: "gentile", label: "Promemoria gentile" },
  { key: "deciso", label: "Sollecito" },
  { key: "ultimo", label: "Ultimo avviso" },
];

const eur = (v) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(n(v));
const it = (d) => new Date(d).toLocaleDateString("it-IT");

/** Testo del sollecito (modificabile e riscrivibile con l'IA nella finestra dell'email). */
export function reminderText(r, tono, profile) {
  const cosa = r.kind === "fattura" ? `la fattura n. ${r.rif?.numero} del ${it(r.rif?.data)}${r.descrizione ? ` (${r.descrizione})` : ""}` : `la rata "${r.titolo}" relativa ai lavori "${r.worksite_nome}"`;
  const iban = profile?.iban ? `\n\nIBAN per il bonifico: ${profile.iban}${profile.ragione_sociale ? ` intestato a ${profile.ragione_sociale}` : ""}.` : "";
  const scad = r.giorni < 0 ? `scaduta il ${it(r.scadenza)}` : `in scadenza il ${it(r.scadenza)}`;
  if (tono === "gentile") {
    return {
      subject: `Promemoria di pagamento – ${r.kind === "fattura" ? `fattura ${r.rif?.numero}` : r.worksite_nome}`,
      body: `Gentile ${r.cliente_nome || "cliente"},\n\nLe ricordiamo che risulta ancora da saldare ${cosa}, per un importo di ${eur(r.importo)}, ${scad}.\n\nSe ha già provveduto al pagamento, può ignorare questo messaggio: le chiediamo solo di inviarci la contabile così da aggiornare i nostri registri.${iban}\n\nRestiamo a disposizione per qualsiasi chiarimento.\n\nCordiali saluti`,
    };
  }
  if (tono === "deciso") {
    return {
      subject: `Sollecito di pagamento – ${r.kind === "fattura" ? `fattura ${r.rif?.numero}` : r.worksite_nome}`,
      body: `Gentile ${r.cliente_nome || "cliente"},\n\nnonostante il precedente promemoria, non ci risulta ancora il pagamento di ${cosa}, per un importo di ${eur(r.importo)}, ${scad}${r.giorni < 0 ? ` (${Math.abs(r.giorni)} giorni fa)` : ""}.\n\nLe chiediamo di provvedere al saldo entro 7 giorni dal ricevimento di questa comunicazione.${iban}\n\nNel caso in cui il pagamento sia già stato effettuato, la preghiamo di inviarci la ricevuta.\n\nCordiali saluti`,
    };
  }
  return {
    subject: `Ultimo avviso prima del recupero crediti – ${r.kind === "fattura" ? `fattura ${r.rif?.numero}` : r.worksite_nome}`,
    body: `Gentile ${r.cliente_nome || "cliente"},\n\nnonostante i precedenti solleciti, risulta ancora insoluto il pagamento di ${cosa}, per un importo di ${eur(r.importo)}, ${scad}.\n\nCon la presente la invitiamo formalmente a saldare quanto dovuto entro 10 giorni dal ricevimento. In mancanza, saremo costretti ad avviare le procedure per il recupero del credito, con addebito degli interessi di mora previsti dal D.Lgs. 231/2002 e delle relative spese.${iban}\n\nConfidiamo in una sollecita definizione.\n\nDistinti saluti`,
  };
}
