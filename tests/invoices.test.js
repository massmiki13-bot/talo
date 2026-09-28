import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { computeInvoice, nextNumber, validateInvoice, buildFatturaXml, lineTotal, ALIQUOTE } from "@/lib/invoices";

const profile = {
  ragione_sociale: "Edil Prova S.r.l.", partita_iva: "01234567897", codice_fiscale: "01234567897",
  indirizzo: "Via Roma 1", cap: "39100", citta: "Bolzano", provincia: "bz", regime_fiscale: "RF01",
  iban: "IT60X0542811101000000123456", numero_rea: "BZ-123456", telefono: "0471 123456", email: "info@edilprova.it",
};
const azienda = { nome: "Cliente & Figli S.p.A.", partita_iva: "09876543217", indirizzo: "Via Milano 5", cap: "20100", citta: "Milano", provincia: "MI", codice_sdi: "ABC1234" };
const privato = { nome: "Mario Rossi", codice_fiscale: "RSSMRA80A01H501U", indirizzo: "Via Verdi 3", cap: "39100", citta: "Bolzano", provincia: "BZ" };
const pa = { nome: "Comune di Prova", partita_iva: "02468135799", codice_fiscale: "02468135799", tipo_soggetto: "ente", indirizzo: "Piazza Municipio 1", cap: "39100", citta: "Bolzano", provincia: "BZ", codice_sdi: "UFABCD" };

const riga = (prezzo, extra = {}) => ({ descrizione: "Lavori", quantita: 1, unita_misura: "corpo", prezzo_unitario: prezzo, ...extra });
const base = (righe, extra = {}) => ({ numero: "1/2026", data: "2026-09-28", righe, modalita_pagamento: "MP05", oggetto: "Ristrutturazione bagno", ...extra });

// Validazione con lo schema ufficiale FatturaPA 1.2.2 (serve Python con lxml).
const xsdAvailable = spawnSync("python", ["-c", "import lxml"]).status === 0;
function validateXsd(xml) {
  const r = spawnSync("python", [path.resolve(__dirname, "fixtures/validate_xsd.py")], { input: xml });
  return { ok: r.status === 0, errors: String(r.stdout) + String(r.stderr) };
}

describe("calcoli IVA", () => {
  it("riga con sconto e arrotondamento al centesimo", () => {
    expect(lineTotal({ quantita: 3, prezzo_unitario: 33.333 })).toBe(100);
    expect(lineTotal({ quantita: 2, prezzo_unitario: 50, sconto: 10 })).toBe(90);
  });

  it("aliquota ordinaria 22%", () => {
    const c = computeInvoice(base([riga(100, { quantita: 2 }), riga(50, { sconto: 10 })]));
    expect(c.imponibile).toBe(245);
    expect(c.iva).toBe(53.9);
    expect(c.totale).toBe(298.9);
    expect(c.bollo).toBe(0);
  });

  it("aliquote miste 22% e 10%, riepilogo separato", () => {
    const c = computeInvoice(base([riga(1000, { aliquota_key: "10" }), riga(200, { aliquota_key: "22" })]));
    expect(c.riepilogo.map((g) => [g.key, g.imponibile, g.imposta])).toEqual([["10", 1000, 100], ["22", 200, 44]]);
    expect(c.totale).toBe(1344);
  });

  it("reverse charge edile: niente IVA e niente bollo", () => {
    const c = computeInvoice(base([riga(5000, { aliquota_key: "N6.7" })]));
    expect(c.iva).toBe(0);
    expect(c.bollo).toBe(0);
    expect(c.totale).toBe(5000);
  });

  it("forfettario sopra 77,47 €: bollo da 2 € addebitato", () => {
    const c = computeInvoice(base([riga(100, { aliquota_key: "N2.2" })]));
    expect(c.bollo).toBe(2);
    expect(c.totale).toBe(102);
    expect(computeInvoice(base([riga(100, { aliquota_key: "N2.2" })], { bollo_addebitato: false })).totale).toBe(100);
  });

  it("forfettario fino a 77,47 €: niente bollo", () => {
    expect(computeInvoice(base([riga(77.47, { aliquota_key: "N2.2" })])).bollo).toBe(0);
  });

  it("split payment e ritenuta riducono l'importo da pagare", () => {
    const c = computeInvoice(base([riga(1000)], { split_payment: true, ritenuta_importo: 40 }));
    expect(c.totale).toBe(1220);
    expect(c.daPagare).toBe(960);
  });

  it("le righe vuote vengono ignorate", () => {
    expect(computeInvoice(base([riga(100), { descrizione: "", prezzo_unitario: 0 }])).righe).toHaveLength(1);
  });
});

describe("aliquote e nature", () => {
  it("elenco completo delle nature dello SdI, senza quelle generiche dismesse", () => {
    const nature = new Set(ALIQUOTE.map((a) => a.natura).filter(Boolean));
    for (const n of ["N1", "N2.1", "N2.2", "N3.1", "N3.2", "N3.3", "N3.4", "N3.5", "N3.6", "N4", "N5", "N6.1", "N6.2", "N6.3", "N6.4", "N6.5", "N6.6", "N6.7", "N6.8", "N6.9", "N7"]) expect(nature.has(n)).toBe(true);
    expect(nature.has("N2") || nature.has("N3") || nature.has("N6")).toBe(false);
    expect(ALIQUOTE.every((a) => a.natura ? a.rif : true)).toBe(true);
  });
  it("una sola riga di riepilogo per natura", () => {
    const c = computeInvoice(base([riga(50, { aliquota_key: "N2.2" }), riga(30, { aliquota_key: "N2.2-altri" })]));
    expect(c.riepilogo).toHaveLength(1);
    expect(c.riepilogo[0].imponibile).toBe(80);
  });
});

