import { describe, it, expect } from "vitest";
import { canBid, soaDeadlines, isoDeadlines, reachableClass, requirementsByCategory, needsIso, missingCel, qualityRecords, classLimit } from "@/lib/qualifications";

const soa = { categorie: [{ codice: "OG1", classifica: "II" }, { codice: "OS30", classifica: "VIII" }] };

describe("SOA: partecipazione alle gare", () => {
  it("sotto i 150.000 € la SOA non serve", () => expect(canBid({}, "OG1", 120000).ok).toBe(true));
  it("classifica aumentata di un quinto", () => {
    expect(canBid(soa, "OG1", 600000).ok).toBe(true); // II = 516.000 × 1,2 = 619.200
    expect(canBid(soa, "OG1", 650000).ok).toBe(false);
  });
  it("categoria assente e classifica VIII illimitata", () => {
    expect(canBid(soa, "OG3", 300000).ok).toBe(false);
    expect(canBid(soa, "OS30", 50_000_000).ok).toBe(true);
  });
  it("ISO 9001 obbligatoria dalla classifica III", () => {
    expect(needsIso("II")).toBe(false);
    expect(needsIso("III")).toBe(true);
    expect(classLimit("III-bis")).toBe(1_500_000);
  });
});

describe("Scadenze", () => {
  it("SOA: verifica triennale e rinnovo 90 giorni prima", () => {
    const d = soaDeadlines({ data_rilascio: "2025-03-10" });
    expect(d.find((x) => x.key === "verifica").data).toBe("2027-12-11"); // 90 giorni prima del 10/3/2028 (bisestile)
    expect(d.find((x) => x.key === "scadenza").data).toBe("2030-03-10");
    expect(d.find((x) => x.key === "rinnovo").data).toBe("2029-12-10");
  });
  it("ISO: prossimo audit annuale dopo oggi", () => {
    const d = isoDeadlines({ data_rilascio: "2024-05-20" }, new Date("2026-10-01"));
    expect(d.find((x) => x.key === "audit")).toBeUndefined(); // ultimo anno: c'è la ricertificazione
    expect(d.find((x) => x.key === "ricertificazione").data).toBe("2027-02-20");
    expect(isoDeadlines({ data_rilascio: "2026-01-15" }, new Date("2026-10-01")).find((x) => x.key === "audit").data).toBe("2027-01-15");
    expect(d.find((x) => x.key === "scadenza").data).toBe("2027-05-20");
  });
});

describe("Requisiti dai lavori", () => {
  it("classifica raggiungibile: 90% e lavoro di punta", () => {
    expect(reachableClass([{ importo: 120000 }, { importo: 120000 }]).classifica).toBe("I"); // 240k ≥ 232,2k e 120k ≥ 40% di 258k
    expect(reachableClass([{ importo: 500000 }]).classifica).toBe("II");
    expect(reachableClass([{ importo: 50000 }]).classifica).toBe(null);
  });
  it("raggruppa per categoria i soli lavori finiti nel periodo e trova i CEL mancanti", () => {
    const ws = [
      { id: "1", nome: "A", stato: "finito", categoria_soa: "OG1", importo_totale: 300000, data_fine_effettiva: "2024-01-01", committente_pubblico: true },
      { id: "2", nome: "B", stato: "in_corso", categoria_soa: "OG1", importo_totale: 900000 },
      { id: "3", nome: "C", stato: "finito", categoria_soa: "OG1", importo_totale: 100000, data_fine_effettiva: "2005-01-01" },
    ];
    const r = requirementsByCategory(ws, 10, new Date("2026-10-01"));
    expect(r).toHaveLength(1);
    expect(r[0].totale).toBe(300000);
    expect(missingCel(ws).map((w) => w.id)).toEqual(["1"]);
  });
  it("registrazioni ISO dai dati esistenti", () => {
    const q = qualityRecords({
      segnalazioni: [{ tipo: "sicurezza", stato: "aperta" }, { tipo: "altro" }],
      transactions: [{ tipo: "uscita", fornitore: "Edilmat", importo: 100, ddt: { conforme: false } }, { tipo: "uscita", fornitore: "Edilmat", importo: 50, ddt: {} }],
      today: new Date("2026-10-01"),
    });
    expect(q.nonConformita).toMatchObject({ totale: 1, aperte: 1 });
    expect(q.fornitori[0]).toMatchObject({ nome: "Edilmat", consegne: 2, problemi: 1, esito: "da monitorare" });
  });
});

describe("Pratiche SOA/ISO", async () => {
  const { progress, mergeFields, mergeRows, fromApp, checkEconomics, missingFields } = await import("@/lib/pratiche");
  it("non sovrascrive i campi già compilati e tiene la fonte", () => {
    let p = { campi: { ragione_sociale: { value: "Edil Rossi", fonte: "manuale" } } };
    const m = mergeFields(p, { ragione_sociale: "ALTRO", rea: "BZ-123" }, "visura.pdf");
    expect(m.n).toBe(1);
    expect(m.p.campi.ragione_sociale.value).toBe("Edil Rossi");
    expect(m.p.campi.rea).toEqual({ value: "BZ-123", fonte: "visura.pdf" });
  });
  it("anni e lavori senza doppioni", () => {
    let p = mergeRows({}, [{ anno: "2024", fatturato_lavori: 100 }], [{ committente: "Comune", oggetto: "Scuola" }]);
    p = mergeRows(p, [{ anno: 2024, costo_personale: 20 }, { anno: "2023", fatturato_lavori: 50 }], [{ committente: "comune", oggetto: "scuola" }]);
    expect(p.anni).toEqual([{ anno: "2024", fatturato_lavori: 100, costo_personale: 20 }, { anno: "2023", fatturato_lavori: 50 }]);
    expect(p.lavori).toHaveLength(1);
  });
  it("dati presi dall'app e avanzamento", () => {
    const { values, lavori } = fromApp("soa", { profile: { ragione_sociale: "Edil Rossi", partita_iva: "01234567890" }, employees: [{ ruolo: "Muratore" }, { ruolo: "Impiegata" }], worksites: [{ stato: "finito", nome: "Villa", cliente_nome: "Bianchi", importo_totale: 1000 }] });
    expect(values).toMatchObject({ ragione_sociale: "Edil Rossi", organico_medio: 2, operai: 1, tecnici: 1 });
    expect(lavori[0]).toMatchObject({ oggetto: "Villa", committente: "Bianchi", documento: "contratto e fatture" });
    const p = mergeRows(mergeFields({}, values, "app").p, [], lavori);
    expect(progress("soa", p).done).toBeGreaterThan(5);
    expect(missingFields("soa", p).some((f) => f.k === "rea")).toBe(true);
  });
  it("requisiti economici sui 5 anni migliori", () => {
    const e = checkEconomics([2025, 2024, 2023, 2022, 2021, 2020].map((a, i) => ({ anno: String(a), fatturato_lavori: 100000 * (i + 1), costo_personale: 20000 * (i + 1), ammortamenti_noleggi: 1000 })), 2026);
    expect(e.anni).toHaveLength(5);
    expect(e.personale.ok).toBe(true);
    expect(e.attrezzatura.ok).toBe(false);
  });
});
