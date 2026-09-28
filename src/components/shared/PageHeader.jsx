import React from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function PageHeader({ title, subtitle, actionLabel, onAction, actionIcon, children }) {
  const Icon = actionIcon || Plus;
  return (
    <div className="mb-5 sm:mb-7">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="h-7 w-1.5 rounded-full shrink-0" style={{ backgroundImage: "var(--metal-red)" }} />
            <h1 className="font-display text-[28px] sm:text-[34px] leading-none font-bold uppercase tracking-[0.02em] text-zinc-950">{title}</h1>
          </div>
          {subtitle && <p className="text-zinc-500 mt-2.5 text-[15px] leading-relaxed max-w-3xl">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap shrink-0">
          {children}
          {actionLabel && (
            <Button onClick={onAction} className="bg-brand-600 hover:bg-brand-700 gap-2 w-full sm:w-auto h-10 px-5 font-semibold">
              <Icon className="w-4 h-4" />
              {actionLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
