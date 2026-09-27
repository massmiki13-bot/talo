export const SETTORI = {
  edilizia: { label: "Edilizia / Impianti", termine_sezioni: "Cantiere", icon: "🏗️", contratti: ["appalto", "subappalto"] },
};

export const SETTORE_KEYS = Object.keys(SETTORI);

// Restituisce l'elenco dei tipi di contratto consigliati per il settore (in testa), seguiti dagli altri disponibili
export function getContractSuggestions(settoreKey, allTypes) {
  const settore = SETTORI[settoreKey] || SETTORI.edilizia;
  const suggested = settore.contratti || [];
  const suggestedSet = new Set(suggested);
  const sugg = allTypes.filter(t => suggestedSet.has(t.value));
  const others = allTypes.filter(t => !suggestedSet.has(t.value));
  return { suggested: sugg, others };
}