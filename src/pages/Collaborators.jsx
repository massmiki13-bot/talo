import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, db } from "@/lib/db";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { PERMISSION_MODULES } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import InviteDialog from "@/components/collaborators/InviteDialog";
import EditCollaboratorDialog from "@/components/collaborators/EditCollaboratorDialog";
import { UserPlus, Pencil, Ban, ShieldCheck, HardHat, Crown, Copy, Link as LinkIcon, Clock, X, Check, RotateCcw, ChevronDown, ChevronRight, KeyRound, Users } from "lucide-react";

const TTL_DAYS = 14;
const initials = (s) => String(s || "?").split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const daysLeft = (inv) => Math.ceil(TTL_DAYS - (Date.now() - new Date(inv.created_date).getTime()) / 86_400_000);

const ROLES = [
  { key: "titolare", icon: Crown, title: "Titolare", tone: "bg-slate-900 text-white", text: "Tu. Vedi e gestisci tutto, compresi costi, profilo ditta e collaboratori." },
  { key: "responsabile", icon: ShieldCheck, title: "Responsabile", tone: "bg-zinc-200 text-zinc-800", text: "Ufficio, capocantiere, commerciale: lavora solo nei moduli che scegli tu." },
  { key: "operaio", icon: HardHat, title: "Operaio", tone: "bg-amber-100 text-amber-800", text: "Vede soltanto i propri documenti, le proprie presenze e ore. Nessun costo." },
];

