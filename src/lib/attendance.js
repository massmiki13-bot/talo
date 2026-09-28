// Presenze: giornata per dipendente, festività italiane e salvataggio nel formato DailyAttendance
// (un record per data e cantiere, con l'elenco dei dipendenti).

export const GENERAL = "__nessun_cantiere__";
export const STD_HOURS = 8;

export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const parseIso = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseIso(s); d.setDate(d.getDate() + n); return iso(d); };

function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}

const holidayCache = {};
export function holidaysOf(y) {
  if (holidayCache[y]) return holidayCache[y];
  const fixed = { "01-01": "Capodanno", "01-06": "Epifania", "04-25": "Festa della Liberazione", "05-01": "Festa dei lavoratori", "06-02": "Festa della Repubblica", "08-15": "Ferragosto", "11-01": "Ognissanti", "12-08": "Immacolata", "12-25": "Natale", "12-26": "Santo Stefano" };
  const map = Object.fromEntries(Object.entries(fixed).map(([k, v]) => [`${y}-${k}`, v]));
  const e = easter(y);
  map[iso(e)] = "Pasqua";
  const pm = new Date(e); pm.setDate(pm.getDate() + 1);
  map[iso(pm)] = "Lunedì dell'Angelo";
  return (holidayCache[y] = map);
}
export const holidayName = (s) => holidaysOf(Number(String(s).slice(0, 4)))[s] || null;
export const isWorkingDay = (s) => { const w = parseIso(s).getDay(); return w !== 0 && w !== 6 && !holidayName(s); };
export const previousWorkingDay = (s) => { let d = addDays(s, -1); for (let i = 0; i < 10 && !isWorkingDay(d); i++) d = addDays(d, -1); return d; };

// In forza quel giorno: già assunto e non ancora cessato.
export const employedOn = (e, dateStr) =>
  (!e.data_assunzione || e.data_assunzione <= dateStr) &&
  (e.data_cessazione ? e.data_cessazione >= dateStr : (e.stato || "attivo") !== "cessato");

/** Unisce i record di una data in una riga per dipendente. */
export function dayEntries(records, dateStr) {
  const map = {};
  for (const rec of records) {
    if (rec.data !== dateStr) continue;
    const site = rec.cantiere_id && rec.cantiere_id !== GENERAL ? rec.cantiere_id : "";
    for (const p of rec.presenze || []) {
      if (!p.dipendente_id) continue;
      const stato = p.stato || "presente";
      const cur = (map[p.dipendente_id] ||= { dipendente_id: p.dipendente_id, dipendente_nome: p.dipendente_nome || "", stato, note: "", cantieri: [] });
      if (stato === "presente") {
        cur.stato = "presente";
        cur.cantieri.push({ cantiere_id: site, cantiere_nome: site ? rec.cantiere_nome || "" : "", ore: Number(p.ore) || 0 });
      } else if (cur.stato !== "presente") cur.stato = stato;
      if (p.note) cur.note = p.note;
    }
  }
  for (const e of Object.values(map)) e.ore = e.cantieri.reduce((s, c) => s + c.ore, 0);
  return map;
}

/** Converte le righe della giornata nei record da salvare. */
export function toRecords(dateStr, entries) {
  const groups = {};
  const group = (id, nome) => (groups[id] ||= { data: dateStr, cantiere_id: id, cantiere_nome: nome, presenze: [] });
  for (const e of entries) {
    if (!e.dipendente_id || !e.stato) continue;
    const base = { dipendente_id: e.dipendente_id, dipendente_nome: e.dipendente_nome, note: e.note || "" };
    if (e.stato !== "presente") { group(GENERAL, "").presenze.push({ ...base, stato: e.stato, ore: 0 }); continue; }
    const sites = (e.cantieri || []).filter((c) => Number(c.ore) > 0 || c.cantiere_id);
    if (!sites.length) { group(GENERAL, "").presenze.push({ ...base, stato: "presente", ore: 0 }); continue; }
    for (const c of sites) {
      const g = c.cantiere_id ? group(c.cantiere_id, c.cantiere_nome || "") : group(GENERAL, "");
      g.presenze.push({ ...base, stato: "presente", ore: Number(c.ore) || 0 });
    }
  }
  return Object.values(groups).filter((g) => g.presenze.length);
}

/** Salva una giornata: crea i nuovi record prima di cancellare i vecchi (niente perdita dati se qualcosa fallisce). */
export async function saveDay(db, dateStr, entries, existing) {
  const recs = toRecords(dateStr, entries);
  const created = [];
  for (const r of recs) created.push(await db.DailyAttendance.create(r));
  for (const old of existing.filter((x) => x.data === dateStr)) await db.DailyAttendance.delete(old.id);
  return created;
}

export const overtime = (ore, std = STD_HOURS) => Math.max(0, (Number(ore) || 0) - std);
export const fmtH = (h) => (Number.isInteger(h) ? String(h) : h.toFixed(1).replace(".", ","));
