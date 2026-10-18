import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Layers, Plus, ArrowLeft } from "lucide-react";
import { DetailCard } from "@/components/shared/DetailLayout";
import WorksiteForm from "@/components/worksite/WorksiteForm";
import { WORKSITE_STATES, fmtDate } from "@/lib/worksites";
import { fmtEur } from "@/lib/quotes";

/** Lotti di un progetto: elenco con stato, avanzamento e importo, e aggiunta di un nuovo lotto. */
export function WorksiteLots({ worksite, readOnly }) {
  const navigate = useNavigate();
  const [lots, setLots] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  useEffect(() => { db.Worksite.filter({ parent_id: worksite.id }, "created_date", 200).then(setLots).catch(() => setLots([])); }, [worksite.id]);
  if (!lots) return null;
  const tot = lots.reduce((s, l) => s + (Number(l.importo_totale) || 0), 0);
  return (
    <DetailCard icon={Layers} title={`Lotti del progetto · ${lots.length}`}
      action={!readOnly && <Button size="sm" onClick={() => setFormOpen(true)} className="gap-1.5 bg-zinc-950 hover:bg-zinc-800"><Plus className="w-4 h-4" /> Aggiungi lotto</Button>}>
      {lots.length === 0 ? (
        <p className="text-sm text-zinc-500">Nessun lotto ancora. Ogni lotto ha la sua squadra, i suoi costi, incassi e documenti; qui vedi il totale.</p>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {lots.map((l) => {
              const st = WORKSITE_STATES[l.stato] || WORKSITE_STATES.da_iniziare;
              return (
                <Link key={l.id} to={`/lavori/${l.id}`} className="rounded-xl border border-zinc-200 p-3.5 hover:border-brand-300 hover:shadow-sm transition bg-white">
                  <div className="flex items-start gap-2">
                    <p className="font-semibold text-zinc-900 flex-1 min-w-0 truncate">{l.nome}</p>
                    <span className={`text-[11px] font-semibold rounded-full border px-2 py-0.5 shrink-0 ${st.className}`}>{st.label}</span>
                  </div>
                  <div className="mt-2.5 h-1.5 rounded-full bg-zinc-100 overflow-hidden"><div className="h-full bg-brand-600" style={{ width: `${l.avanzamento || 0}%` }} /></div>
                  <p className="text-xs text-zinc-600 mt-2 flex justify-between gap-2"><span>{l.avanzamento || 0}%{l.data_fine_prevista ? ` · fine ${fmtDate(l.data_fine_prevista)}` : ""}</span><span className="tabular-nums font-medium text-zinc-800">{l.importo_totale ? fmtEur(l.importo_totale) : ""}</span></p>
                </Link>
              );
            })}
          </div>
          {tot > 0 && <p className="text-sm text-zinc-700 mt-3 text-right">Totale lotti: <b className="tabular-nums">{fmtEur(tot)}</b></p>}
        </>
      )}
      <WorksiteForm open={formOpen} onOpenChange={setFormOpen}
        defaults={{ parent_id: worksite.id, parent_nome: worksite.nome, cliente_id: worksite.cliente_id || "", cliente_nome: worksite.cliente_nome || "", indirizzo: worksite.indirizzo || "", nome: `${worksite.nome} – Lotto ${lots.length + 1}` }}
        onSaved={(s) => { if (s?.id) navigate(`/lavori/${s.id}`); }} />
    </DetailCard>
  );
}

/** Collegamento dal lotto al suo progetto. */
export function ParentLink({ worksite }) {
  if (!worksite.parent_id) return null;
  return (
    <Link to={`/lavori/${worksite.parent_id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900">
      <ArrowLeft className="w-4 h-4" /> Lotto del progetto <b className="text-zinc-900">{worksite.parent_nome || "principale"}</b>
    </Link>
  );
}
