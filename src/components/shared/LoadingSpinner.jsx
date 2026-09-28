import React from "react";
import { TaloMark } from "@/components/brand/TaloLogo";

export default function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3" role="status" aria-label="Caricamento">
      <div className="relative">
        <TaloMark size={40} className="animate-pulse" />
        <span className="absolute -inset-2 rounded-2xl border-2 border-transparent border-t-brand-600 animate-spin" />
      </div>
    </div>
  );
}
