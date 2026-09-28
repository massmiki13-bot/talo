// Fatture: numerazione, calcoli IVA (anche nature di esenzione tipiche dell'edilizia),
// controlli e generazione del file XML FatturaPA (versione 1.2.2, tracciato FPR12/FPA12).
import { api } from "@/lib/db";

const n = (v) => Number(v) || 0;
export const r2 = (v) => Math.round((n(v) + Number.EPSILON) * 100) / 100;

export const TIPI_DOC = [
  { value: "TD01", label: "Fattura" },
  { value: "TD02", label: "Acconto / anticipo su fattura" },
  { value: "TD04", label: "Nota di credito" },
];

export const REGIMI = [
  { value: "RF01", label: "Ordinario" },
  { value: "RF19", label: "Forfettario (L. 190/2014)" },
];

// Aliquote e nature usate da imprese edili e impiantisti.
export const ALIQUOTE = [
  { key: "22", aliquota: 22, label: "22% – ordinaria" },
  { key: "10", aliquota: 10, label: "10% – manutenzione/ristrutturazione su abitazioni" },
  { key: "4", aliquota: 4, label: "4% – costruzione prima casa" },
  { key: "5", aliquota: 5, label: "5%" },
  { key: "N6.3", aliquota: 0, natura: "N6.3", label: "Reverse charge – subappalto nel settore edile", rif: "Art. 17, c. 6, lett. a), DPR 633/72" },
  { key: "N6.7", aliquota: 0, natura: "N6.7", label: "Reverse charge – prestazioni comparto edile", rif: "Art. 17, c. 6, lett. a-ter), DPR 633/72" },
  { key: "N2.2", aliquota: 0, natura: "N2.2", label: "Non soggetta – regime forfettario", rif: "Art. 1, commi 54-89, L. 190/2014" },
  { key: "N4", aliquota: 0, natura: "N4", label: "Esente", rif: "Art. 10 DPR 633/72" },
  { key: "N1", aliquota: 0, natura: "N1", label: "Escluso art. 15 (anticipazioni)", rif: "Art. 15 DPR 633/72" },
];
export const aliquotaOf = (key) => ALIQUOTE.find((a) => a.key === String(key)) || ALIQUOTE[0];

export const PAGAMENTI = [
  { value: "MP05", label: "Bonifico" },
  { value: "MP01", label: "Contanti" },
  { value: "MP02", label: "Assegno" },
  { value: "MP08", label: "Carta di pagamento" },
  { value: "MP12", label: "RIBA" },
];

export const STATI = {
  bozza: { label: "Bozza", className: "bg-slate-100 text-slate-700" },
  emessa: { label: "Emessa", className: "bg-zinc-200 text-zinc-800" },
  inviata: { label: "Inviata allo SdI", className: "bg-indigo-100 text-indigo-800" },
  pagata: { label: "Pagata", className: "bg-emerald-100 text-emerald-800" },
};

export const lineTotal = (r) => r2(n(r.quantita) * n(r.prezzo_unitario) * (1 - n(r.sconto) / 100));

/** Totali e riepilogo per aliquota/natura. */
export function computeInvoice(inv) {
  const righe = (inv.righe || []).filter((r) => r.descrizione || n(r.prezzo_unitario));
  const groups = {};
  for (const r of righe) {
    const a = aliquotaOf(r.aliquota_key ?? r.iva_percentuale ?? 22);
    const g = (groups[a.key] ||= { ...a, imponibile: 0 });
    g.imponibile = r2(g.imponibile + lineTotal(r));
  }
  const riepilogo = Object.values(groups).map((g) => ({ ...g, imposta: r2((g.imponibile * g.aliquota) / 100) }));
  const imponibile = r2(riepilogo.reduce((s, g) => s + g.imponibile, 0));
  const iva = r2(riepilogo.reduce((s, g) => s + g.imposta, 0));
  // Bollo da 2 € sulle operazioni senza IVA oltre 77,47 €
  // (il reverse charge N6.x resta un'operazione soggetta a IVA: niente bollo)
  const senzaIva = riepilogo.filter((g) => g.natura && !g.natura.startsWith("N6")).reduce((s, g) => s + g.imponibile, 0);
  const bollo = inv.bollo === "no" ? 0 : inv.bollo === "si" || senzaIva > 77.47 ? 2 : 0;
  const splitPayment = !!inv.split_payment;
  const totale = r2(imponibile + iva + (inv.bollo_addebitato === false ? 0 : bollo));
  const daPagare = r2(totale - (splitPayment ? iva : 0) - n(inv.ritenuta_importo));
  return { righe, riepilogo, imponibile, iva, bollo, totale, daPagare, splitPayment };
}

