import { api } from "@/api/client";

/**
 * Extracts text content from a document file (PDF, image, etc.) using AI.
 * Returns extracted text truncated to 10000 chars to avoid oversized entity fields.
 */
export async function extractDocumentText(fileUrl) {
  const result = await api.integrations.Core.InvokeLLM({
    prompt:
      "Estrai tutto il testo presente in questo documento, mantenendo l'ordine originale di lettura. " +
      "Restituisci ESCLUSIVAMENTE il testo estratto, senza commenti, spiegazioni o intestazioni. " +
      "Se il documento è un'immagine o una scansione, usa l'OCR per estrarre il testo. " +
      "Se il documento non contiene testo (es. solo immagini senza testo), restituisci una stringa vuota.",
    file_urls: [fileUrl],
  });
  const text = typeof result === "string" ? result : result?.text || "";
  return text.substring(0, 10000);
}

/**
 * Searches for a query string inside a text and returns a snippet around the match.
 * Returns null if no match is found.
 */
export function searchInText(text, query) {
  if (!text || !query) return null;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return null;
  const start = Math.max(0, idx - 80);
  const end = Math.min(text.length, idx + query.length + 80);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return { snippet: prefix + text.substring(start, end) + suffix, position: idx };
}

/**
 * Searches documents by title, description, and extracted content.
 * Returns an array of { doc, matchType, snippet }.
 */
export function searchDocuments(documents, query) {
  if (!query || query.trim().length < 2) return [];
  const q = query.trim();
  const results = [];
  for (const doc of documents) {
    const titleMatch = doc.titolo?.toLowerCase().includes(q.toLowerCase());
    const descMatch = doc.descrizione?.toLowerCase().includes(q.toLowerCase());
    const contentResult = searchInText(doc.contenuto_estratto, q);

    if (contentResult) {
      results.push({ doc, matchType: "contenuto", snippet: contentResult.snippet });
    } else if (descMatch) {
      const idx = doc.descrizione.toLowerCase().indexOf(q.toLowerCase());
      const start = Math.max(0, idx - 60);
      const end = Math.min(doc.descrizione.length, idx + q.length + 60);
      const snippet = (start > 0 ? "…" : "") + doc.descrizione.substring(start, end) + (end < doc.descrizione.length ? "…" : "");
      results.push({ doc, matchType: "descrizione", snippet });
    } else if (titleMatch) {
      results.push({ doc, matchType: "titolo", snippet: doc.titolo });
    }
  }
  return results;
}