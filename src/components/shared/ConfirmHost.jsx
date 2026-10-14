import React, { useEffect, useState } from "react";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";

// Conferme nello stile di Talo al posto di window.confirm():
//   if (!(await confirmDialog("Eliminare questa foto?"))) return;
// Il testo è la domanda; il pulsante di conferma diventa rosso per le azioni che cancellano o revocano.
let show = null;
const DESTRUCTIVE = /^(eliminare|elimina|rimuovere|revocare|annullare|togliere|disattivare)\b/i;

export function confirmDialog(message, { confirmLabel, cancelLabel = "Annulla", destructive } = {}) {
  // Senza host montato (non dovrebbe succedere) si ricade sulla conferma del browser.
  if (!show) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => show({ message: String(message), confirmLabel, cancelLabel, destructive: destructive ?? DESTRUCTIVE.test(String(message).trim()), resolve }));
}

export default function ConfirmHost() {
  const [req, setReq] = useState(null);
  useEffect(() => { show = setReq; return () => { show = null; }; }, []);
  const close = (answer) => { req?.resolve(answer); setReq(null); };
  const [title, ...rest] = (req?.message || "").split("\n\n");
  return (
    <AlertDialog open={!!req} onOpenChange={(o) => { if (!o) close(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base leading-snug">{title}</AlertDialogTitle>
          <AlertDialogDescription className={rest.length ? "whitespace-pre-line" : "sr-only"}>{rest.length ? rest.join("\n\n") : "Conferma o annulla l'operazione."}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>{req?.cancelLabel}</AlertDialogCancel>
          <AlertDialogAction onClick={() => close(true)} className={req?.destructive ? "bg-red-600 hover:bg-red-700 text-white" : "bg-brand-600 hover:bg-brand-700 text-white"}>
            {req?.confirmLabel || (req?.destructive ? "Sì, procedi" : "Conferma")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
