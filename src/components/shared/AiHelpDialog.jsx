import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, FilePlus, FolderTree, Mail, FileText, Bell, ScanLine } from "lucide-react";

const capabilities = [
  { icon: FileText, title: "Scrivere voci di preventivo", desc: "Descrivi una voce in modo semplice e l'IA la riscrive in linguaggio tecnico edile professionale, suggerendo anche l'unità di misura." },
  { icon: Mail, title: "Scrivere e formalizzare email", desc: "Scrivi uno spunto (es. \"invio il preventivo, chiedo conferma\") e l'IA compone un'email completa e formale. La firma con i dati della ditta viene aggiunta automaticamente." },
  { icon: Search, title: "Cercare documenti", desc: "Cerca documenti in linguaggio naturale: \"trova la visita medica di Mario Rossi\" o \"mostrami i DURC in scadenza\"." },
  { icon: ScanLine, title: "Leggere documenti", desc: "L'IA legge il contenuto dei documenti caricati (PDF, immagini) ed estrae dati e date di scadenza. Puoi sempre verificare e correggere i dati estratti." },
  { icon: Bell, title: "Notifiche di scadenza", desc: "Quando un documento ha una scadenza, l'IA imposta automaticamente i promemoria. Puoi personalizzare quanto tempo prima essere avvisato." },
  { icon: FolderTree, title: "Riordinare documenti", desc: "L'IA suggerisce come classificare i documenti, a quale dipendente associarli e segnala documenti senza scadenza o incompleti." },
  { icon: FilePlus, title: "Creare documenti e contratti", desc: "Chiedi all'IA di creare un documento descrivendo cosa ti serve (es. \"mi serve un contratto d'appalto\"). L'IA ti chiede i dati necessari e genera il documento con intestazione e firma della ditta." },
];

export default function AiHelpDialog({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cosa può fare l'Assistente IA</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-4">
          {capabilities.map((c, i) => (
            <div key={i} className="flex gap-3 p-3 bg-slate-50 rounded-lg">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <c.icon className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{c.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{c.desc}</p>
              </div>
            </div>
          ))}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 mt-3">
            <strong>Importante:</strong> tutto ciò che l'IA produce va sempre verificato da una persona prima di essere considerato definitivo. L'IA può commettere errori, soprattutto nella lettura di documenti scansionati.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}