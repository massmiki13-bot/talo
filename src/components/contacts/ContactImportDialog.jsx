import React from "react";
import ExcelImportDialog from "@/components/shared/ExcelImportDialog";

// Importazione di clienti e fornitori da Excel o CSV.
export default function ContactImportDialog({ open, onOpenChange, existing = [], onDone }) {
  return <ExcelImportDialog kind="contatti" open={open} onOpenChange={onOpenChange} existing={existing} onDone={onDone} />;
}
