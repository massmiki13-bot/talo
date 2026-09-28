import { describe, it, expect } from "vitest";
import { RELATED, linkedInitial, fromWorksite, summaryFields } from "@/lib/contracts";
import { contractSchemas } from "@/utils/contracts";

const appalto = {
  tipo: "appalto", titolo: "Appalto – Hotel Alpenrose Srl", controparte_nome: "Hotel Alpenrose Srl", data_creazione: "2026-09-01", worksite_id: "w1",
  dati_compilati: { OGGETTO_LAVORI: "Ristrutturazione ala nord", LUOGO_ESECUZIONE: "Via Dolomiti 4, Ortisei", DATA_INIZIO: "2026-09-15", DATA_FINE: "2026-12-20", IMPORTO: "180000", NOME_CONTROPARTE: "Hotel Alpenrose Srl", PIVA_CONTROPARTE: "01234567897", LUOGO_STIPULA: "Bolzano" },
};

describe("contratti collegati", () => {
  it("ogni tipo suggerito esiste tra i modelli", () => {
    for (const list of Object.values(RELATED)) for (const [t] of list) expect(contractSchemas[t]).toBeTruthy();
  });

  it("il subappalto riprende oggetto, luogo, date e lavoro, ma non la controparte né l'importo", () => {
    const i = linkedInitial(appalto, "subappalto");
    expect(i.tipo).toBe("subappalto");
    expect(i.links).toEqual({ worksite_id: "w1" });
    expect(i.fields).toMatchObject({ OGGETTO_LAVORI: "Parte dei lavori di: Ristrutturazione ala nord", LUOGO_ESECUZIONE: "Via Dolomiti 4, Ortisei", DATA_INIZIO: "2026-09-15", DATA_FINE: "2026-12-20", LUOGO_STIPULA: "Bolzano" });
    expect(i.fields.RIFERIMENTO_APPALTO_PRINCIPALE).toContain("Hotel Alpenrose Srl");
    expect(i.fields.NOME_CONTROPARTE).toBeUndefined();
    expect(i.fields.IMPORTO).toBeUndefined();
    expect(i.fields.PIVA_CONTROPARTE).toBeUndefined();
  });

  it("fornitura e incarico partono dal luogo e dall'oggetto del lavoro", () => {
    expect(linkedInitial(appalto, "fornitura").fields).toMatchObject({ OGGETTO_FORNITURA: "Materiali per: Ristrutturazione ala nord", LUOGO_CONSEGNA: "Via Dolomiti 4, Ortisei", DATA_CONSEGNA: "2026-09-15" });
    expect(linkedInitial(appalto, "lettera_incarico").fields.OGGETTO_INCARICO).toContain("Ristrutturazione ala nord");
  });

  it("i campi riportati esistono nel modello di destinazione", () => {
    for (const [t] of RELATED.appalto) {
      const s = contractSchemas[t];
      const known = new Set([...s.required, ...s.optional]);
      for (const k of Object.keys(linkedInitial(appalto, t).fields)) expect(known.has(k), `${t}: ${k}`).toBe(true);
    }
  });

  it("dati dal lavoro e riepilogo della scheda", () => {
    expect(fromWorksite({ nome: "Villa", tipo_intervento: "Ristrutturazione", indirizzo: "Via Roma 1", importo_totale: 1000 })).toMatchObject({ OGGETTO_LAVORI: "Ristrutturazione – Villa", LUOGO_ESECUZIONE: "Via Roma 1" });
    expect(summaryFields({ NOME_CONTROPARTE: "X", IMPORTO: "12.500,50".replace(".", "") })).toMatchObject({ controparte_nome: "X", importo: 12500.5 });
  });
});
