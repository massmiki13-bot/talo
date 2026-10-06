import { db } from "@/lib/db";

/**
 * Returns the expiration status of a document based on its scadenza date.
 * Handles null, undefined, empty string, and invalid dates safely.
 *
 * @param {string|null|undefined} date - YYYY-MM-DD date string (or null/empty)
 * @returns {"expired"|"expiring_soon"|null} - null when no valid date is set
 */
export function getExpirationStatus(date) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  const today = new Date(new Date().toDateString());
  const diffDays = (+d - +today) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return "expired";
  if (diffDays <= 30) return "expiring_soon";
  return null;
}

/**
 * Creates reminder(s) for a document with an expiration date.
 * Format: "Visita Medica – Alexandru Badan – scade il 15/03/2027"
 *
 * @param {string} docTitle
 * @param {string} scadenzaDate - YYYY-MM-DD
 * @param {string} docId
 * @param {string} docType
 * @param {string} docTypeLabel
 * @param {string} personName
 * @param {number} anticipoDays - days before deadline for pre-notification (0 = none)
 * @param {string} ripetizione - "nessuna" | "giornaliera" | "settimanale" | "mensile"
 * @returns {Promise<object|null>} - { titolo, scadenza } or null
 */
export async function createDocumentReminder(docTitle, scadenzaDate, docId, docType, docTypeLabel, personName, anticipoDays = 0, ripetizione = "nessuna") {
  if (!scadenzaDate) return null;

  const scadenza = new Date(scadenzaDate);
  const scadenzaStr = scadenza.toLocaleDateString("it-IT");
  const tipoLabel = docTypeLabel || "Documento";
  const personaLabel = personName ? ` – ${personName}` : "";

  const titolo = `${tipoLabel}${personaLabel} – scade il ${scadenzaStr}`;
  const descrizione = `Documento: ${docTitle}${personName ? `\nIntestatario: ${personName}` : ""}\nTipo: ${tipoLabel}\nScade il: ${scadenzaStr}`;

  try {
    // Main reminder on the expiration date
    await db.Reminder.create({
      titolo,
      descrizione,
      data: scadenzaDate,
      tipo: "scadenza_documento",
      completato: false,
      riferimento_id: docId,
      riferimento_tipo: docType,
    });

    // Pre-notification(s) based on anticipo and ripetizione
    if (anticipoDays > 0) {
      const anticipoDate = new Date(scadenza);
      anticipoDate.setDate(anticipoDate.getDate() - anticipoDays);
      const oggi = new Date(new Date().toISOString().slice(0, 10));

      if (anticipoDate >= oggi && anticipoDate < scadenza) {
        const anticipoLabel = anticipoDays <= 7 ? "1 settimana"
          : anticipoDays <= 14 ? "2 settimane"
          : anticipoDays <= 30 ? "1 mese"
          : anticipoDays <= 60 ? "2 mesi"
          : "3 mesi";

        if (ripetizione === "nessuna") {
          // Single pre-notification
          await db.Reminder.create({
            titolo: `${tipoLabel}${personaLabel} – scade tra ${anticipoLabel} (${scadenzaStr})`,
            descrizione,
            data: anticipoDate.toISOString().slice(0, 10),
            tipo: "scadenza_documento",
            completato: false,
            is_preavviso: true,
            riferimento_id: docId,
            riferimento_tipo: docType,
          });
        } else {
          // Recurring pre-notifications from anticipoDate to scadenza
          const step = ripetizione === "giornaliera" ? 1
            : ripetizione === "settimanale" ? 7
            : 30; // mensile
          const remindersToCreate = [];
          let d = new Date(anticipoDate);
          let count = 0;
          while (d < scadenza && count < 100) {
            if (d >= oggi) {
              remindersToCreate.push({
                titolo: `${tipoLabel}${personaLabel} – scade tra ${anticipoLabel} (${scadenzaStr})`,
                descrizione,
                data: d.toISOString().slice(0, 10),
                tipo: "scadenza_documento",
                completato: false,
                is_preavviso: true,
                riferimento_id: docId,
                riferimento_tipo: docType,
              });
            }
            d.setDate(d.getDate() + step);
            count++;
          }
          if (remindersToCreate.length > 0) {
            await db.Reminder.bulkCreate(remindersToCreate);
          }
        }
      }
    }

    return { titolo, scadenza: scadenzaStr };
  } catch (e) {
    console.error("Errore creazione promemoria:", e);
    return null;
  }
}

export async function deleteRemindersForDoc(docId) {
  if (!docId) return;
  try {
    const existing = await db.Reminder.filter({ riferimento_id: docId });
    for (const r of existing) {
      await db.Reminder.delete(r.id);
    }
  } catch (e) { console.error(e); }
}