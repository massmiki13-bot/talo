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
