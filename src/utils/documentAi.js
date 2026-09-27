import { api } from "@/api/client";

/**
 * Reads a document via IA and extracts all relevant fields:
 * - tipo (document type)
 * - tipo_altro (custom label when tipo="altro")
 * - data_emissione (issue/start date)
 * - data_scadenza (expiration date)
 * - entita_tipo + entita_nome (who/what it's associated with)
 * - descrizione (brief description)
 *
 * @param {string} fileUrl - URL of the uploaded document
 * @param {object} context - optional { dipendenti, clienti, lavori } for entity matching
 * @returns {Promise<object>} - extracted fields
 */
export async function readDocumentWithAi(fileUrl, context = {}) {
  const result = await api.integrations.Core.InvokeLLM({
    prompt: `Sei un assistente che aiuta a organizzare i documenti aziendali. Analizza questo documento caricato e determina:

1. Tipo di documento (uno tra: contratto, visita_medica, documento_identita, corso, certificazione, assicurazione, durc, bolla, altro)
2. Se il tipo è "altro", scrivi una breve etichetta personalizzata nel campo tipo_altro (es. "Fattura", "Busta Paga", "Patente")
3. Data di emissione/inizio se presente (formato YYYY-MM-DD, altrimenti vuoto)
4. Data di scadenza se presente (formato YYYY-MM-DD, altrimenti vuoto)
5. A chi o a cosa è associato: "dipendente", "cliente", "lavoro", o "ditta"
6. Nome della persona o entità associata (se rilevabile dal documento)
7. Una breve descrizione del documento

${context.dipendenti ? `Dipendenti noti: ${JSON.stringify(context.dipendenti)}` : ""}
${context.clienti ? `Clienti noti: ${JSON.stringify(context.clienti)}` : ""}
${context.lavori ? `Lavori noti: ${JSON.stringify(context.lavori)}` : ""}

REGOLE:
- Non indovinare mai: se un'informazione non è chiaramente leggibile, lascia il campo vuoto.
- Se NON sei sicuro a chi associare il documento, imposta entita_tipo="ditta", needs_clarification=true e scrivi una domanda specifica nel campo "domanda".
- Se il tipo non rientra tra quelli previsti, usa "altro" e compila tipo_altro con una breve etichetta descrittiva.
- Le date devono essere sempre in formato YYYY-MM-DD.`,
    file_urls: [fileUrl],
    response_json_schema: {
      type: "object",
      properties: {
        tipo: { type: "string", description: "contratto, visita_medica, documento_identita, corso, certificazione, assicurazione, durc, bolla, o altro" },
        tipo_altro: { type: "string", description: "etichetta personalizzata quando tipo=altro, altrimenti vuoto" },
        data_emissione: { type: "string", description: "formato YYYY-MM-DD o vuoto" },
        data_scadenza: { type: "string", description: "formato YYYY-MM-DD o vuoto" },
        entita_tipo: { type: "string", description: "dipendente, cliente, lavoro, o ditta" },
        entita_nome: { type: "string" },
        needs_clarification: { type: "boolean" },
        domanda: { type: "string" },
        descrizione: { type: "string" },
      },
    },
  });
  return result;
}