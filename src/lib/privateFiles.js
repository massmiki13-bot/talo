// File privati nell'interfaccia: i link <a href="…private…"> vengono aperti con un link firmato a scadenza,
// e le anteprime (<img>, <iframe>) usano useFileUrl. Così nessuna pagina deve gestire i permessi a mano.
import { useEffect, useState } from "react";
import { files } from "@/api/client";

const UNSAFE_HREF = /^[\s\u0000-\u001f]*(javascript|data|vbscript):/i;

export function installPrivateLinkHandler() {
  const w = /** @type {any} */ (window);
  if (typeof document === "undefined" || w.__taloPrivateLinks) return;
  w.__taloPrivateLinks = true;
  // I link che arrivano dai dati (allegati, foto, documenti) non devono mai eseguire codice.
  const blockUnsafe = (e) => {
    const a = /** @type {any} */ (e.target)?.closest?.("a[href]");
    if (a && UNSAFE_HREF.test(a.getAttribute("href") || "")) { e.preventDefault(); e.stopPropagation(); }
  };
  document.addEventListener("click", blockUnsafe, true);
  document.addEventListener("auxclick", blockUnsafe, true);
  document.addEventListener("click", (e) => {
    const a = /** @type {any} */ (e.target)?.closest?.("a[href]");
    if (!a || !files.isPrivate(a.getAttribute("href"))) return;
    e.preventDefault();
    e.stopPropagation();
    const url = a.getAttribute("href");
    const download = a.hasAttribute("download") ? a.getAttribute("download") || "documento" : null;
    // la finestra va aperta subito (nel clic), altrimenti il browser la blocca
    const win = download ? null : window.open("about:blank", "_blank");
    files.signed(url, download ? { download } : {}).then((signed) => {
      if (win) win.location.href = signed;
      else { const x = document.createElement("a"); x.href = signed; x.rel = "noopener"; document.body.appendChild(x); x.click(); x.remove(); }
    }).catch(() => {
      if (win) win.close();
      window.alert("Non hai accesso a questo file o il file non esiste più.");
    });
  }, true);
}

/** Indirizzo utilizzabile per <img>/<iframe>: firmato se il file è privato. */
export function useFileUrl(url) {
  const [out, setOut] = useState(() => (files.isPrivate(url) ? null : url || null));
  useEffect(() => {
    let alive = true;
    if (!files.isPrivate(url)) { setOut(url || null); return undefined; }
    setOut(null);
    files.signed(url).then((s) => alive && setOut(s)).catch(() => alive && setOut(null));
    return () => { alive = false; };
  }, [url]);
  return out;
}

/** Indirizzi firmati per molte miniature insieme (una sola richiesta). */
export function useFileUrls(urls) {
  const key = (urls || []).filter(Boolean).join("|");
  const [map, setMap] = useState({});
  useEffect(() => {
    let alive = true;
    const list = (urls || []).filter(Boolean);
    if (!list.some((u) => files.isPrivate(u))) { setMap(Object.fromEntries(list.map((u) => [u, u]))); return undefined; }
    files.signedMany(list).then((m) => alive && setMap(m)).catch(() => {});
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return map;
}
