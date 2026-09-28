// Archivio file: pubblico ("uploads", per foto e allegati destinati ai clienti) e privato ("private", documenti sensibili).
// I file privati si aprono solo con link firmati a scadenza, generati dopo aver controllato l'azienda dell'utente.
import { admin, HttpError, supabaseHost } from "./server.js";

const PRIVATE_PREFIX = "/storage/v1/object/authenticated/private/";

export function privatePath(url) {
  try {
    const u = new URL(url);
    if (u.host !== supabaseHost() || !u.pathname.startsWith(PRIVATE_PREFIX)) return null;
    return decodeURIComponent(u.pathname.slice(PRIVATE_PREFIX.length));
  } catch {
    return null;
  }
}

// Allegati e letture IA solo dall'archivio di Talo (niente URL arbitrari: SSRF).
export function isStoredFileUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.host === supabaseHost() && u.pathname.startsWith("/storage/v1/object/");
  } catch {
    return false;
  }
}

/** Scarica un file dell'archivio. Per i file privati verifica che appartengano all'azienda. */
export async function fetchStoredFile(url, tenantId) {
  const path = privatePath(url);
  if (path) {
    if (!tenantId || path.split("/")[0] !== String(tenantId)) throw new HttpError(403, "File non accessibile");
    const { data, error } = await admin().storage.from("private").download(path);
    if (error || !data) return null;
    return { buffer: Buffer.from(await data.arrayBuffer()), contentType: data.type || "" };
  }
  if (!isStoredFileUrl(url)) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  return { buffer: Buffer.from(await res.arrayBuffer()), contentType: (res.headers.get("content-type") || "").split(";")[0].trim() };
}

export async function signPrivateUrl(path, seconds = 600, download = null) {
  const { data, error } = await admin().storage.from("private").createSignedUrl(path, seconds, download ? { download } : undefined);
  if (error || !data?.signedUrl) throw new HttpError(404, "File non trovato");
  return data.signedUrl;
}
