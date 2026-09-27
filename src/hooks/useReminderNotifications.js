import { useEffect, useRef } from "react";
import { db } from "@/lib/db";
import { useAuth } from "@/lib/AuthContext";

/**
 * Requests notification permission on first load and shows
 * browser notifications for reminders due today.
 * Also runs a periodic check every 5 minutes while the app is open.
 */
export function useReminderNotifications() {
  const { user } = useAuth();
  const notifiedRef = useRef(new Set());
  const lastDateRef = useRef("");

  useEffect(() => {
    if (!user) return;

    // Request permission on first load
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    const checkReminders = async () => {
      if (!("Notification" in window) || Notification.permission !== "granted") return;

      const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());

      // Reset notified set when date changes
      if (lastDateRef.current && lastDateRef.current !== today) {
        notifiedRef.current = new Set();
      }
      lastDateRef.current = today;

      try {
        const reminders = await db.Reminder.filter({ data: today }, "-created_date", 50);
        const active = reminders.filter(r => !r.completato);

        for (const r of active) {
          if (notifiedRef.current.has(r.id)) continue;
          notifiedRef.current.add(r.id);

          const prefix = r.is_preavviso ? "Avviso scadenza" : "Scadenza oggi";
          new Notification(`${prefix}: ${r.titolo}`, {
            body: r.descrizione || `In data ${today}`,
            tag: r.id,
            icon: "/favicon.ico",
          });
        }
      } catch (e) {
        // Silent fail — notifications are best-effort
      }
    };

    // Check immediately, then every 5 minutes
    const timeoutId = setTimeout(checkReminders, 2000);
    const interval = setInterval(checkReminders, 5 * 60 * 1000);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(interval);
    };
  }, [user]);
}