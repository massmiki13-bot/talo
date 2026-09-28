import React, { useState } from "react";
import { Bell, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { createDocumentReminder, deleteRemindersForDoc } from "@/utils/expirationReminders";

/**
 * Button that creates a reminder for a document with an expiration date.
 * Shows a loading state while creating and a "created" state after success.
 */
export default function CreateReminderButton({ docTitle, scadenzaDate, docId, docType, docTypeLabel, personName, size = "sm" }) {
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const { toast } = useToast();

  const handleClick = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (creating || created) return;

    setCreating(true);
    try {
      // Remove any existing reminders for this doc first (avoid duplicates)
      await deleteRemindersForDoc(docId);
      const reminder = await createDocumentReminder(docTitle, scadenzaDate, docId, docType, docTypeLabel, personName);
      if (reminder) {
        setCreated(true);
        toast({
          title: "✓ Promemoria creato",
          description: `"${reminder.titolo}" aggiunto a Promemoria › Attivi e Calendario.`,
          duration: 6000,
        });
      } else {
        toast({ title: "Errore creazione promemoria", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Errore", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  if (created) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium px-2 py-1 bg-emerald-50 rounded-lg">
        <Check className="w-3.5 h-3.5" /> Promemoria creato
      </span>
    );
  }

  return (
    <Button
      size={size}
      variant="outline"
      onClick={handleClick}
      disabled={creating}
      className="gap-1.5 text-brand-600 border-brand-200 hover:bg-brand-50"
    >
      {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
      Crea promemoria
    </Button>
  );
}