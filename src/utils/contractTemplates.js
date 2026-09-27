import { fieldDefinitions, contractSchemas } from "@/utils/contracts";

// Varianti di documento disponibili
export const contractVariants = [
  { value: "min", label: "Minimale", description: "Essenziale e diretto" },
  { value: "med", label: "Medio", description: "Equilibrato e completo" },
  { value: "pro", label: "Professionale", description: "Esteso e dettagliato" },
];

// Tipi derivati dagli schemi
export const contractTypes = Object.entries(contractSchemas).map(([key, schema]) => ({
  value: key,
  label: schema.title,
}));

// Parser: divide il body in sezioni marcate con §N (1=min, 2=med, 3=pro)
// e restituisce solo le sezioni con livello <= maxLevel
function parseSections(body, maxLevel) {
  const tokens = body.split(/^§(\d+)\r?\n/m);
  const parts = [];
  for (let i = 1; i < tokens.length; i += 2) {
    const level = parseInt(tokens[i]);
    const text = tokens[i + 1];
    if (level <= maxLevel && text.trim()) {
      parts.push(text.trim());
    }
  }
  return parts;
}

// Assembla il body del contratto in base al tipo e alla variante scelta
export function buildBody(type, variant = "pro") {
  const schema = contractSchemas[type];
  if (!schema) return "";
  const maxLevel = { min: 1, med: 2, pro: 3 }[variant] || 3;
  const parts = parseSections(schema.body, maxLevel);
  return parts.join("\n\n");
}

// Template bodies per compatibilità con codice esistente (variante professionale)
export const templates = Object.fromEntries(
  Object.entries(contractSchemas).map(([key]) => [key, buildBody(key, "pro")])
);

// Restituisce i campi obbligatori e facoltativi per un tipo di contratto
export function getFieldsForType(type) {
  const schema = contractSchemas[type];
  if (!schema) return { required: [], optional: [] };
  return {
    required: schema.required.map(key => ({ key, ...fieldDefinitions[key] })),
    optional: schema.optional.map(key => ({ key, ...fieldDefinitions[key] })),
  };
}

// Per template personalizzati: estrae tutti i campi {{FIELD}} dal testo
export function extractFields(template) {
  const matches = template.match(/\{\{(\w+)/g) || [];
  return [...new Set(matches.map(m => m.replace(/\{\{(\w+)/, "$1")))];
}

// Re-esporta le fieldDefinitions per compatibilità
export { fieldDefinitions };