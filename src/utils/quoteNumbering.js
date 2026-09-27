export function generateQuoteNumber(profile, existingQuotes) {
  const year = new Date().getFullYear();
  const yearQuotes = existingQuotes.filter(q => q.anno === year);
  const count = yearQuotes.length;
  const tipo = profile?.numerazione_tipo || "progressiva_anno";

  switch (tipo) {
    case "progressiva":
      return { numero: String(count + 1), anno: year };
    case "progressiva_anno":
      return { numero: `${year}-${String(count + 1).padStart(3, "0")}`, anno: year };
    case "prefisso": {
      const prefix = (profile?.numerazione_prefisso || "PREV").trim();
      return { numero: `${prefix}-${String(count + 1).padStart(3, "0")}`, anno: year };
    }
    case "codice": {
      const startNum = profile?.numerazione_partenza || 1;
      return { numero: String(startNum + count), anno: year };
    }
    default:
      return { numero: `${year}-${String(count + 1).padStart(3, "0")}`, anno: year };
  }
}

export const numerazioneOptions = [
  { value: "progressiva", label: "Progressiva semplice", description: "1, 2, 3… (riparte ogni anno)" },
  { value: "progressiva_anno", label: "Progressiva con anno", description: "2026-001, 2026-002…" },
  { value: "prefisso", label: "Con prefisso personalizzato", description: "PREV-001, OFF-001…" },
  { value: "codice", label: "Codice mascherato", description: "Partenza da numero a scelta (es. 500). Non trasparente." },
];