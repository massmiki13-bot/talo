import { describe, it, expect } from "vitest";
import { privatePath, isStoredFileUrl, fetchStoredFile } from "../api/_lib/files.js";

// L'host di Supabase viene da .env.local (caricato dalla configurazione di Vite).
const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const hasEnv = !!base;

describe.skipIf(!hasEnv)("archivio privato", () => {
  const tenant = "11111111-2222-3333-4444-555555555555";
  const priv = `${base}/storage/v1/object/authenticated/private/${tenant}/abc-contratto%20firmato.pdf`;

  it("riconosce i percorsi privati", () => {
    expect(privatePath(priv)).toBe(`${tenant}/abc-contratto firmato.pdf`);
    expect(privatePath(`${base}/storage/v1/object/public/uploads/x.pdf`)).toBeNull();
    expect(privatePath(`https://evil.example.com/storage/v1/object/authenticated/private/${tenant}/x.pdf`)).toBeNull();
    expect(privatePath("non è un url")).toBeNull();
  });

  it("accetta solo file dell'archivio di Talo (niente SSRF)", () => {
    expect(isStoredFileUrl(`${base}/storage/v1/object/public/uploads/x.pdf`)).toBe(true);
    expect(isStoredFileUrl("https://example.com/x.pdf")).toBe(false);
    expect(isStoredFileUrl("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isStoredFileUrl(`${base.replace("https:", "http:")}/storage/v1/object/public/uploads/x.pdf`)).toBe(false);
  });

  it("un'azienda non può scaricare i file privati di un'altra", async () => {
    await expect(fetchStoredFile(priv, "99999999-0000-0000-0000-000000000000")).rejects.toMatchObject({ status: 403 });
    await expect(fetchStoredFile(priv, null)).rejects.toMatchObject({ status: 403 });
  });

  it("URL esterni ignorati senza scaricarli", async () => {
    expect(await fetchStoredFile("https://example.com/x.pdf", tenant)).toBeNull();
  });
});
