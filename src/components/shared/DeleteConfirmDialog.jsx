import React from "react";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";

/**
 * Reusable confirmation dialog for delete operations.
 *
 * @param {boolean} open
 * @param {() => void} onOpenChange
 * @param {string} title - Dialog title (default: "Elimina preventivo")
 * @param {string} description - Message body (default warning text)
 * @param {string} confirmLabel - Action button label (default: "Elimina")
 * @param {() => void} onConfirm - Called when user confirms
 * @param {boolean} destructive - Whether the action button is destructive (default: true)
 */
export default function DeleteConfirmDialog({
  open,
  onOpenChange,
  title = "Elimina preventivo",
  description = "Sei sicuro di voler eliminare questo preventivo? L'azione non può essere annullata.",
  confirmLabel = "Elimina",
  onConfirm,
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}