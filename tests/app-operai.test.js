import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { T, LANGS, translator } from "@/lib/workerI18n";
import { cleanType } from "@/lib/worker";

describe("app operai: traduzioni", () => {
  it("rumeno e albanese hanno tutte le chiavi dell'italiano", () => {
    const base = Object.keys(T.it);
    for (const { code } of LANGS) {
      const missing = base.filter((k) => !T[code]?.[k]);
      expect(missing, `mancano in ${code}`).toEqual([]);
    }
  });

  it("ogni testo usato nei componenti esiste nel dizionario", () => {
    const dirs = ["src/components/worker", "src/components/attendance"];
    const used = new Set();
    for (const d of dirs) {
      for (const f of fs.readdirSync(d)) {
        const src = fs.readFileSync(path.join(d, f), "utf8");
        for (const m of src.matchAll(/\bt\("([a-z_0-9]+)"\)/g)) used.add(m[1]);
      }
    }
    expect(used.size).toBeGreaterThan(20);
    expect([...used].filter((k) => !(k in T.it))).toEqual([]);
  });

  it("chiave assente: ricade sull'italiano, poi sulla chiave", () => {
    expect(translator("ro")("oggi")).toBe(T.ro.oggi);
    expect(translator("xx")("oggi")).toBe(T.it.oggi);
    expect(translator("sq")("inesistente")).toBe("inesistente");
  });
});

describe("app operai: tipi audio", () => {
  it("rimuove i parametri dal mime type registrato", () => {
    expect(cleanType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(cleanType("")).toBe("");
  });
});

describe("app operai: moduli specifici", async () => {
  const { REPORT_FIELDS, PHOTO_CATEGORIES, detailRows, workingDays, hoursBetween } = await import("@/lib/workerFields");
  it("ogni campo, opzione e lavorazione è tradotto in tutte le lingue", () => {
    const keys = [...PHOTO_CATEGORIES, ...Object.values(REPORT_FIELDS).flat().flatMap((f) => [f.k, ...(f.options || []), ...(f.ph ? [f.ph] : [])])];
    for (const { code } of LANGS) expect(keys.filter((k) => !T[code][k]), code).toEqual([]);
  });
  it("dettagli leggibili per il titolare, senza campi nascosti", () => {
    expect(detailRows("infortunio", { chi_ferito: "io", nome_collega: "Gino", parte_corpo: "p_mani" })).toEqual([["Chi si è fatto male", "Io"], ["Parte del corpo", "Mani"]]);
    expect(detailRows("materiale", { materiale: "Cemento", serve_entro: "entro_domani" })).toEqual([["Materiale", "Cemento"], ["Serve entro", "Domani"]]);
  });
  it("giorni lavorativi e ore di permesso", () => {
    expect(workingDays("2026-10-09", "2026-10-12")).toBe(2); // ven + lun
    expect(workingDays("2026-10-10", "")).toBe(0); // sabato
    expect(hoursBetween("08:00", "11:30")).toBe(3.5);
    expect(hoursBetween("12:00", "08:00")).toBe(0);
  });
});

describe("lingua dell'interfaccia titolare", async () => {
  const { extract } = await import("../scripts/i18n-build.mjs");
  const ro = (await import("@/i18n/ro.json")).default;
  const sq = (await import("@/i18n/sq.json")).default;
  it("estrae i testi dell'interfaccia e ignora codice e classi", () => {
    const got = [...extract(`<Button className="w-full h-12 bg-brand-600" title="Salva il preventivo">Nuovo preventivo</Button>
      <p>Ciao, {nome}. Hai {n} avvisi da leggere</p>{x > 0 && y < 2 ? "a" : "b"}`)];
    expect(got).toEqual(expect.arrayContaining(["Salva il preventivo", "Nuovo preventivo", "Hai", "avvisi da leggere"]));
    expect(got.some((s) => s.includes("w-full") || s.includes("&&"))).toBe(false);
  });
  it("dizionari rumeno e albanese completi e con i segnaposto numerici intatti", () => {
    expect(Object.keys(ro).length).toBeGreaterThan(3000);
    expect(Object.keys(sq).sort()).toEqual(Object.keys(ro).sort());
    for (const d of [ro, sq]) for (const [k, v] of Object.entries(d)) if (k.includes("{n}")) expect(v.split("{n}").length, k).toBe(k.split("{n}").length);
  });
});
