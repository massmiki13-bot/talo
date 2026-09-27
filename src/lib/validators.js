// Controlli sui dati anagrafici italiani (formato + cifra di controllo).

const clean = (s) => String(s || "").replace(/\s+/g, "").toUpperCase();

// Partita IVA italiana: 11 cifre con carattere di controllo (algoritmo di Luhn modificato).
export function isValidPartitaIva(value) {
  const v = clean(value).replace(/^IT/, "");
  if (!/^\d{11}$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let n = Number(v[i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return (10 - (sum % 10)) % 10 === Number(v[10]);
}

const CF_ODD = {
  0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
  N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};

// Codice fiscale: 16 caratteri per le persone (con omocodie), oppure 11 cifre
// per le società (stesso algoritmo della partita IVA).
export function isValidCodiceFiscale(value) {
  const v = clean(value);
  if (/^\d{11}$/.test(v)) return isValidPartitaIva(v);
  if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const c = v[i];
    if (i % 2 === 0) sum += CF_ODD[c];
    else sum += /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 65;
  }
  return String.fromCharCode(65 + (sum % 26)) === v[15];
}

// IBAN (qualsiasi paese): controllo mod 97.
export function isValidIban(value) {
  const v = clean(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) return false;
  if (v.startsWith("IT") && v.length !== 27) return false;
  const rearranged = v.slice(4) + v.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const d of digits) rem = (rem * 10 + Number(d)) % 97;
  return rem === 1;
}

export const isValidCap = (v) => /^\d{5}$/.test(clean(v));
export const isValidProvincia = (v) => /^[A-Z]{2}$/.test(clean(v));
export const isValidSdi = (v) => /^[A-Z0-9]{7}$/.test(clean(v));
export const isValidEmail = (v) => /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/.test(String(v || "").trim());

export const formatIban = (v) => clean(v).replace(/(.{4})/g, "$1 ").trim();

// Restituisce { campo: messaggio } per i campi compilati ma non validi.
export function validateContact(c) {
  const errors = {};
  if (c.partita_iva && !isValidPartitaIva(c.partita_iva)) errors.partita_iva = "Partita IVA non valida";
  if (c.codice_fiscale && !isValidCodiceFiscale(c.codice_fiscale)) errors.codice_fiscale = "Codice fiscale non valido";
  if (c.iban && !isValidIban(c.iban)) errors.iban = "IBAN non valido";
  if (c.cap && !isValidCap(c.cap)) errors.cap = "CAP di 5 cifre";
  if (c.provincia && !isValidProvincia(c.provincia)) errors.provincia = "Sigla di 2 lettere";
  if (c.codice_sdi && !isValidSdi(c.codice_sdi)) errors.codice_sdi = "Codice SDI di 7 caratteri";
  if (c.email && !isValidEmail(c.email)) errors.email = "Email non valida";
  if (c.pec && !isValidEmail(c.pec)) errors.pec = "PEC non valida";
  return errors;
}
