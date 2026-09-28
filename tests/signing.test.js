import { describe, it, expect } from "vitest";
import * as server from "../api/_lib/sign.js";
import * as client from "@/lib/signing";

// Se le impronte di browser e server divergono, nessuna firma verrebbe più accettata.
describe("firma da telefono", () => {
  const contract = { titolo: "Contratto d'appalto – Villa «Bianchi»", contenuto_finale: "ART. 1 – OGGETTO\nLavori à forfait 1.000 €\n\n✓ fine" };
  const plan = {
    titolo: "POS – Cantiere", revisione: 2,
    dati: { impresa: { rls: "Luca Bianchi", rspp: "Anna Verdi", capocantiere: "" }, lavoratori: [{ id: "e1", nome: "Gino Neri", mansione: "Muratore" }, { nome: "" }], lavorazioni: [{ nome: "Scavi", rischi: [{ rischio: "Seppellimento", p: 2, d: 4 }] }] },
  };

  it("stessa impronta del contratto nel browser e sul server", async () => {
    expect(await client.contractHash(contract)).toBe(server.contractHash(contract));
    expect(server.contractHash(contract)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("stessa impronta del POS e cambia con la revisione", async () => {
    expect(await client.posHash(plan)).toBe(server.posHash(plan));
    expect(server.posHash({ ...plan, revisione: 3 })).not.toBe(server.posHash(plan));
  });

  it("stesso elenco dei firmatari del POS", () => {
    expect(client.posSigners(plan)).toEqual(server.posSigners(plan));
    expect(server.posSigners(plan).map((s) => s.id)).toEqual(["lav:e1", "rls", "rspp"]);
  });

  it("accetta solo firme PNG in data URL di dimensione ragionevole", () => {
    expect(server.validSignature("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(server.validSignature("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(server.validSignature("https://example.com/firma.png")).toBe(false);
    expect(server.validSignature(`data:image/png;base64,${"A".repeat(400_000)}`)).toBe(false);
  });
});
