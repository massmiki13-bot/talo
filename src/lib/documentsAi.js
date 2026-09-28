// IA per l'archivio: analisi di un singolo file e riorganizzazione dell'intero archivio.
import { api } from "@/api/client";
import { DOC_TYPES, STANDARD_TREE, pathLabel } from "@/lib/documents";
import { CORSI } from "@/lib/employees";
import { COST_CATEGORIES } from "@/lib/worksites";

const TYPES = DOC_TYPES.map((t) => t.value);
const standardPaths = () => STANDARD_TREE.flatMap((r) => [r.nome, ...r.figli.map((f) => `${r.nome}/${f}`)]);

const existingPaths = (folders) => folders.map((f) => pathLabel(f.id, folders).replace(/ \/ /g, "/"));

const cleanDate = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) ? s : "");

/**
 * Legge un file appena caricato e restituisce metadati + cartella consigliata.
 * ctx: { folders, employees, contacts, worksites }
 */
export async function analyzeDocument(fileUrl, fileName, ctx) {
  const paths = existingPaths(ctx.folders);
  const res = await api.integrations.Core.InvokeLLM({
    prompt: `Sei l'archivista di un'impresa edile/impiantistica italiana. Leggi il documento allegato (nome file: "${fileName}") e compila la scheda.

Tipi ammessi: ${TYPES.join(", ")}.
Cartelle già presenti nell'archivio: ${paths.length ? paths.join(" | ") : "(nessuna)"}.
Struttura consigliata se manca una cartella adatta: ${standardPaths().join(" | ")}.
Per documenti di un cantiere usa "Cantieri/<nome cantiere>"; per documenti di un dipendente preferisci "Personale/<sottocartella>".
Dipendenti: ${JSON.stringify((ctx.employees || []).slice(0, 80).map((e) => ({ id: e.id, nome: `${e.nome || ""} ${e.cognome || ""}`.trim() })))}
Clienti/fornitori: ${JSON.stringify((ctx.contacts || []).slice(0, 120).map((c) => ({ id: c.id, nome: c.nome || c.nome_privato || c.ragione_sociale })))}
Cantieri: ${JSON.stringify((ctx.worksites || []).slice(0, 80).map((w) => ({ id: w.id, nome: w.nome || w.titolo })))}

REGOLE:
- titolo breve e chiaro (es. "DURC INPS – validità 120 gg", "Polizza RCT Allianz 2026").
- date solo se leggibili, formato YYYY-MM-DD; data_scadenza = fine validità/scadenza/revisione.
- cartella: percorso con "/" (max 3 livelli), preferendo una cartella esistente.
- collega dipendente/contatto/cantiere solo se il nome compare chiaramente; usa l'id dell'elenco.
- riassunto: 1-2 frasi con i dati utili (numero, importo, ente, soggetto).
- documento_dipendente: se il documento riguarda UN dipendente elencato, indica se è "corso" (attestato di formazione), "visita_medica" (idoneità), "contratto" (di lavoro), "documento_identita", altrimenti "nessuno". Per i corsi scegli corso_codice tra: ${CORSI.map((c) => `${c.codice} (${c.nome})`).join("; ")}.
- fattura: "ricevuta" se è una fattura/ricevuta di un fornitore verso di noi, "emessa" se l'abbiamo emessa noi, altrimenti "no". Per le ricevute indica imponibile (senza IVA) e categoria_costo tra: ${COST_CATEGORIES.join(", ")}.
- Non inventare nulla.`,
    file_urls: [fileUrl],
    response_json_schema: {
      type: "object",
      properties: {
        titolo: { type: "string" },
        tipo: { type: "string", enum: TYPES },
        cartella: { type: "string" },
        riassunto: { type: "string" },
        numero: { type: "string" },
        emittente: { type: "string" },
        importo: { type: "number" },
        data_emissione: { type: "string" },
        data_scadenza: { type: "string" },
        dipendente_id: { type: "string" },
        contatto_id: { type: "string" },
        worksite_id: { type: "string" },
        tag: { type: "array", items: { type: "string" } },
        documento_dipendente: { type: "string", enum: ["corso", "visita_medica", "contratto", "documento_identita", "nessuno"] },
        corso_codice: { type: "string" },
        fattura: { type: "string", enum: ["ricevuta", "emessa", "no"] },
        imponibile: { type: "number" },
        categoria_costo: { type: "string" },
        testo: { type: "string", description: "testo principale del documento, max 3000 caratteri" },
      },
      required: ["titolo", "tipo", "cartella"],
    },
  });
  const r = res || {};
  const emp = (ctx.employees || []).find((e) => e.id === r.dipendente_id);
  const con = (ctx.contacts || []).find((c) => c.id === r.contatto_id);
  const ws = (ctx.worksites || []).find((w) => w.id === r.worksite_id);
  return {
    titolo: String(r.titolo || fileName).slice(0, 160),
    tipo: TYPES.includes(r.tipo) ? r.tipo : "altro",
    cartella: String(r.cartella || "").slice(0, 200),
    riassunto: r.riassunto || "",
    numero: r.numero || "",
    emittente: r.emittente || "",
    importo: typeof r.importo === "number" && r.importo > 0 ? r.importo : null,
    data_emissione: cleanDate(r.data_emissione),
    data_scadenza: cleanDate(r.data_scadenza),
    dipendente_id: emp?.id || "", dipendente_nome: emp ? `${emp.nome || ""} ${emp.cognome || ""}`.trim() : "",
    contatto_id: con?.id || "", contatto_nome: con ? con.nome || con.nome_privato || "" : "",
    worksite_id: ws?.id || "", worksite_nome: ws ? ws.nome || ws.titolo || "" : "",
    tag: Array.isArray(r.tag) ? r.tag.slice(0, 6) : [],
    contenuto_estratto: String(r.testo || "").slice(0, 10000),
    // indicazioni per lo smistamento (non vengono salvate sul documento)
    _smista: {
      dipendente: emp && ["corso", "visita_medica", "contratto", "documento_identita"].includes(r.documento_dipendente) ? r.documento_dipendente : null,
      corso_codice: CORSI.some((c) => c.codice === r.corso_codice) ? r.corso_codice : "",
      costo: r.fattura === "ricevuta" && ws ? { importo: Number(r.imponibile) > 0 ? Number(r.imponibile) : Number(r.importo) || 0, categoria: COST_CATEGORIES.includes(r.categoria_costo) ? r.categoria_costo : "Materiali" } : null,
    },
  };
}

