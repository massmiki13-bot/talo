import React from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function PageHeader({ title, subtitle, actionLabel, onAction, actionIcon, children }) {
  const Icon = actionIcon || Plus;
  return (
    <div className="mb-4 sm:mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
          {subtitle && <p className="text-slate-500 mt-1 text-sm">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {children}
          {actionLabel && (
            <Button onClick={onAction} className="bg-blue-600 hover:bg-blue-700 gap-2 w-full sm:w-auto">
              <Icon className="w-4 h-4" />
              {actionLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}