export default function Collaborators() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [collabs, setCollabs] = useState([]);
  const [invites, setInvites] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showRevoked, setShowRevoked] = useState(false);
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [c, i, e] = await Promise.all([
        api.entities.Collaborator.filter({ host_user_id: user.id }, "-created_date"),
        api.entities.CollaboratorInvite.filter({ host_user_id: user.id }, "-created_date").catch(() => []),
        db.Employee.list().catch(() => []),
      ]);
      setCollabs(c); setInvites(i); setEmployees(e);
    } catch {
      toast({ title: "Errore nel caricamento", variant: "destructive" });
    } finally { setLoading(false); }
  }, [user?.id, toast]);
  useEffect(() => { load(); }, [load]);

  const active = collabs.filter((c) => c.status === "active");
  const revoked = collabs.filter((c) => c.status === "revoked");
  const pending = invites.filter((i) => i.status === "pending" && daysLeft(i) > 0);
  const empName = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, `${e.nome || ""} ${e.cognome || ""}`.trim()])), [employees]);

  const revoke = async (c) => {
    if (!confirm(`Revocare l'accesso a ${c.display_name || c.email}? Non potrà più entrare nei dati dell'impresa.`)) return;
    try { await api.entities.Collaborator.update(c.id, { status: "revoked" }); toast({ title: "Accesso revocato" }); load(); }
    catch { toast({ title: "Revoca non riuscita", variant: "destructive" }); }
  };
  const restore = async (c) => {
    try { await api.entities.Collaborator.update(c.id, { status: "active" }); toast({ title: "Accesso riattivato" }); load(); }
    catch { toast({ title: "Operazione non riuscita", variant: "destructive" }); }
  };
  const cancelInvite = async (i) => {
    if (!confirm("Annullare questo invito? Il link smetterà di funzionare.")) return;
    try { await api.entities.CollaboratorInvite.update(i.id, { status: "revoked" }); load(); }
    catch { toast({ title: "Operazione non riuscita", variant: "destructive" }); }
  };
  const copy = (text, key) => { navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 1500); };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <PageHeader title="Collaboratori" subtitle="Chi lavora con te su Talo e cosa può vedere. Ogni accesso si concede con un invito e si revoca con un clic." actionLabel="Invita collaboratore" actionIcon={UserPlus} onAction={() => setInviteOpen(true)} />

      {/* Ruoli */}
      <div className="grid md:grid-cols-3 gap-3">
        {ROLES.map(({ key, icon: I, title, tone, text }) => (
          <div key={key} className="bg-white rounded-2xl border border-slate-200 p-4 flex gap-3">
            <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${tone}`}><I className="w-5 h-5" /></div>
            <div>
              <p className="text-sm font-semibold text-slate-900">{title}{key !== "titolare" && <span className="ml-1.5 text-xs font-normal text-slate-500">{(key === "operaio" ? active.filter((c) => c.access_level === "operaio") : active.filter((c) => c.access_level !== "operaio")).length} attivi</span>}</p>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{text}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Inviti in attesa */}
      {pending.length > 0 && (
        <section className="bg-white rounded-2xl border border-amber-200 overflow-hidden">
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-700" />
            <h2 className="text-sm font-semibold text-amber-900">Inviti in attesa di conferma</h2>
            <span className="text-xs text-amber-800">{pending.length}</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {pending.map((i) => {
              const link = `${window.location.origin}/collaboratori/invito/${i.id}`;
              return (
                <li key={i.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-sm font-medium text-slate-900">{i.display_name || (i.access_level === "operaio" ? empName[i.employee_id] : "") || "Invito senza nome"}</p>
                    <p className="text-xs text-slate-500">{i.access_level === "operaio" ? "Operaio" : "Responsabile"} · scade tra {daysLeft(i)} {daysLeft(i) === 1 ? "giorno" : "giorni"}{i.tentativi_falliti ? ` · ${i.tentativi_falliti} codici errati` : ""}</p>
                  </div>
                  <button onClick={() => copy(i.code, `c${i.id}`)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 h-8 text-sm hover:bg-slate-50" title="Copia il codice">
                    <KeyRound className="w-3.5 h-3.5 text-slate-500" /><span className="font-mono font-semibold tracking-widest">{i.code}</span>{copied === `c${i.id}` ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                  </button>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => copy(link, `l${i.id}`)}>{copied === `l${i.id}` ? <Check className="w-4 h-4 text-emerald-700" /> : <LinkIcon className="w-4 h-4" />} Copia link</Button>
                  <button onClick={() => cancelInvite(i)} className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50" aria-label="Annulla invito" title="Annulla invito"><X className="w-4 h-4" /></button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Collaboratori attivi */}
      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">Hanno accesso</h2>
          <span className="text-xs text-slate-500">{active.length}</span>
        </div>
        {active.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="mt-3 font-semibold text-slate-900">Lavori ancora da solo su Talo</p>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">Invita l'ufficio, un capocantiere o i tuoi operai: ricevono un link e un codice di conferma, e vedono solo quello che decidi tu.</p>
            <Button onClick={() => setInviteOpen(true)} className="mt-4 bg-brand-600 hover:bg-brand-700 gap-2"><UserPlus className="w-4 h-4" /> Invita collaboratore</Button>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {active.map((c) => <Row key={c.id} c={c} empName={empName} onEdit={() => setEditing(c)} onRevoke={() => revoke(c)} />)}
          </ul>
        )}
      </section>

      {revoked.length > 0 && (
        <section>
          <button onClick={() => setShowRevoked(!showRevoked)} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
            {showRevoked ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />} Accessi revocati ({revoked.length})
          </button>
          {showRevoked && (
            <ul className="mt-2 bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
              {revoked.map((c) => <Row key={c.id} c={c} empName={empName} muted onRestore={() => restore(c)} />)}
            </ul>
          )}
        </section>
      )}

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} onCreated={load} hostUserId={user?.id} />
      {editing && <EditCollaboratorDialog collaborator={editing} open={!!editing} onOpenChange={(v) => !v && setEditing(null)} onUpdated={load} />}
    </div>
  );
}

function Row({ c, empName, muted, onEdit, onRevoke, onRestore }) {
  const op = c.access_level === "operaio";
  const mods = PERMISSION_MODULES.filter((m) => (c.permissions || []).includes(m.key));
  const all = mods.length === PERMISSION_MODULES.length;
  return (
    <li className={`px-4 py-3 flex flex-wrap items-center gap-3 ${muted ? "opacity-70" : ""}`}>
      <div className={`w-10 h-10 rounded-full grid place-items-center text-sm font-semibold shrink-0 ${op ? "bg-amber-100 text-amber-800" : "bg-zinc-200 text-zinc-800"}`}>{initials(c.display_name || c.email)}</div>
      <div className="flex-1 min-w-[180px]">
        <p className="text-sm font-medium text-slate-900 truncate">{c.display_name || c.email}</p>
        <p className="text-xs text-slate-500 truncate">{c.email}</p>
      </div>
      <div className="w-full sm:w-auto sm:max-w-[45%] order-last sm:order-none flex flex-wrap items-center gap-1">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${op ? "bg-amber-100 text-amber-800" : "bg-zinc-200 text-zinc-800"}`}>{op ? "Operaio" : "Responsabile"}</span>
        {op ? (
          <span className="text-xs text-slate-600">collegato a {empName[c.employee_id] || "dipendente"}</span>
        ) : all ? (
          <span className="text-xs text-slate-600">tutti i moduli</span>
        ) : mods.slice(0, 5).map((m) => <span key={m.key} className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{m.label}</span>)}
        {!op && !all && mods.length > 5 && <span className="text-xs text-slate-500">+{mods.length - 5}</span>}
      </div>
      <div className="flex gap-1.5 ml-auto">
        {onEdit && <Button size="sm" variant="outline" className="gap-1.5" onClick={onEdit}><Pencil className="w-3.5 h-3.5" /> Permessi</Button>}
        {onRevoke && <Button size="sm" variant="ghost" className="gap-1.5 text-red-700 hover:text-red-700 hover:bg-red-50" onClick={onRevoke}><Ban className="w-3.5 h-3.5" /> Revoca</Button>}
        {onRestore && <Button size="sm" variant="outline" className="gap-1.5" onClick={onRestore}><RotateCcw className="w-3.5 h-3.5" /> Riattiva</Button>}
      </div>
    </li>
  );
}