/** Numero successivo nell'anno: "1/2026", "2/2026"… (rispetta un eventuale prefisso). */
export function nextNumber(invoices, anno, tipo = "TD01") {
  const same = invoices.filter((i) => Number(i.anno) === Number(anno) && (tipo === "TD04" ? i.tipo_documento === "TD04" : i.tipo_documento !== "TD04"));
  const max = same.reduce((m, i) => Math.max(m, parseInt(String(i.numero).match(/\d+/)?.[0] || "0", 10)), 0);
  return `${tipo === "TD04" ? "NC" : ""}${max + 1}/${anno}`;
}

// ─── Controlli prima dell'esportazione ───

export function validateInvoice(inv, profile, client) {
  const e = [];
  const c = computeInvoice(inv);
  if (!profile?.partita_iva) e.push("Partita IVA dell'impresa mancante (Profilo ditta)");
  if (!profile?.indirizzo || !profile?.cap || !profile?.citta) e.push("Sede dell'impresa incompleta (Profilo ditta)");
  if (!inv.numero) e.push("Numero della fattura mancante");
  if (!inv.data) e.push("Data della fattura mancante");
  if (!client) e.push("Cliente non selezionato");
  else {
    if (!client.partita_iva && !client.codice_fiscale) e.push("Il cliente non ha né partita IVA né codice fiscale");
    if (!client.indirizzo || !client.cap || !client.citta) e.push("Indirizzo del cliente incompleto (via, CAP, comune)");
    if (client.partita_iva && !client.codice_sdi && !client.pec) e.push("Per un cliente con P.IVA serve il codice destinatario SDI o la PEC");
  }
  if (!c.righe.length) e.push("Nessuna riga in fattura");
  if (c.righe.some((r) => !String(r.descrizione || "").trim())) e.push("C'è una riga senza descrizione");
  if (inv.regime === "RF19" && c.riepilogo.some((g) => g.aliquota > 0)) e.push("In regime forfettario le righe non hanno IVA: usa \"Non soggetta – regime forfettario\"");
  if (c.riepilogo.some((g) => g.natura?.startsWith("N6")) && !client?.partita_iva) e.push("Il reverse charge si applica solo verso clienti con partita IVA");
  if (inv.modalita_pagamento === "MP05" && !(inv.iban || profile?.iban)) e.push("IBAN per il bonifico mancante");
  return e;
}

// ─── XML FatturaPA ───

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
// Latin-1 di base: lo SdI rifiuta alcuni caratteri (es. emoji, virgolette tipografiche)
const txt = (s, max) => esc(String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "").trim().slice(0, max));
const amt = (v) => r2(v).toFixed(2);
const tag = (name, value) => (value === undefined || value === null || value === "" ? "" : `<${name}>${value}</${name}>`);
const onlyDigits = (s) => String(s || "").replace(/\D/g, "");
const provincia = (p) => String(p || "").toUpperCase().slice(0, 2);

function randomProg() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => chars[b % chars.length]).join("");
}

function anagrafica(soggetto) {
  if (soggetto.denominazione) return `<Anagrafica>${tag("Denominazione", txt(soggetto.denominazione, 80))}</Anagrafica>`;
  return `<Anagrafica>${tag("Nome", txt(soggetto.nome, 60))}${tag("Cognome", txt(soggetto.cognome, 60))}</Anagrafica>`;
}
function sede(a) {
  return `<Sede>${tag("Indirizzo", txt(a.indirizzo, 60))}${tag("CAP", onlyDigits(a.cap).padStart(5, "0").slice(0, 5))}${tag("Comune", txt(a.citta, 60))}${tag("Provincia", provincia(a.provincia))}<Nazione>IT</Nazione></Sede>`;
}

