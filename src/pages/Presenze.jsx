import React, { useState } from "react";
import { CalendarDays, BarChart3 } from "lucide-react";
import DailyAttendance from "@/pages/DailyAttendance";
import MonthlyHours from "@/pages/MonthlyHours";

export default function Presenze() {
  const urlParams = new URLSearchParams(window.location.search);
  const [tab, setTab] = useState(urlParams.get("tab") === "riepilogo" ? "riepilogo" : "inserimento");

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900 mb-3">Presenze</h1>
        <div className="bg-white rounded-xl border border-slate-200 p-1.5 inline-flex gap-1 shadow-sm">
          <button
            onClick={() => setTab("inserimento")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "inserimento" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <CalendarDays className="w-4 h-4" /> Inserimento
          </button>
          <button
            onClick={() => setTab("riepilogo")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "riepilogo" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <BarChart3 className="w-4 h-4" /> Riepilogo mensile
          </button>
        </div>
      </div>

      {tab === "inserimento" && <DailyAttendance />}
      {tab === "riepilogo" && <MonthlyHours />}
    </div>
  );
}