/**
 * Propone una struttura ordinata (fino a 3 livelli) per tutti i documenti.
 * Restituisce { cartelle: ["A", "A/B", ...], assegnazioni: [{ id, cartella, motivo }] }
 */
export async function proposeOrganization(docs, folders, { mode = "merge" } = {}) {
  const items = docs.map((d) => ({
    id: d.id,
    titolo: d.titolo,
    tipo: d.tipo,
    file: d.nome_file || "",
    attuale: d.cartella_id ? pathLabel(d.cartella_id, folders).replace(/ \/ /g, "/") : "",
    dipendente: d.dipendente_nome || "",
    contatto: d.contatto_nome || "",
    cantiere: d.worksite_nome || "",
    scadenza: d.data_scadenza || "",
    info: String(d.riassunto || d.descrizione || d.contenuto_estratto || "").slice(0, 280),
  }));
  const out = { cartelle: new Set(), assegnazioni: [] };
  // A blocchi, per restare nei limiti del modello.
  for (let i = 0; i < items.length; i += 60) {
    const chunk = items.slice(i, i + 60);
    const res = await api.integrations.Core.InvokeLLM({
      prompt: `Sei l'archivista di un'impresa edile/impiantistica italiana. Organizza questi documenti in un archivio a cartelle e sottocartelle (massimo 3 livelli), pratico per ritrovare tutto al volo.

Struttura di riferimento: ${standardPaths().join(" | ")}.
${mode === "merge" ? `Cartelle già esistenti da riusare quando adatte: ${existingPaths(folders).join(" | ") || "(nessuna)"}.` : "Ignora le cartelle attuali e progetta l'archivio da zero."}
${out.cartelle.size ? `Cartelle già decise nei blocchi precedenti (riusale): ${[...out.cartelle].join(" | ")}.` : ""}

REGOLE:
- Crea solo le cartelle che servono davvero; nomi brevi, in italiano, iniziale maiuscola.
- Cantieri: "Cantieri/<nome cantiere>" e, se ci sono molti documenti, sottocartelle (es. "Cantieri/Villa Rossi/Sicurezza").
- Personale: documenti di dipendenti in "Personale/<Buste paga|Formazione|Visite mediche|Contratti di lavoro>".
- Anni: per fatture/F24/buste paga numerose puoi aggiungere l'anno come ultimo livello (es. "Amministrazione/Fatture fornitori/2026").
- Ogni documento riceve UN percorso completo con "/"; motivo di max 8 parole.

Documenti: ${JSON.stringify(chunk)}`,
      response_json_schema: {
        type: "object",
        properties: {
          assegnazioni: {
            type: "array",
            items: { type: "object", properties: { id: { type: "string" }, cartella: { type: "string" }, motivo: { type: "string" } }, required: ["id", "cartella"] },
          },
        },
        required: ["assegnazioni"],
      },
    });
    for (const a of res?.assegnazioni || []) {
      if (!chunk.some((c) => c.id === a.id)) continue;
      const path = String(a.cartella || "").split("/").map((s) => s.trim()).filter(Boolean).slice(0, 3).join("/");
      if (!path) continue;
      out.assegnazioni.push({ id: a.id, cartella: path, motivo: a.motivo || "" });
      const parts = path.split("/");
      for (let k = 1; k <= parts.length; k++) out.cartelle.add(parts.slice(0, k).join("/"));
    }
  }
  return { cartelle: [...out.cartelle].sort((a, b) => a.localeCompare(b, "it")), assegnazioni: out.assegnazioni };
}
