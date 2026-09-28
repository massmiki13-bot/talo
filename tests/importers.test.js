import { describe, it, expect } from "vitest";
import { parseRows, toIsoDate, toNumber, headerKey } from "@/lib/importers";

describe("conversioni", () => {
  it("date da Excel e scritte a mano", () => {
    expect(toIsoDate(45292)).toBe("2024-01-01"); // numero seriale di Excel
    expect(toIsoDate("15/03/2020")).toBe("2020-03-15");
    expect(toIsoDate("5-3-21")).toBe("2021-03-05");
    expect(toIsoDate("2026-09-28T10:00")).toBe("2026-09-28");
    expect(toIsoDate("boh")).toBe("");
  });
  it("importi all'italiana", () => {
    expect(toNumber("85.000")).toBe(85);
    expect(toNumber("85.000,00 €")).toBe(85000);
    expect(toNumber("28,50")).toBe(28.5);
    expect(toNumber(12)).toBe(12);
    expect(toNumber("")).toBeNull();
  });
  it("intestazioni normalizzate", () => expect(headerKey("Città / Comune")).toBe("cittacomune"));
});

describe("dipendenti", () => {
  const table = [
    ["Elenco del personale"],
    ["Cognome e nome", "Codice fiscale", "Mansione", "Assunto il", "Costo orario", "Colonna inutile"],
    ["ROSSI MARIO", "rssmra80a01h501u", "Muratore", 43905, "28,50", "x"],
    ["Bianchi Anna", "XXXXXX00X00X000X", "Impiegata", "01/02/2022", "", ""],
    ["", "", "", "", "", ""],
    ["ROSSI MARIO", "", "", "", "", ""],
  ];
  it("trova l'intestazione anche sotto un titolo e converte le righe", () => {
    const rows = parseRows("dipendenti", table);
    expect(rows).toHaveLength(3);
    expect(rows[0].data).toMatchObject({ cognome: "ROSSI", nome: "MARIO", codice_fiscale: "RSSMRA80A01H501U", ruolo: "Muratore", data_assunzione: "2020-03-15", costo_orario: 28.5, stato: "attivo" });
    expect(rows[0].issues).toEqual([]);
  });
  it("segnala codici fiscali non validi e salta i doppioni", () => {
    const rows = parseRows("dipendenti", table);
    expect(rows[1].issues).toContain("codice fiscale non valido");
    expect(rows[1].skip).toBe(false);
    expect(rows[2].skip).toBe(true);
  });
  it("salta chi è già in archivio", () => {
    const rows = parseRows("dipendenti", table, { existing: [{ nome: "Anna", cognome: "Bianchi" }] });
    expect(rows[1].skip).toBe(true);
  });
  it("senza colonne riconoscibili restituisce null", () => {
    expect(parseRows("dipendenti", [["a", "b"], ["1", "2"]])).toBeNull();
  });
});

describe("lavori e clienti", () => {
  it("collega il cliente della rubrica e interpreta lo stato", () => {
    const rows = parseRows("lavori", [["Cantiere", "Committente", "Stato", "Importo", "Inizio"], ["Villa Bianchi", "edil verdi srl", "In corso", "85.000,00", "01/09/2026"], ["Scuola", "Comune", "chiuso", "", ""]],
      { contacts: [{ id: "c1", nome: "Edil Verdi Srl" }] });
    expect(rows[0].data).toMatchObject({ nome: "Villa Bianchi", cliente_id: "c1", cliente_nome: "Edil Verdi Srl", stato: "in_corso", importo_totale: 85000, data_inizio: "2026-09-01", attivo: true });
    expect(rows[1].data).toMatchObject({ stato: "finito", attivo: false, cliente_nome: "Comune" });
    expect(rows[1].issues).toContain("cliente non in rubrica: solo il nome");
  });
  it("clienti: tipo, categorie e doppioni per partita IVA", () => {
    const rows = parseRows("contatti", [["Tipo", "Ragione sociale", "P.IVA", "Categorie"], ["Fornitore", "Ferramenta Sud", "01234567897", "Materiali; Noleggi"], ["Cliente", "Altra", "01234567897", ""]]);
    expect(rows[0].data).toMatchObject({ tipo: "fornitore", nome: "Ferramenta Sud", tipo_soggetto: "azienda", categorie: ["Materiali", "Noleggi"] });
    expect(rows[1].skip).toBe(true);
  });
});