describe("numerazione", () => {
  const list = [
    { numero: "1/2026", anno: 2026, tipo_documento: "TD01" },
    { numero: "7/2026", anno: 2026, tipo_documento: "TD01" },
    { numero: "NC1/2026", anno: 2026, tipo_documento: "TD04" },
    { numero: "30/2025", anno: 2025, tipo_documento: "TD01" },
  ];
  it("prosegue dall'ultimo numero dell'anno", () => expect(nextNumber(list, 2026)).toBe("8/2026"));
  it("ricomincia da 1 nel nuovo anno", () => expect(nextNumber(list, 2027)).toBe("1/2027"));
  it("note di credito con numerazione separata", () => expect(nextNumber(list, 2026, "TD04")).toBe("NC2/2026"));
});

describe("controlli prima dell'esportazione", () => {
  it("fattura completa: nessun errore", () => {
    expect(validateInvoice(base([riga(100)]), profile, azienda)).toEqual([]);
  });
  it("segnala i dati mancanti", () => {
    const e = validateInvoice({ righe: [] }, {}, null);
    expect(e).toEqual(expect.arrayContaining([
      expect.stringMatching(/Partita IVA dell'impresa/), expect.stringMatching(/Numero/), expect.stringMatching(/Cliente non selezionato/), expect.stringMatching(/Nessuna riga/),
    ]));
  });
  it("reverse charge verso un privato non è ammesso", () => {
    expect(validateInvoice(base([riga(100, { aliquota_key: "N6.3" })]), profile, privato).join()).toMatch(/reverse charge/);
  });
  it("forfettario con IVA non è ammesso", () => {
    expect(validateInvoice(base([riga(100)], { regime: "RF19" }), profile, azienda).join()).toMatch(/forfettario/);
  });
  it("cliente con P.IVA senza SDI né PEC", () => {
    expect(validateInvoice(base([riga(100)]), profile, { ...azienda, codice_sdi: "" }).join()).toMatch(/SDI o la PEC/);
  });
});

describe("file XML FatturaPA", () => {
  const cases = {
    "azienda, aliquote miste": [base([riga(1000, { aliquota_key: "10" }), riga(200, { quantita: 2.5, sconto: 5 })]), profile, azienda],
    "privato con codice fiscale": [base([riga(350)]), profile, privato],
    "pubblica amministrazione (FPA12) con split payment": [base([riga(1000)], { split_payment: true }), profile, pa],
    "reverse charge edile": [base([riga(5000, { aliquota_key: "N6.3" })]), profile, azienda],
    "forfettario con bollo": [base([riga(500, { aliquota_key: "N2.2" })], { regime: "RF19" }), { ...profile, regime_fiscale: "RF19" }, privato],
    "nota di credito collegata": [base([riga(100)], { tipo_documento: "TD04", numero: "NC1/2026", fattura_collegata: "7/2026" }), profile, azienda],
    "tutte le aliquote e nature IVA": [base(ALIQUOTE.map((a) => riga(100, { aliquota_key: a.key, descrizione: a.label })), { oggetto: "Prova nature" }), profile, azienda],
    "caratteri speciali e testo lungo": [base([riga(10, { descrizione: "Posa \"piastrelle\" <60x60> & fughe – “extra” 🧱" })], { oggetto: "x".repeat(450) }), profile, azienda],
  };

  it("nome file e progressivo nel formato dello SdI", () => {
    const { fileName, progressivo } = buildFatturaXml(...cases["azienda, aliquote miste"]);
    expect(progressivo).toMatch(/^[A-Z0-9]{5}$/);
    expect(fileName).toBe(`IT01234567897_${progressivo}.xml`);
  });

  it("formato e destinatario corretti", () => {
    expect(buildFatturaXml(...cases["pubblica amministrazione (FPA12) con split payment"]).xml).toMatch(/<FormatoTrasmissione>FPA12<\/FormatoTrasmissione><CodiceDestinatario>UFABCD</);
    expect(buildFatturaXml(...cases["privato con codice fiscale"]).xml).toMatch(/<CodiceDestinatario>0000000</);
    expect(buildFatturaXml(...cases["privato con codice fiscale"]).xml).toMatch(/<Nome>Mario<\/Nome><Cognome>Rossi<\/Cognome>/);
  });

  it("importi coerenti con i calcoli", () => {
    const { xml } = buildFatturaXml(...cases["forfettario con bollo"]);
    expect(xml).toMatch(/<ImportoBollo>2.00<\/ImportoBollo>/);
    expect(xml).toMatch(/<ImportoTotaleDocumento>502.00</);
    expect(xml).toMatch(/<Natura>N2.2<\/Natura>/);
    expect(buildFatturaXml(...cases["pubblica amministrazione (FPA12) con split payment"]).xml).toMatch(/<EsigibilitaIVA>S</);
  });

  it("toglie caratteri non ammessi e fa l'escape", () => {
    const { xml } = buildFatturaXml(...cases["caratteri speciali e testo lungo"]);
    expect(xml).toContain("Posa &quot;piastrelle&quot; &lt;60x60&gt; &amp; fughe - &quot;extra&quot;");
    expect(xml).not.toMatch(/🧱/);
    expect(xml.match(/<Causale>/g)).toHaveLength(3);
  });

  for (const [name, args] of Object.entries(cases)) {
    it.skipIf(!xsdAvailable)(`valido per lo schema ufficiale: ${name}`, () => {
      const r = validateXsd(buildFatturaXml(...args).xml);
      expect(r.errors).toBe("");
      expect(r.ok).toBe(true);
    });
  }
});
