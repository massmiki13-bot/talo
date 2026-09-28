// Timbrature dal telefono: invio (anche offline), abbinamento entrata/uscita e ore per il foglio presenze.
import { api, db } from "@/lib/db";
import { dayEntries, saveDay } from "@/lib/attendance";

export const DEFAULT_SETTINGS = { gps: false, pausa_minuti: 60, pausa_oltre_ore: 6, raggio_m: 300 };
export const settingsOf = (profile) => ({ ...DEFAULT_SETTINGS, ...(profile?.timbrature || {}) });

const QUEUE_KEY = "talo.timbrature.coda";
const readQueue = () => { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; } };
const writeQueue = (q) => { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* ignore */ } };
export const pendingPunches = () => readQueue();

/** Posizione attuale (massimo 12 secondi di attesa); null se negata o non disponibile. */
export function currentPosition() {
  if (!("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  });
}

const send = (p) => api.clock.punch(p);
const isNetworkError = (e) => /failed to fetch|networkerror|load failed|network request/i.test(String(e?.message || e));

/**
 * Timbra. Se la rete non c'è, la timbratura resta in coda sul telefono con la sua ora reale
 * e parte da sola appena torna la connessione (vedi flushPunches).
 */
export async function punch({ tipo, worksiteId, note, gps }) {
  const pos = gps ? await currentPosition() : null;
  const item = {
    tipo, worksite: worksiteId || null, note: note || null,
    lat: pos?.lat ?? null, lng: pos?.lng ?? null, accuracy: pos?.accuracy ?? null,
    client_time: new Date().toISOString(), client_id: crypto.randomUUID(),
  };
  if (!navigator.onLine) { writeQueue([...readQueue(), item]); return { queued: true, item, position: !!pos }; }
  try {
    return { event: await send(item), position: !!pos };
  } catch (e) {
    // errore di rete: in coda; errore del server (permessi, dati): lo mostriamo
    if (!isNetworkError(e)) throw e;
    writeQueue([...readQueue(), item]);
    return { queued: true, item, position: !!pos };
  }
}

/** Invia le timbrature rimaste in coda; restituisce quante sono partite. */
let flushing = false;
export async function flushPunches() {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const item of readQueue()) {
      try {
        await send(item);
        sent++;
        writeQueue(readQueue().filter((x) => x.client_id !== item.client_id));
      } catch (e) {
        // dopo 48 ore il server la rifiuta: la togliamo per non bloccare la coda
        if (isNetworkError(e)) break;
        writeQueue(readQueue().filter((x) => x.client_id !== item.client_id));
      }
    }
  } finally { flushing = false; }
  return sent;
}

const round15 = (h) => Math.round(h * 4) / 4;

/**
 * Raggruppa le timbrature per dipendente e giorno: intervalli entrata→uscita, ore e anomalie.
 * La pausa (pausa_minuti) si toglie una volta al giorno se c'è un intervallo continuo oltre pausa_oltre_ore.
 */
export function summarize(events, settings = DEFAULT_SETTINGS) {
  const groups = {};
  for (const e of events) (groups[`${e.dipendente_id}|${e.data}`] ||= []).push(e);
  return Object.values(groups).map((list) => {
    const ev = [...list].sort((a, b) => a.at.localeCompare(b.at));
    const intervals = [];
    const issues = [];
    let open = null;
    for (const e of ev) {
      if (e.tipo === "entrata") {
        if (open) issues.push("entrata senza uscita");
        open = e;
      } else if (open) {
        intervals.push({ from: open, to: e, ore: (new Date(e.at) - new Date(open.at)) / 3_600_000 });
        open = null;
      } else issues.push("uscita senza entrata");
    }
    if (open) issues.push("manca l'uscita");
    const longest = Math.max(0, ...intervals.map((i) => i.ore));
    const pausa = longest > settings.pausa_oltre_ore ? settings.pausa_minuti / 60 : 0;
    const bySite = {};
    for (const i of intervals) {
      const k = i.from.worksite_id || "";
      (bySite[k] ||= { cantiere_id: k, cantiere_nome: i.from.worksite_nome || "", ore: 0 }).ore += i.ore;
    }
    // la pausa si toglie dal cantiere con più ore
    const sites = Object.values(bySite).sort((a, b) => b.ore - a.ore);
    if (sites[0]) sites[0].ore = Math.max(0, sites[0].ore - pausa);
    for (const s of sites) s.ore = round15(s.ore);
    const far = ev.filter((e) => e.distanza_m != null && e.distanza_m > settings.raggio_m);
    return {
      key: `${ev[0].dipendente_id}|${ev[0].data}`, dipendente_id: ev[0].dipendente_id, dipendente_nome: ev[0].dipendente_nome, data: ev[0].data,
      events: ev, intervals, cantieri: sites, ore: round15(sites.reduce((s, x) => s + x.ore, 0)), pausa, issues,
      lontano: far.length > 0, confermata: ev.every((e) => e.stato === "confermata"),
    };
  }).sort((a, b) => a.dipendente_nome.localeCompare(b.dipendente_nome));
}

/** Porta le giornate timbrate nel foglio presenze (senza toccare gli altri dipendenti) e le segna confermate. */
export async function confirmDay(date, rows, existingRecords) {
  const map = dayEntries(existingRecords, date);
  for (const r of rows) {
    map[r.dipendente_id] = {
      dipendente_id: r.dipendente_id, dipendente_nome: r.dipendente_nome, stato: "presente",
      note: map[r.dipendente_id]?.note || "", cantieri: r.cantieri.filter((c) => c.ore > 0).map((c) => ({ ...c })),
    };
  }
  await saveDay(db, date, Object.values(map), existingRecords.filter((x) => x.data === date));
  const ids = rows.flatMap((r) => r.events.map((e) => e.id));
  await db.ClockEvent.bulkUpdate(ids.map((id) => ({ id, stato: "confermata" })));
}

export const fmtTime = (iso) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
