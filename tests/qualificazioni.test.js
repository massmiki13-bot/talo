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