// Per i privati il nome del contatto è "Nome Cognome": lo dividiamo sull'ultima parola.
function splitName(full) {
  const parts = String(full || "").trim().split(/\s+/);
  if (parts.length < 2) return { nome: parts[0] || "", cognome: parts[0] || "" };
  return { nome: parts.slice(0, -1).join(" "), cognome: parts.at(-1) };
}

export function buildFatturaXml(inv, profile, client) {
  const c = computeInvoice(inv);
  const pa = String(client?.codice_sdi || "").length === 6;
  const formato = pa ? "FPA12" : "FPR12";
  const piva = onlyDigits(profile.partita_iva);
  const prog = inv.progressivo_invio || randomProg();
  const codDest = pa ? client.codice_sdi.toUpperCase() : (client?.codice_sdi || "0000000").toUpperCase();
  const privato = !client?.partita_iva;
  const clientAna = privato && client?.tipo_soggetto !== "azienda" && client?.tipo_soggetto !== "ente"
    ? splitName(client?.nome_privato || client?.nome) : { denominazione: client?.nome || client?.nome_privato };
  const regime = inv.regime || profile.regime_fiscale || "RF01";
  const tipo = inv.tipo_documento || "TD01";

  const linee = c.righe.map((r, i) => {
    const a = aliquotaOf(r.aliquota_key ?? r.iva_percentuale ?? 22);
    const sc = n(r.sconto);
    return `<DettaglioLinee><NumeroLinea>${i + 1}</NumeroLinea>${tag("Descrizione", txt(r.descrizione, 1000))}${tag("Quantita", n(r.quantita).toFixed(2))}${tag("UnitaMisura", txt(r.unita_misura, 10))}`
      + `<PrezzoUnitario>${n(r.prezzo_unitario).toFixed(2)}</PrezzoUnitario>${sc ? `<ScontoMaggiorazione><Tipo>SC</Tipo><Percentuale>${sc.toFixed(2)}</Percentuale></ScontoMaggiorazione>` : ""}`
      + `<PrezzoTotale>${amt(lineTotal(r))}</PrezzoTotale><AliquotaIVA>${a.aliquota.toFixed(2)}</AliquotaIVA>${tag("Natura", a.natura)}</DettaglioLinee>`;
  }).join("");

  const riepilogo = c.riepilogo.map((g) => `<DatiRiepilogo><AliquotaIVA>${g.aliquota.toFixed(2)}</AliquotaIVA>${tag("Natura", g.natura)}<ImponibileImporto>${amt(g.imponibile)}</ImponibileImporto><Imposta>${amt(g.imposta)}</Imposta>${g.natura ? "" : `<EsigibilitaIVA>${c.splitPayment ? "S" : "I"}</EsigibilitaIVA>`}${tag("RiferimentoNormativo", txt(g.rif, 100))}</DatiRiepilogo>`).join("");

  const causale = String(inv.oggetto || "").trim();
  const causali = causale ? causale.match(/[\s\S]{1,200}/g).map((x) => tag("Causale", txt(x, 200))).join("") : "";
  const iban = String(inv.iban || profile.iban || "").replace(/\s+/g, "").toUpperCase();
  const pagamento = `<DatiPagamento><CondizioniPagamento>TP02</CondizioniPagamento><DettaglioPagamento><ModalitaPagamento>${inv.modalita_pagamento || "MP05"}</ModalitaPagamento>${tag("DataScadenzaPagamento", inv.scadenza)}<ImportoPagamento>${amt(c.daPagare)}</ImportoPagamento>${inv.modalita_pagamento === "MP05" || !inv.modalita_pagamento ? tag("IBAN", iban) : ""}</DettaglioPagamento></DatiPagamento>`;
  const rea = profile.numero_rea ? (() => { const m = String(profile.numero_rea).match(/^([A-Za-z]{2})\W*(.+)$/); return m ? `<IscrizioneREA><Ufficio>${m[1].toUpperCase()}</Ufficio><NumeroREA>${txt(m[2], 20)}</NumeroREA><StatoLiquidazione>LN</StatoLiquidazione></IscrizioneREA>` : ""; })() : "";
  const dg = `<DatiGeneraliDocumento><TipoDocumento>${tipo}</TipoDocumento><Divisa>EUR</Divisa><Data>${inv.data}</Data><Numero>${txt(inv.numero, 20)}</Numero>`
    + (c.bollo ? `<DatiBollo><BolloVirtuale>SI</BolloVirtuale><ImportoBollo>${amt(c.bollo)}</ImportoBollo></DatiBollo>` : "")
    + `<ImportoTotaleDocumento>${amt(c.totale)}</ImportoTotaleDocumento>${causali}</DatiGeneraliDocumento>`
    + (inv.fattura_collegata ? `<DatiFattureCollegate><IdDocumento>${txt(inv.fattura_collegata, 20)}</IdDocumento></DatiFattureCollegate>` : "");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="${formato}" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2 http://www.fatturapa.gov.it/export/fatturazione/sdi/fatturapa/v1.2/Schema_del_file_xml_FatturaPA_versione_1.2.xsd">
<FatturaElettronicaHeader>
<DatiTrasmissione><IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>${piva}</IdCodice></IdTrasmittente><ProgressivoInvio>${prog}</ProgressivoInvio><FormatoTrasmissione>${formato}</FormatoTrasmissione><CodiceDestinatario>${codDest}</CodiceDestinatario>${codDest === "0000000" && client?.pec ? tag("PECDestinatario", txt(client.pec, 256)) : ""}</DatiTrasmissione>
<CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${piva}</IdCodice></IdFiscaleIVA>${tag("CodiceFiscale", String(profile.codice_fiscale || "").toUpperCase())}${anagrafica({ denominazione: profile.ragione_sociale })}<RegimeFiscale>${regime}</RegimeFiscale></DatiAnagrafici>${sede(profile)}${rea}${profile.telefono || profile.email ? `<Contatti>${tag("Telefono", txt(profile.telefono, 12).replace(/\s/g, ""))}${tag("Email", txt(profile.email, 256))}</Contatti>` : ""}</CedentePrestatore>
<CessionarioCommittente><DatiAnagrafici>${client?.partita_iva ? `<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${onlyDigits(client.partita_iva)}</IdCodice></IdFiscaleIVA>` : ""}${tag("CodiceFiscale", String(client?.codice_fiscale || "").toUpperCase())}${anagrafica(clientAna)}</DatiAnagrafici>${sede(client || {})}</CessionarioCommittente>
</FatturaElettronicaHeader>
<FatturaElettronicaBody>
<DatiGenerali>${dg}</DatiGenerali>
<DatiBeniServizi>${linee}${riepilogo}</DatiBeniServizi>
${pagamento}
</FatturaElettronicaBody>
</p:FatturaElettronica>`;
  const fileName = `IT${piva}_${prog}.xml`;
  return { xml, fileName, progressivo: prog };
}

// ─── IA: aliquota corretta per l'edilizia ───

export async function aiSuggestVat({ righe, cliente, oggetto }) {
  const res = await api.integrations.Core.InvokeLLM({
    prompt: `Sei un consulente fiscale italiano esperto di edilizia. Per ogni riga di questa fattura indica l'aliquota IVA corretta tra:
${ALIQUOTE.map((a) => `${a.key} = ${a.label}`).join("; ")}.
Cliente: ${cliente?.nome || cliente?.nome_privato || "—"} (${cliente?.partita_iva ? "con partita IVA" : "privato"}${cliente?.categorie?.length ? `, ${cliente.categorie.join(", ")}` : ""}). Oggetto: ${oggetto || "—"}.
Regole: 10% per manutenzione ordinaria/straordinaria su immobili abitativi (beni significativi con le regole del DM 29/12/1999); 4% costruzione prima casa; reverse charge N6.3 se è un subappalto a un'altra impresa edile, N6.7 per pulizia/demolizione/installazione impianti/completamento edifici verso imprese; altrimenti 22%.
Se mancano informazioni scegli l'ipotesi più prudente e dillo nel motivo.
Righe: ${JSON.stringify((righe || []).map((r, i) => ({ n: i, descrizione: r.descrizione })))}`,
    response_json_schema: {
      type: "object",
      properties: { righe: { type: "array", items: { type: "object", properties: { n: { type: "number" }, key: { type: "string" }, motivo: { type: "string" } }, required: ["n", "key"] } }, nota: { type: "string" } },
      required: ["righe"],
    },
  });
  return res;
}
