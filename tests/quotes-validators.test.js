import { describe, it, expect } from "vitest";
import { calcQuote, chapterTotals, chapterRow } from "@/lib/quotes";
import { isValidPartitaIva, isValidCodiceFiscale, isValidIban, isValidSdi, isValidEmail } from "@/lib/validators";
import { installments, progress } from "@/lib/worksites";

const voce = (q, p, extra = {}) => ({ tipo: "voce", descrizione: "x", quantita: q, prezzo_unitario: p, iva_percentuale: 22, ...extra });

describe("totali del preventivo", () => {
  it("sconto globale, IVA per aliquota ed esclusione delle voci opzionali", () => {
    const c = calcQuote([voce(10, 100), voce(1, 500, { iva_percentuale: 10 }), voce(1, 300, { opzionale: true })], { sconto_globale: 10 });
    expect(c.lordo).toBe(1500);
    expect(c.imponibile).toBeCloseTo(1350);
    expect(c.iva.map((x) => [x.aliquota, Math.round(x.imposta * 100) / 100])).toEqual([[22, 198], [10, 45]]);
    expect(c.totale).toBeCloseTo(1593);
    expect(c.opzionali).toBe(300);
  });

  it("margine solo sulle voci con costo", () => {
    const c = calcQuote([voce(1, 1000, { costo_unitario: 600 }), voce(1, 500)]);
    expect(c.margine).toBe(400);
    expect(c.margine_pct).toBe(40);
    expect(c.voci_senza_costo).toBe(1);
  });

  it("subtotali per capitolo", () => {
    const t = chapterTotals([{ ...chapterRow(), descrizione: "Demolizioni" }, voce(2, 50), { ...chapterRow(), descrizione: "Impianti" }, voce(1, 300)]);
    expect(t).toEqual([{ titolo: "Demolizioni", totale: 100 }, { titolo: "Impianti", totale: 300 }]);
  });
});

describe("controlli anagrafici", () => {
  it("partita IVA", () => {
    expect(isValidPartitaIva("01234567897")).toBe(true);
    expect(isValidPartitaIva("IT 01234567897")).toBe(true);
    expect(isValidPartitaIva("01234567890")).toBe(false);
    expect(isValidPartitaIva("123")).toBe(false);
  });
  it("codice fiscale di persona e di società", () => {
    expect(isValidCodiceFiscale("rssmra80a01h501u")).toBe(true);
    expect(isValidCodiceFiscale("RSSMRA80A01H501X")).toBe(false);
    expect(isValidCodiceFiscale("01234567897")).toBe(true);
  });
  it("IBAN", () => {
    expect(isValidIban("IT60 X054 2811 1010 0000 0123 456")).toBe(true);
    expect(isValidIban("IT60X0542811101000000123457")).toBe(false);
  });
  it("codice SDI ed email", () => {
    expect(isValidSdi("abc1234")).toBe(true);
    expect(isValidSdi("ABC12")).toBe(false);
    expect(isValidEmail("mario@ditta.it")).toBe(true);
    expect(isValidEmail("mario@ditta")).toBe(false);
  });
});

describe("lavori", () => {
  it("rate coperte dai pagamenti in ordine di scadenza", () => {
    const r = installments([{ scadenza: "2099-02-01", importo: 500 }, { scadenza: "2099-01-01", importo: 1000 }], [{ importo: 1200 }]);
    expect(r.map((x) => [x.scadenza, x.stato, x.pagato])).toEqual([["2099-01-01", "pagata", 1000], ["2099-02-01", "parziale", 200]]);
  });
  it("avanzamento pesato sulle fasi", () => {
    expect(progress([{ peso: 3, completamento: 100 }, { peso: 1, completamento: 0 }])).toBe(75);
    expect(progress([])).toBe(0);
  });
});
