import { describe, it, expect } from "vitest";
import { parsePrice, detectColumns, rowsToVoci, mapUnit, rowFromVoce, keywords } from "@/lib/prezzari";

describe("lettura dei prezzi", () => {
  it.each([
    ["1.234,56 €", 1234.56],
    ["12,5", 12.5],
    ["1234.56", 1234.56],
    ["1,234.56", 1234.56],
    ["1.234.567", 1234567],
    ["€ 45", 45],
    [18.3, 18.3],
    ["", null],
    ["n.d.", null],
  ])("%s → %s", (input, out) => expect(parsePrice(input)).toBe(out));
});

describe("importazione di un foglio di prezzario", () => {
  const rows = [
    ["PREZZARIO REGIONALE 2026"],
    [],
    ["Codice", "Descrizione", "U.M.", "Prezzo €", "% Manodopera"],
    ["", "OPERE MURARIE", "", "", ""],
    ["A.01", "Muratura in blocchi di laterizio, compresi malta e sfridi", "", "", ""],
    ["A.01.01", "spessore 12 cm", "m²", "38,50", "45%"],
    ["A.01.02", "spessore 25 cm", "m²", "52,10", "40%"],
    ["", "INTONACI", "", "", ""],
    ["B.01", "Intonaco civile a tre strati su pareti interne", "mq", "24,00", "60%"],
    ["B.02", "voce senza prezzo e lunga che non è un capitolo perché scritta in minuscolo", "", "", ""],
  ];

  it("trova intestazione e colonne, ignorando la % di manodopera", () => {
    expect(detectColumns(rows)).toEqual({ headerRow: 2, codice: 0, descrizione: 1, unita_misura: 2, prezzo: 3 });
  });

  it("restituisce null se l'intestazione non si riconosce", () => {
    expect(detectColumns([["a", "b"], ["c", "d"]])).toBeNull();
  });

  it("unisce la descrizione madre alle righe figlie e assegna il capitolo", () => {
    const voci = rowsToVoci(rows, detectColumns(rows));
    expect(voci).toHaveLength(3);
    expect(voci[0]).toEqual({ codice: "A.01.01", capitolo: "OPERE MURARIE", descrizione: "Muratura in blocchi di laterizio, compresi malta e sfridi – spessore 12 cm", unita_misura: "m²", prezzo: 38.5 });
    expect(voci[2]).toMatchObject({ codice: "B.01", capitolo: "INTONACI", descrizione: "Intonaco civile a tre strati su pareti interne", prezzo: 24 });
  });
});

describe("dal prezzario al preventivo", () => {
  it.each([["m²", "mq"], ["MQ", "mq"], ["m3", "mc"], ["cadauno", "cad"], ["h", "ore"], ["a corpo", "corpo"], ["q.li", "t"], ["boh", null]])("unità %s → %s", (a, b) => expect(mapUnit(a)).toBe(b));

  it("applica il ricarico e conserva la fonte del prezzo", () => {
    const r = rowFromVoce({ codice: "A.01.01", descrizione: "Muratura", unita_misura: "m²", prezzo: 38.5 }, { nome: "Regione 2026", ricarico_percentuale: 10 }, 10);
    expect(r).toMatchObject({ unita_misura: "mq", prezzo_unitario: 42.35, iva_percentuale: 10, fonte_prezzo: { prezzario: "Regione 2026", codice: "A.01.01", prezzo_base: 38.5 } });
  });

  it("parole chiave senza accenti, parole corte o comuni", () => {
    const k = keywords("Demolizione di pavimento in ceramica, compreso il trasporto");
    expect(k).toEqual(expect.arrayContaining(["demolizione", "pavimento", "ceramica", "trasporto"]));
    expect(k).not.toContain("di");
  });
});
