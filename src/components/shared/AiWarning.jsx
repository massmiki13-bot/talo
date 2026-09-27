import React from "react";
import { AlertTriangle } from "lucide-react";

export default function AiWarning({ className }) {
  return (
    <div className={`flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 ${className || ""}`}>
      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
      <span>Verifica sempre i dati: l'IA può commettere errori.</span>
    </div>
  );
}