import { describe, it, expect } from "vitest";
import { buildReceivables, bucketOf, reminderText } from "@/lib/receivables";
import { worksiteSpan, phaseSpans, loads } from "@/lib/schedule";
import { materialsOf, ddtTransaction } from "@/lib/ddt";
import { deadlines, statusOf, busyOn } from "@/lib/equipment";

const TODAY = "2026-09-29";

describe("scadenzario incassi", () => {
  const worksites = [{ id: "w1", nome: "Villa", cliente_id: "c1", cliente_nome: "Rossi", piano_pagamenti: [
    { descrizione: "Acconto", importo: 1000, scadenza: "2026-07-01" },
    { descrizione: "SAL n. 1", importo: 2000, scadenza: "2026-09-01" },
    { descrizione: "Saldo", importo: 500, scadenza: "2026-11-30" },
  ] }];
  const payments = [{ worksite_id: "w1", importo: 1000 }];
  const transactions = [{ worksite_id: "w1", tipo: "entrata", importo: 500 }];
  const invoices = [
    { id: "i1", numero: "3/2026", data: "2026-08-01", scadenza: "2026-08-31", stato: "inviata", totale: 1220, cliente_id: "c2", cliente_nome: "Bianchi" },
    { id: "i2", numero: "4/2026", stato: "pagata", totale: 900 },
    { id: "i3", numero: "5/2026", stato: "bozza", totale: 900 },
    { id: "i4", numero: "6/2026", stato: "emessa", totale: 1500, scadenza: "2026-10-30", worksite_id: "w1", rata_rif: "Saldo" },
  ];
  const contacts = [{ id: "c1", email: "rossi@x.it" }, { id: "c2", pec: "bianchi@pec.it" }];
  const rows = buildReceivables({ worksites, payments, transactions, invoices, contacts }, TODAY);

  it("rate coperte in ordine, anche con le entrate dei movimenti; niente bozze né fatture pagate", () => {
    expect(rows.map((r) => r.key)).toEqual(["inv-i1", "rata-w1-1", "inv-i4"]);
    const sal = rows.find((r) => r.kind === "rata");
    expect(sal).toMatchObject({ titolo: "SAL n. 1", importo: 1500, parziale: true, email: "rossi@x.it", giorni: -28 });
  });
  it("la rata già fatturata non compare due volte", () => {
    expect(rows.some((r) => r.titolo === "Saldo")).toBe(false);
  });
  it("usa la PEC se manca l'email e raggruppa per urgenza", () => {
    expect(rows[0].email).toBe("bianchi@pec.it");
    expect(bucketOf(rows[0])).toBe("scaduto");
    expect(bucketOf({ giorni: -90 })).toBe("oltre60");
    expect(bucketOf(rows[2])).toBe("dopo"); // 31 giorni
  });
  it("testi dei solleciti con importo, scadenza e IBAN", () => {
    const t = reminderText(rows[1], "deciso", { iban: "IT60X0542811101000000123456", ragione_sociale: "Edil Srl" });
    expect(t.subject).toContain("Sollecito");
    expect(t.body).toContain("1.500,00");
    expect(t.body).toContain("IT60X0542811101000000123456");
    expect(reminderText(rows[1], "ultimo", {}).body).toContain("231/2002");
  });
});

describe("cronoprogramma", () => {
  const w1 = { id: "w1", nome: "Villa", data_inizio: "2026-10-01", data_fine_prevista: "2026-10-30", squadra_ids: ["e1", "e2"], fasi: [{ nome: "Demolizioni", peso: 1 }, { nome: "Murature", peso: 3 }] };
  const w2 = { id: "w2", nome: "Scuola", data_inizio: "2026-10-20", data_fine_prevista: "2026-11-15", squadra_ids: ["e1"] };
  it("fasi distribuite in proporzione al peso", () => {
    const f = phaseSpans(w1, TODAY);
    expect(f[0]).toMatchObject({ start: "2026-10-01", end: "2026-10-08" });
    expect(f[1]).toMatchObject({ start: "2026-10-09", end: "2026-10-30" });
  });
  it("date mancanti stimate", () => {
    expect(worksiteSpan({}, TODAY)).toMatchObject({ start: TODAY, end: "2026-10-29", stimato: true });
  });
  it("sovrapposizioni delle persone su due cantieri", () => {
    const { people } = loads({ worksites: [w1, w2], employees: [{ id: "e1", nome: "Anna" }, { id: "e2", nome: "Bruno" }, { id: "e3", nome: "Carla" }] }, TODAY);
    const anna = people.find((p) => p.id === "e1");
    expect(anna.clashes).toEqual([{ start: "2026-10-20", end: "2026-10-30", tra: ["Villa", "Scuola"] }]);
    expect(people.find((p) => p.id === "e2").clashes).toEqual([]);
    expect(people.some((p) => p.id === "e3")).toBe(false);
  });
});

describe("DDT e materiali", () => {
  const w = { id: "w1", nome: "Villa" };
  const t1 = ddtTransaction({ numero: "12", fornitore: "Würth", data: "2026-09-10", importo: 300, righe: [{ descrizione: "Cemento 32,5", quantita: 20, unita: "sacchi", importo: 150 }, { descrizione: "Tassello 8mm", quantita: 100, unita: "pz", importo: 150 }] }, w, "u");
  const t2 = ddtTransaction({ numero: "15", fornitore: "Edilcassa", data: "2026-09-20", importo: 80, righe: [{ descrizione: "cemento 32,5 ", quantita: 10, unita: "Sacchi", importo: 80 }] }, w, "u");
  it("movimento di spesa della bolla", () => {
    expect(t1).toMatchObject({ tipo: "uscita", categoria: "Materiali", descrizione: "DDT n. 12 – Würth", importo: 300, worksite_id: "w1" });
  });
  it("materiali sommati per descrizione e unità", () => {
    const m = materialsOf([t1, t2]);
    expect(m[0]).toMatchObject({ descrizione: "Cemento 32,5", quantita: 30, importo: 230, ddt: 2, fornitori: ["Würth", "Edilcassa"], ultima: "2026-09-20" });
    expect(m).toHaveLength(2);
  });
});

describe("mezzi", () => {
  const today = new Date();
  const d = (k) => { const x = new Date(today); x.setDate(x.getDate() + k); return x.toISOString().slice(0, 10); };
  it("scadenze ordinate e stato del mezzo", () => {
    const m = { scadenze: { revisione: d(10), assicurazione: d(100), bollo: d(-3) } };
    expect(deadlines(m).map((x) => [x.key, x.stato])).toEqual([["bollo", "scaduta"], ["revisione", "vicina"], ["assicurazione", "ok"]]);
    expect(statusOf(m).key).toBe("scaduta");
    expect(statusOf({ scadenze: { revisione: d(100) } }).key).toBe("ok");
  });
  it("impegno su un cantiere nel periodo", () => {
    const m = { assegnazione: { worksite_id: "w1", dal: "2026-10-01", al: "2026-10-10" } };
    expect(busyOn(m, "2026-10-05")).toBe(true);
    expect(busyOn(m, "2026-10-11")).toBe(false);
  });
});
