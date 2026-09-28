import { describe, it, expect } from "vitest";
import { summarize, DEFAULT_SETTINGS } from "@/lib/timbrature";

const ev = (id, tipo, time, extra = {}) => ({ id, tipo, at: `2026-09-28T${time}:00Z`, data: "2026-09-28", dipendente_id: "a", dipendente_nome: "Anna", worksite_id: "c1", worksite_nome: "Villa", ...extra });

describe("timbrature → ore", () => {
  it("giornata piena: pausa tolta una volta, arrotondamento al quarto d'ora", () => {
    const [r] = summarize([ev(1, "entrata", "06:00"), ev(2, "uscita", "15:07")]);
    expect(r.ore).toBe(8); // 9h07 − 1h di pausa = 8h07 → 8
    expect(r.pausa).toBe(1);
    expect(r.issues).toEqual([]);
  });

  it("mezza giornata: nessuna pausa", () => {
    expect(summarize([ev(1, "entrata", "06:00"), ev(2, "uscita", "10:30")])[0].ore).toBe(4.5);
  });

  it("due cantieri nella stessa giornata", () => {
    const [r] = summarize([
      ev(1, "entrata", "06:00"), ev(2, "uscita", "10:00"),
      ev(3, "entrata", "11:00", { worksite_id: "c2", worksite_nome: "Scuola" }), ev(4, "uscita", "15:00", { worksite_id: "c2" }),
    ]);
    expect(r.cantieri.map((c) => [c.cantiere_id, c.ore])).toEqual([["c1", 4], ["c2", 4]]);
    expect(r.ore).toBe(8);
  });

  it("segnala uscita mancante e timbrature fuori ordine", () => {
    expect(summarize([ev(1, "entrata", "06:00")])[0].issues).toContain("manca l'uscita");
    expect(summarize([ev(1, "uscita", "06:00")])[0].issues).toContain("uscita senza entrata");
  });

  it("segnala le timbrature lontane dal cantiere", () => {
    expect(summarize([ev(1, "entrata", "06:00", { distanza_m: 1200 }), ev(2, "uscita", "07:00", { distanza_m: 40 })])[0].lontano).toBe(true);
    expect(summarize([ev(1, "entrata", "06:00", { distanza_m: 120 })], DEFAULT_SETTINGS)[0].lontano).toBe(false);
  });

  it("separa dipendenti e giorni", () => {
    const rows = summarize([ev(1, "entrata", "06:00"), ev(2, "entrata", "07:00", { dipendente_id: "b", dipendente_nome: "Bruno" })]);
    expect(rows.map((r) => r.dipendente_nome)).toEqual(["Anna", "Bruno"]);
  });
});
