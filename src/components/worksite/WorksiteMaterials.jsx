import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Package, FileText } from "lucide-react";
import { DetailCard } from "@/components/shared/DetailLayout";
import DdtDialog from "@/components/worksite/DdtDialog";
import { materialsOf } from "@/lib/ddt";

const eur = (v) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(Number(v) || 0);
const fmt = (d) => (d ? new Date(d).toLocaleDateString("it-IT") : "");
const qty = (v) => (Math.round(v * 100) / 100).toLocaleString("it-IT");

// Materiali arrivati in cantiere dalle bolle, con il registro dei DDT.
export default function WorksiteMaterials({ worksite, transactions, allWorksites, readOnly, onChanged }) {
  const [open, setOpen] = useState(false);
  const ddts = useMemo(() => transactions.filter((t) => t.ddt).sort((a, b) => String(b.data).localeCompare(String(a.data))), [transactions]);
  const mats = useMemo(() => materialsOf(ddts), [ddts]);

  return (
    <div className="space-y-4">
      <DetailCard icon={Package} title={`Materiali in cantiere (${mats.length})`} action={!readOnly && <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5 bg-brand-600 hover:bg-brand-700"><Camera className="w-4 h-4" />Carica bolla</Button>}>
        {mats.length === 0 ? (
          <p className="text-sm text-zinc-500 py-4 text-center">Fotografa le bolle di consegna: l'IA registra i materiali e li somma per cantiere.</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-zinc-500 border-b border-zinc-100"><th className="py-2 px-1 font-medium">Materiale</th><th className="py-2 px-1 font-medium text-right">Quantità</th><th className="py-2 px-1 font-medium text-right">Spesa</th><th className="py-2 px-1 font-medium hidden sm:table-cell">Fornitori</th><th className="py-2 px-1 font-medium text-right hidden sm:table-cell">Ultima consegna</th></tr></thead>
              <tbody className="divide-y divide-zinc-100">
                {mats.map((m) => (
                  <tr key={`${m.descrizione}|${m.unita}`}>
                    <td className="py-2 px-1 text-zinc-900">{m.descrizione}</td>
                    <td className="py-2 px-1 text-right tabular-nums whitespace-nowrap">{qty(m.quantita)} {m.unita}</td>
                    <td className="py-2 px-1 text-right tabular-nums">{m.importo ? eur(m.importo) : "—"}</td>
                    <td className="py-2 px-1 text-zinc-600 hidden sm:table-cell">{m.fornitori.join(", ")}</td>
                    <td className="py-2 px-1 text-right text-zinc-600 tabular-nums hidden sm:table-cell">{fmt(m.ultima)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DetailCard>

      {ddts.length > 0 && (
        <DetailCard icon={FileText} title={`Registro DDT (${ddts.length})`}>
          <ul className="divide-y divide-zinc-100 -my-2">
            {ddts.map((t) => (
              <li key={t.id} className="py-2.5 flex items-center gap-3 text-sm">
                <span className="tabular-nums text-zinc-500 w-24 shrink-0">{fmt(t.data)}</span>
                <span className="flex-1 min-w-0 truncate">{t.fornitore || "Fornitore"}{t.ddt?.numero ? <span className="text-zinc-500"> · n. {t.ddt.numero}</span> : null}<span className="text-zinc-500"> · {t.ddt?.righe?.length || 0} righe</span></span>
                <span className="tabular-nums">{t.importo ? eur(t.importo) : ""}</span>
                {t.file_url && <a href={t.file_url} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline shrink-0">Apri</a>}
              </li>
            ))}
          </ul>
        </DetailCard>
      )}
      <DdtDialog open={open} onOpenChange={setOpen} worksites={allWorksites} defaultWorksiteId={worksite.id} onSaved={onChanged} />
    </div>
  );
}
