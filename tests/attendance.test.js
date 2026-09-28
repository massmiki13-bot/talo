import { describe, it, expect } from "vitest";
import { holidayName, isWorkingDay, previousWorkingDay, employedOn, dayEntries, toRecords, overtime, fmtH, GENERAL } from "@/lib/attendance";
import { laborFromAttendance } from "@/lib/worksites";

describe("calendario", () => {
  it("Pasqua e Pasquetta calcolate per anno", () => {
    expect(holidayName("2026-04-05")).toBe("Pasqua");
    expect(holidayName("2026-04-06")).toBe("Lunedì dell'Angelo");
    expect(holidayName("2027-03-29")).toBe("Lunedì dell'Angelo");
  });
  it("festività fisse", () => {
    expect(holidayName("2026-12-08")).toBe("Immacolata");
    expect(holidayName("2026-06-02")).toBe("Festa della Repubblica");
    expect(holidayName("2026-06-03")).toBeNull();
  });
  it("giorni lavorativi", () => {
    expect(isWorkingDay("2026-09-28")).toBe(true); // lunedì
    expect(isWorkingDay("2026-09-27")).toBe(false); // domenica
    expect(isWorkingDay("2026-12-25")).toBe(false);
  });
  it("giorno lavorativo precedente salta weekend e festivi", () => {
    expect(previousWorkingDay("2026-09-28")).toBe("2026-09-25");
    expect(previousWorkingDay("2026-04-07")).toBe("2026-04-03"); // dopo Pasqua e Pasquetta
  });
});

describe("dipendenti in forza", () => {
  it("considera assunzione e cessazione", () => {
    const e = { data_assunzione: "2026-03-01", data_cessazione: "2026-06-30" };
    expect(employedOn(e, "2026-02-28")).toBe(false);
    expect(employedOn(e, "2026-06-30")).toBe(true);
    expect(employedOn(e, "2026-07-01")).toBe(false);
    expect(employedOn({ stato: "cessato" }, "2026-01-01")).toBe(false);
    expect(employedOn({}, "2026-01-01")).toBe(true);
  });
});

describe("giornata su più cantieri", () => {
  const entries = [
    { dipendente_id: "a", dipendente_nome: "Anna", stato: "presente", cantieri: [{ cantiere_id: "c1", cantiere_nome: "Villa", ore: 5 }, { cantiere_id: "c2", cantiere_nome: "Scuola", ore: 4 }] },
    { dipendente_id: "b", dipendente_nome: "Bruno", stato: "ferie" },
    { dipendente_id: "c", dipendente_nome: "Carla", stato: "presente", cantieri: [] },
    { dipendente_id: "", stato: "presente" },
  ];

  it("toRecords raggruppa per cantiere e mette assenze e giornate senza cantiere nel generale", () => {
    const recs = toRecords("2026-09-28", entries);
    const byId = Object.fromEntries(recs.map((r) => [r.cantiere_id, r]));
    expect(Object.keys(byId).sort()).toEqual([GENERAL, "c1", "c2"].sort());
    expect(byId.c1.presenze).toEqual([expect.objectContaining({ dipendente_id: "a", ore: 5, stato: "presente" })]);
    expect(byId[GENERAL].presenze.map((p) => [p.dipendente_id, p.stato])).toEqual([["b", "ferie"], ["c", "presente"]]);
  });

  it("dayEntries ricostruisce la giornata (andata e ritorno)", () => {
    const map = dayEntries(toRecords("2026-09-28", entries), "2026-09-28");
    expect(map.a.ore).toBe(9);
    expect(map.a.cantieri.map((c) => c.cantiere_id).sort()).toEqual(["c1", "c2"]);
    expect(map.b.stato).toBe("ferie");
    expect(map.c.stato).toBe("presente");
    expect(dayEntries(toRecords("2026-09-28", entries), "2026-09-29")).toEqual({});
  });

  it("straordinari oltre le 8 ore", () => {
    expect(overtime(9)).toBe(1);
    expect(overtime(6)).toBe(0);
    expect(fmtH(7.5)).toBe("7,5");
    expect(fmtH(8)).toBe("8");
  });

  it("ore e costo manodopera per cantiere", () => {
    const recs = [...toRecords("2026-09-28", entries), ...toRecords("2026-09-29", [{ dipendente_id: "a", stato: "presente", cantieri: [{ cantiere_id: "c1", ore: 8 }] }])];
    const l = laborFromAttendance(recs, [{ id: "a", costo_orario: 30 }], "c1");
    expect(l).toMatchObject({ ore: 13, costo: 390, giorni: 2 });
    expect(l.persone.get("a")).toBe(13);
  });
});
