import { describe, it, expect } from "vitest";
import { splitQuote, describeLinks } from "@/lib/emailAi";

describe("assistente email", () => {
  it("separa il testo nuovo dalla citazione della risposta", () => {
    const r = splitQuote("<p>Grazie</p><p><br></p><p>Il 12/10/2026 10:00, Mario Bianchi ha scritto:</p><blockquote><p>Domanda</p></blockquote>");
    expect(r.own).toBe("<p>Grazie</p><p><br></p>");
    expect(r.quote.startsWith("<p>Il 12/10/2026")).toBe(true);
    expect(splitQuote("<p>Solo testo</p>")).toEqual({ own: "<p>Solo testo</p>", quote: "" });
  });
  it("descrive cliente, lavoro e preventivo collegati", () => {
    const t = describeLinks({ contact: { nome: "Mario Bianchi" }, quote: { numero: "PREV-1", totale: 1200 } });
    expect(t).toContain("Mario Bianchi");
    expect(t).toMatch(/PREV-1.*1\.?200,00/); // in italiano 1200 può non avere il punto delle migliaia
    expect(describeLinks()).toBe("");
  });
});
