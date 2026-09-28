// Modifiche fatte senza rete (giornaliera e foto di cantiere): si salvano sul telefono
// e partono da sole appena torna la connessione, solo per l'utente che le ha fatte.
import { api, db } from "@/lib/db";
import { supabase } from "@/api/client";
import { saveDay } from "@/lib/attendance";
import { enqueue, queueAll, dequeue, isNetworkError } from "@/lib/offlineStore";
import { flushPunches } from "@/lib/timbrature";

const currentUid = async () => (await supabase.auth.getSession()).data?.session?.user?.id || null;

export async function queueAttendance(date, entries) {
  return enqueue({ kind: "attendance", uid: await currentUid(), date, entries });
}

export async function queuePhoto({ file, worksite_id, fase, didascalia, data }) {
  return enqueue({ kind: "photo", uid: await currentUid(), blob: file, name: file.name || "foto.jpg", type: file.type || "image/jpeg", worksite_id, fase, didascalia, data });
}

export async function pendingFor(kind, match = () => true) {
  const uid = await currentUid();
  return (await queueAll()).filter((x) => x.kind === kind && x.uid === uid && match(x));
}

async function run(item) {
  if (item.kind === "attendance") {
    const existing = await db.DailyAttendance.filter({ data: item.date }, "-data", 500);
    await saveDay(db, item.date, item.entries, existing);
  } else if (item.kind === "photo") {
    const file = new File([item.blob], item.name, { type: item.type });
    const { file_url } = await api.integrations.Core.UploadFile({ file });
    await db.WorksitePhoto.create({ worksite_id: item.worksite_id, foto_url: file_url, fase: item.fase, didascalia: item.didascalia || "", data: item.data });
  }
}

let running = false;
/** Invia tutto ciò che è in coda. Restituisce { sent, failed }. */
export async function flushQueue() {
  if (running || !navigator.onLine) return { sent: 0, failed: 0 };
  running = true;
  let sent = 0, failed = 0;
  try {
    sent += await flushPunches();
    const uid = await currentUid();
    if (!uid) return { sent, failed };
    for (const item of await queueAll()) {
      if (item.uid !== uid || item.error) continue;
      try {
        await run(item);
        await dequeue(item.id);
        sent++;
      } catch (e) {
        if (isNetworkError(e)) break; // la rete è caduta di nuovo: si riprova dopo
        failed++;
        // errore permanente (permessi, dati): resta in coda, viene mostrato nella barra offline
        const { id, ...rest } = item;
        await dequeue(id);
        await enqueue({ ...rest, error: e.message || "Errore" });
      }
    }
  } finally { running = false; }
  return { sent, failed };
}
