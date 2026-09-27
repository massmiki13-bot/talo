import React, { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { api, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { ArrowLeft, Plus, Trash2, TrendingUp, TrendingDown, Wallet, Camera, Sparkles, Upload, Eye, FileDown, FileText, AlertCircle, Users, Edit3, Inbox } from "lucide-react";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { formatEuro } from "@/utils/pdfUtils";
import { exportWorksiteFolder } from "@/utils/worksiteExport";
import WorksitePhotos from "@/components/worksite/WorksitePhotos";
import WorksiteQuickNotes from "@/components/worksite/WorksiteQuickNotes";
import WorksitePayments from "@/components/worksite/WorksitePayments";
import SignStampDialog from "@/components/quotes/SignStampDialog";

const SPESA_CATEGORIE = ["Materiali", "Manodopera", "Noleggi", "Subappalti", "Altro"];
const ENTRATA_CATEGORIE = ["Preventivo", "Acconto", "Saldo", "Altro"];

export default function WorksiteDetail() {
  const { id } = useParams();
  const [worksite, setWorksite] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [quote, setQuote] = useState(null);
  const [linkedQuotes, setLinkedQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filter, setFilter] = useState("tutti");
  const [form, setForm] = useState({ tipo: "uscita", categoria: "Materiali", descrizione: "", importo: 0, data: new Date().toISOString().slice(0, 10), fornitore: "" });
  const [fileUrl, setFileUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [worksiteMatch, setWorksiteMatch] = useState(null);
  const [allWorksites, setAllWorksites] = useState([]);
  const [laborOverride, setLaborOverride] = useState(null);
  const [editingLabor, setEditingLabor] = useState(false);
  const [receivedQuotes, setReceivedQuotes] = useState([]);
  const [profile, setProfile] = useState(null);
  const [signTarget, setSignTarget] = useState(null);
  const { toast } = useToast();

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    try {
      const [site, txs, phs, att, emps, sites, quotes, recvQuotes, profs] = await Promise.all([
        db.Worksite.get(id),
        db.WorksiteTransaction.filter({ worksite_id: id }, "-data"),
        db.WorksitePhoto.filter({ worksite_id: id }, "-data"),
        db.DailyAttendance.filter({ cantiere_id: id }),
        db.Employee.list(),
        db.Worksite.list(),
        db.Quote.list(),
        db.ReceivedQuote.filter({ worksite_id: id }, "-data"),
        db.CompanyProfile.list(),
      ]);
      setWorksite(site);
      setTransactions(txs);
      setPhotos(phs);
      setAttendance(att);
      setEmployees(emps);
      setAllWorksites(sites);
      setReceivedQuotes(recvQuotes);
      setProfile(profs[0]);
      setLaborOverride(site.costo_manodopera_manuale ?? null);
      // Find all quotes linked to this worksite (via worksite_id or preventivo_id)
      const linked = quotes.filter(qq => qq.worksite_id === id || qq.id === site.preventivo_id);
      setLinkedQuotes(linked);
      // Primary quote for payments: prefer the one from preventivo_id, else the first linked
      const primary = site.preventivo_id ? quotes.find(qq => qq.id === site.preventivo_id) : linked[0];
      if (primary) setQuote(primary);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // Calculate labor cost from attendance
  const autoLaborCost = useMemo(() => {
    let total = 0;
    attendance.forEach(a => {
      a.presenze?.forEach(p => {
        const emp = employees.find(e => e.id === p.dipendente_id);
        const rate = emp?.costo_orario || 0;
        total += (p.ore || 0) * rate;
      });
    });
    return total;
  }, [attendance, employees]);

  const laborCost = laborOverride != null ? laborOverride : autoLaborCost;
  const usingAutoLabor = laborOverride == null;

  const totalEntrate = transactions.filter(t => t.tipo === "entrata").reduce((s, t) => s + (t.importo || 0), 0);
  const totalUscite = transactions.filter(t => t.tipo === "uscita").reduce((s, t) => s + (t.importo || 0), 0);
  const totalCost = totalUscite + laborCost;
  const margine = totalEntrate - totalCost;
  const inPerdita = margine < 0;

  const filtered = filter === "tutti" ? transactions : transactions.filter(t => t.tipo === filter);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file });
      setFileUrl(file_url);
    } catch (e) { toast({ title: "Errore upload", variant: "destructive" }); }
    finally { setUploading(false); }
  };

  const handleAiExtract = async () => {
    if (!fileUrl) return;
    setAiLoading(true);
    setWorksiteMatch(null);
    try {
      const result = await api.integrations.Core.InvokeLLM({
        prompt: `Analizza questa foto di documento di spesa (bolla, scontrino, ricevuta).
        Estrai: importo totale (numero), data (formato YYYY-MM-DD), fornitore (nome).
        Se sul documento è indicato un indirizzo o un nome di cantiere/lavoro, estrailo.

        Ecco i lavori esistenti per confronto:
        ${JSON.stringify(allWorksites.map(w => ({ id: w.id, nome: w.nome, indirizzo: w.indirizzo })))}

        Se l'indirizzo o il nome sul documento corrisponde chiaramente a uno dei lavori elencati, indica worksite_match_id e worksite_match_nome.
        Se il documento sembra appartenere a un lavoro diverso da quello corrente (id: ${id}), impostalo in worksite_match_id.
        Se NON sei sicuro a quale lavoro appartenga, imposta needs_worksite_confirmation: true.
        Non indovinare — solo se c'è una corrispondenza chiara.`,
        file_urls: [fileUrl],
        response_json_schema: {
          type: "object",
          properties: {
            importo: { type: "number" },
            data: { type: "string" },
            fornitore: { type: "string" },
            indirizzo_documento: { type: "string" },
            worksite_match_id: { type: "string" },
            worksite_match_nome: { type: "string" },
            needs_worksite_confirmation: { type: "boolean" },
          },
        },
      });

      setForm(prev => ({
        ...prev,
        importo: result.importo || prev.importo,
        data: result.data || prev.data,
        fornitore: result.fornitore || prev.fornitore,
      }));

      if (result.worksite_match_id && result.worksite_match_id !== id) {
        setWorksiteMatch({ id: result.worksite_match_id, nome: result.worksite_match_nome || "", needsConfirm: true });
      } else if (result.needs_worksite_confirmation) {
        setWorksiteMatch({ id: null, nome: "", needsConfirm: true });
      }

      toast({ title: "Dati estratti — verifica prima di salvare" });
    } catch (e) { toast({ title: "Errore IA", variant: "destructive" }); }
    finally { setAiLoading(false); }
  };

  const handleSave = async () => {
    if (!form.importo || !form.data) { toast({ title: "Importo e data obbligatori", variant: "destructive" }); return; }

    // If AI suggested a different worksite, use that one
    const targetWorksiteId = worksiteMatch?.id || id;
    const targetWorksite = allWorksites.find(w => w.id === targetWorksiteId);

    try {
      await db.WorksiteTransaction.create({
        ...form,
        worksite_id: targetWorksiteId,
        worksite_nome: targetWorksite?.nome || worksite?.nome || "",
        file_url: fileUrl || undefined,
      });
      setDialogOpen(false);
      setForm({ tipo: "uscita", categoria: "Materiali", descrizione: "", importo: 0, data: new Date().toISOString().slice(0, 10), fornitore: "" });
      setFileUrl("");
      setWorksiteMatch(null);
      if (targetWorksiteId !== id) {
        toast({ title: "Spesa associata a altro lavoro", description: targetWorksite?.nome });
      } else {
        load();
        toast({ title: "Movimento registrato" });
      }
    } catch (e) { toast({ title: "Errore", variant: "destructive" }); }
  };

  const handleDelete = async (txId) => {
    if (!confirm("Eliminare questo movimento?")) return;
    await db.WorksiteTransaction.delete(txId);
    load();
  };

  const handleSaveLaborOverride = async () => {
    try {
      await db.Worksite.update(id, { costo_manodopera_manuale: laborOverride });
      setEditingLabor(false);
      toast({ title: "Costo manodopera aggiornato" });
    } catch (e) { toast({ title: "Errore", variant: "destructive" }); }
  };

  const handleStatusChange = async (newStatus) => {
    setWorksite(prev => ({ ...prev, stato: newStatus }));
    await db.Worksite.update(id, { stato: newStatus });
    toast({ title: "Stato aggiornato" });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportWorksiteFolder(worksite, transactions, photos, laborCost, employees, attendance);
      toast({ title: "Cartella esportata" });
    } catch (e) { toast({ title: "Errore export", variant: "destructive" }); }
    finally { setExporting(false); }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <Link to="/lavori" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Torna ai lavori
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-4 sm:mb-6 gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 break-words">{worksite?.nome}</h1>
            <Select value={worksite?.stato || "da_iniziare"} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-[130px] h-8 flex-shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="da_iniziare">Da Iniziare</SelectItem>
                <SelectItem value="in_corso">In Corso</SelectItem>
                <SelectItem value="finito">Finito</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {worksite?.cliente_nome && <p className="text-sm text-slate-500 mt-1">Cliente: {worksite.cliente_nome}</p>}
          {worksite?.indirizzo && <p className="text-xs text-slate-400">{worksite.indirizzo}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} disabled={exporting} className="gap-2 h-10 flex-1 sm:flex-none">
            <FileDown className="w-4 h-4" /> <span className="hidden sm:inline">{exporting ? "Esportazione…" : "Esporta"}</span>
          </Button>
          <Button onClick={() => setDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700 gap-2 h-10 flex-1 sm:flex-none">
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Movimento</span><span className="sm:hidden">Spesa</span>
          </Button>
        </div>
      </div>

      {/* Preventivi collegati */}
      {linkedQuotes.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Preventivi collegati</p>
          <div className="space-y-2">
            {linkedQuotes.map(q => (
              <Link key={q.id} to={`/preventivi/${q.id}`} className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4 hover:bg-blue-100 transition-colors">
                <FileText className="w-5 h-5 text-blue-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-blue-900">Preventivo {q.numero}</p>
                  <p className="text-xs text-blue-600 truncate">{q.oggetto} · {formatEuro(q.totale)}</p>
                </div>
                <span className="text-xs text-blue-600 flex-shrink-0">Apri →</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Preventivi ricevuti collegati */}
      {receivedQuotes.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Preventivi ricevuti</p>
          <div className="space-y-2">
            {receivedQuotes.map(rq => (
              <div key={rq.id} className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-xl p-4">
                <Inbox className="w-5 h-5 text-amber-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-900">{rq.fornitore}</p>
                  <p className="text-xs text-amber-600 truncate">
                    {rq.data ? new Date(rq.data).toLocaleDateString("it-IT") : ""} · {rq.descrizione || ""}
                    {rq.importo > 0 && ` · € ${rq.importo.toFixed(2)}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {rq.file_url && (
                    <a href={rq.file_url} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200" title="Vedi originale">
                      <Eye className="w-4 h-4" />
                    </a>
                  )}
                  {rq.file_firmato_url && (
                    <a href={rq.file_firmato_url} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200" title="Vedi firmato">
                      <FileDown className="w-4 h-4" />
                    </a>
                  )}
                  {(rq.file_tipo === "image" || rq.file_tipo === "pdf") && profile && (profile.firma_url || profile.timbro_url) && (
                    <Button size="sm" variant="outline" onClick={() => setSignTarget(rq)} className="h-7 text-xs gap-1">
                      <FileText className="w-3 h-3" /> {rq.file_firmato_url ? "Rifirma" : "Firma"}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Budget summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-5">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-slate-500">Entrate</p>
              <p className="text-lg sm:text-2xl font-bold text-emerald-600 mt-1">{formatEuro(totalEntrate)}</p>
            </div>
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-5">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-slate-500">Uscite</p>
              <p className="text-lg sm:text-2xl font-bold text-red-600 mt-1">{formatEuro(totalUscite)}</p>
            </div>
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
              <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
            </div>
          </div>
        </div>
        {/* Labor cost card */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-5">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-orange-500" />
                <p className="text-xs sm:text-sm text-slate-500">Manodopera</p>
                {usingAutoLabor && <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 rounded-full">auto</span>}
              </div>
              {editingLabor ? (
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  <Input
                    type="number"
                    step="0.01"
                    value={laborOverride ?? autoLaborCost}
                    onChange={e => setLaborOverride(e.target.value ? parseFloat(e.target.value) : null)}
                    className="h-7 text-sm w-20"
                  />
                  <button onClick={handleSaveLaborOverride} className="text-xs text-blue-600 font-medium">OK</button>
                  <button onClick={() => { setEditingLabor(false); setLaborOverride(worksite?.costo_manodopera_manuale ?? null); }} className="text-xs text-slate-400">Annulla</button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-lg sm:text-2xl font-bold text-orange-600">{formatEuro(laborCost)}</p>
                  <button onClick={() => setEditingLabor(true)} className="text-slate-300 hover:text-blue-600 flex-shrink-0" title="Modifica">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {usingAutoLabor && attendance.length > 0 && !editingLabor && (
                <p className="text-[10px] text-slate-400 mt-0.5">Da {attendance.length} giornaliere</p>
              )}
            </div>
          </div>
        </div>
        {/* Margin */}
        <div className={`rounded-xl border p-3 sm:p-5 ${inPerdita ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"}`}>
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-slate-500">Margine</p>
              <p className={`text-lg sm:text-2xl font-bold mt-1 ${inPerdita ? "text-red-700" : "text-emerald-700"}`}>{formatEuro(margine)}</p>
              <p className={`text-xs mt-0.5 ${inPerdita ? "text-red-600" : "text-emerald-600"}`}>{inPerdita ? "In perdita" : "In attivo"}</p>
            </div>
            <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${inPerdita ? "bg-red-100" : "bg-emerald-100"}`}>
              <Wallet className={`w-4 h-4 sm:w-5 sm:h-5 ${inPerdita ? "text-red-600" : "text-emerald-600"}`} />
            </div>
          </div>
        </div>
      </div>

      {/* Payments */}
      <div className="mb-6">
        <WorksitePayments worksite={worksite} quote={quote} />
      </div>

      {/* Quick notes */}
      <div className="mb-6">
        <WorksiteQuickNotes worksite={worksite} />
      </div>

      {/* Photos */}
      <div className="mb-6">
        <WorksitePhotos worksiteId={id} />
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {[
          { value: "tutti", label: "Tutti" },
          { value: "entrata", label: "Entrate" },
          { value: "uscita", label: "Uscite" },
        ].map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${filter === f.value ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Transactions */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <Wallet className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Nessun movimento registrato</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-3">Data</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-3">Descrizione</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-3">Categoria</th>
                  <th className="text-right text-xs font-medium text-slate-500 uppercase px-4 py-3">Importo</th>
                  <th className="text-right text-xs font-medium text-slate-500 uppercase px-4 py-3">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-600">{new Date(t.data).toLocaleDateString("it-IT")}</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">
                      {t.descrizione || t.categoria}
                      {t.fornitore && <span className="block text-xs text-slate-500">{t.fornitore}</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${t.tipo === "entrata" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                        {t.categoria}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-sm font-bold text-right ${t.tipo === "entrata" ? "text-emerald-600" : "text-red-600"}`}>
                      {t.tipo === "entrata" ? "+" : "−"} {formatEuro(t.importo)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {t.file_url && (
                          <a href={t.file_url} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600">
                            <Eye className="w-4 h-4" />
                          </a>
                        )}
                        <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map(t => (
              <div key={t.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">{t.descrizione || t.categoria}</p>
                    {t.fornitore && <p className="text-xs text-slate-500">{t.fornitore}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-slate-400">{new Date(t.data).toLocaleDateString("it-IT")}</span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${t.tipo === "entrata" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                        {t.categoria}
                      </span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-bold ${t.tipo === "entrata" ? "text-emerald-600" : "text-red-600"}`}>
                      {t.tipo === "entrata" ? "+" : "−"} {formatEuro(t.importo)}
                    </p>
                    <div className="flex gap-1 justify-end mt-1">
                      {t.file_url && (
                        <a href={t.file_url} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg bg-slate-100 text-slate-600">
                          <Eye className="w-4 h-4" />
                        </a>
                      )}
                      <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded-lg bg-red-50 text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* New transaction dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) { setFileUrl(""); setWorksiteMatch(null); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nuovo Movimento</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v, categoria: v === "entrata" ? ENTRATA_CATEGORIE[0] : SPESA_CATEGORIE[0] })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entrata">Entrata</SelectItem>
                    <SelectItem value="uscita">Uscita</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Categoria</Label>
                <Select value={form.categoria} onValueChange={v => setForm({ ...form, categoria: v })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(form.tipo === "entrata" ? ENTRATA_CATEGORIE : SPESA_CATEGORIE).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Descrizione</Label>
              <Input value={form.descrizione} onChange={e => setForm({ ...form, descrizione: e.target.value })} placeholder="Es. Acquisto materiali..." className="h-10" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Importo (€)</Label>
                <Input type="number" step="0.01" value={form.importo} onChange={e => setForm({ ...form, importo: parseFloat(e.target.value) || 0 })} className="h-10" />
              </div>
              <div>
                <Label>Data</Label>
                <Input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} className="h-10" />
              </div>
            </div>
            <div>
              <Label>Fornitore (opzionale)</Label>
              <Input value={form.fornitore} onChange={e => setForm({ ...form, fornitore: e.target.value })} className="h-10" />
            </div>

            {/* Worksite match warning */}
            {worksiteMatch?.needsConfirm && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-amber-800 font-medium">Associazione lavoro</p>
                  {worksiteMatch.id ? (
                    <p className="text-sm text-amber-700">L'IA ha riconosciuto questa spesa come appartenente a <strong>{worksiteMatch.nome}</strong>. Verrà salvata in quel lavoro.</p>
                  ) : (
                    <p className="text-sm text-amber-700">L'IA non è sicura a quale lavoro associare questa spesa. Sarà salvata nel lavoro corrente.</p>
                  )}
                  <Select
                    value={worksiteMatch.id || id}
                    onValueChange={v => setWorksiteMatch({ id: v, nome: allWorksites.find(w => w.id === v)?.nome || "", needsConfirm: false })}
                  >
                    <SelectTrigger className="mt-2 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {allWorksites.map(w => <SelectItem key={w.id} value={w.id}>{w.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Photo upload for expenses */}
            {form.tipo === "uscita" && (
              <div className="border-t border-slate-100 pt-3">
                <Label className="text-sm">Foto documento (bolla, scontrino, ricevuta)</Label>
                <div className="flex flex-col sm:flex-row gap-2 mt-1">
                  <label className="flex-1 cursor-pointer">
                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center hover:border-blue-400 transition-colors min-h-[56px] flex items-center justify-center">
                      {uploading ? <p className="text-xs text-slate-500">Caricamento...</p> : fileUrl ? <p className="text-xs text-emerald-600">✓ Foto caricata — tocca per cambiare</p> : <><Camera className="w-6 h-6 text-slate-400 mx-auto mb-1" /><p className="text-xs text-slate-500">Scatta o carica foto</p></>}
                    </div>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload} />
                  </label>
                  {fileUrl && (
                    <Button type="button" size="sm" variant="outline" onClick={handleAiExtract} disabled={aiLoading} className="gap-1 whitespace-nowrap h-10 sm:self-end">
                      {aiLoading ? <Sparkles className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      Leggi con IA
                    </Button>
                  )}
                </div>
                {fileUrl && (
                  <p className="text-xs text-amber-600 mt-1">⚠ L'IA può sbagliare — verifica sempre i dati prima di salvare.</p>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700">Salva</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sign/Stamp dialog for received quotes */}
      {signTarget && (
        <SignStampDialog
          open={!!signTarget}
          onOpenChange={(v) => { if (!v) { setSignTarget(null); load(); } }}
          receivedQuote={signTarget}
          profile={profile}
          onSaved={load}
        />
      )}
    </div>
  );
}