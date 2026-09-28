import { describe, it, expect } from "vitest";
import { mergePsc } from "@/lib/posPsc";

const pos = {
  impresa: { ragione_sociale: "Edilizia Dolomiti Srl" },
  cantiere: { nome: "Villa Bianchi", indirizzo: "", committente: "Mario Bianchi", orario: "08:00–12:00 / 13:00–17:00, dal lunedì al venerdì", subappaltatori: [] },
  lavorazioni: [{ nome: "Demolizioni e rimozioni", rischi: [], misure: [], dpi: [] }, { nome: "Murature e tramezzature", rischi: [{ rischio: "Caduta", p: 2, d: 3 }], misure: ["mia misura"], dpi: [] }],
  attrezzature: { macchine: ["Betoniera"], opere_provvisionali: [], impianti: [] },
  dpi: ["Casco di protezione (EN 397)"],
  emergenze: { procedure: "Chiamare il 112.", ospedale: "" },
};

const psc = {
  cantiere: { indirizzo: "Via Roma 88, Bolzano", committente: "Altro nome", cse: "Geom. Plattner", data_inizio: "2026-10-01", data_fine: "31/12/2026", orario: "07:30–16:30" },
  imprese: [{ nome: "Edilizia Dolomiti Srl", lavorazioni: "opere edili" }, { nome: "Elettro Rainer Snc", lavorazioni: "impianto elettrico" }],
  lavorazioni: [
    { nome: "Demolizioni", descrizione: "Rimozione pavimenti", rischi: [{ rischio: "Polveri", p: 3, d: 9 }], misure: ["Bagnatura"], dpi: ["FFP2"] },
    { nome: "Murature e tramezzature", rischi: [{ rischio: "Altro", p: 1, d: 1 }], misure: ["misura PSC"] },
    { nome: "Montaggio ponteggio", rischi: [{ rischio: "Caduta dall'alto", p: 3, d: 4 }], misure: ["PiMUS"] },
  ],
  macchine: ["betoniera", "Autogru"], opere_provvisionali: ["Ponteggio metallico"], dpi: ["Casco di protezione (EN 397)", "Imbracatura"],
  sostanze: [{ nome: "Primer bituminoso", uso: "impermeabilizzazione" }],
  emergenze: { ospedale: "Ospedale di Bolzano, Via Böhler 5", procedure: "Evacuare verso il punto di raccolta nel cortile." },
  procedure_psc: "Riunione di coordinamento prima dell'ingresso.",
};

describe("PSC → POS", () => {
  const { dati, count } = mergePsc(pos, psc);

  it("riempie solo i campi vuoti del cantiere", () => {
    expect(dati.cantiere.indirizzo).toBe("Via Roma 88, Bolzano");
    expect(dati.cantiere.committente).toBe("Mario Bianchi");
    expect(dati.cantiere.cse).toBe("Geom. Plattner");
    expect(dati.cantiere.data_inizio).toBe("2026-10-01");
    expect(dati.cantiere.data_fine).toBeUndefined(); // data non in formato valido: ignorata
    expect(dati.cantiere.orario).toBe("07:30–16:30"); // l'orario predefinito viene sostituito da quello del PSC
    expect(dati.cantiere.presenza_psc).toBe(true);
  });

  it("aggiunge le altre imprese ma non la propria", () => {
    expect(dati.cantiere.subappaltatori.map((s) => s.nome)).toEqual(["Elettro Rainer Snc"]);
  });

  it("completa le lavorazioni senza rischi, non tocca quelle già valutate, aggiunge le nuove", () => {
    const dem = dati.lavorazioni.find((l) => l.nome === "Demolizioni e rimozioni");
    expect(dem.rischi).toEqual([{ rischio: "Polveri", p: 3, d: 4 }]); // D limitato a 4
    expect(dem.misure).toEqual(["Bagnatura"]);
    const mur = dati.lavorazioni.find((l) => l.nome === "Murature e tramezzature");
    expect(mur.misure).toEqual(["mia misura"]);
    expect(dati.lavorazioni.find((l) => l.nome === "Montaggio ponteggio")).toMatchObject({ da_psc: true });
    expect(dati.lavorazioni).toHaveLength(3);
  });

  it("unisce elenchi senza doppioni ed emergenze", () => {
    expect(dati.attrezzature.macchine).toEqual(["Betoniera", "Autogru"]);
    expect(dati.attrezzature.opere_provvisionali).toEqual(["Ponteggio metallico"]);
    expect(dati.dpi).toEqual(["Casco di protezione (EN 397)", "Imbracatura"]);
    expect(dati.sostanze[0]).toMatchObject({ nome: "Primer bituminoso", scheda: "Disponibile in cantiere" });
    expect(dati.emergenze.ospedale).toContain("Bolzano");
    expect(dati.emergenze.procedure).toContain("Chiamare il 112.");
    expect(dati.emergenze.procedure).toContain("Dal PSC: Evacuare");
    expect(dati.procedure_psc).toContain("coordinamento");
    expect(count).toBeGreaterThan(10);
  });

  it("non modifica l'oggetto originale", () => {
    expect(pos.cantiere.indirizzo).toBe("");
    expect(pos.lavorazioni).toHaveLength(2);
  });
});
