import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/use-toast";
import {
  Upload, Sparkles, Search, Folder, FolderPlus, FileText, FileImage, FileSpreadsheet, File as FileIcon, LayoutGrid, List,
  ChevronRight, Home, AlertTriangle, Clock, Inbox, Star, Files, Loader2, CheckCircle2, XCircle, X, FolderInput, Trash2, Wand2, PanelLeft,
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import FolderTree from "@/components/documents/FolderTree";
import DocumentDetailSheet from "@/components/documents/DocumentDetailSheet";
import AiOrganizeDialog from "@/components/documents/AiOrganizeDialog";
import {
  DOC_TYPES, STANDARD_TREE, FOLDER_COLORS, typeLabel, cleanFolderName, buildTree, pathOf, pathLabel, descendants, ensurePath, fileKind, expiryState, formatSize,
} from "@/lib/documents";
import { analyzeDocument } from "@/lib/documentsAi";
import { createDocumentReminder, deleteRemindersForDoc } from "@/utils/expirationReminders";

const VIEWS = [
  { key: "all", label: "Tutti i documenti", icon: Files },
  { key: "unfiled", label: "Da archiviare", icon: Inbox },
  { key: "expiring", label: "In scadenza", icon: Clock },
  { key: "expired", label: "Scaduti", icon: AlertTriangle },
  { key: "recent", label: "Recenti", icon: Upload },
  { key: "fav", label: "Preferiti", icon: Star },
];

const KIND_ICON = { image: FileImage, pdf: FileText, sheet: FileSpreadsheet, doc: FileText, file: FileIcon };
const pref = (k, d) => { try { return localStorage.getItem(`talo.docs.${k}`) ?? d; } catch { return d; } };
const savePref = (k, v) => { try { localStorage.setItem(`talo.docs.${k}`, v); } catch { /* ignore */ } };

export default function CompanyDocuments() {
  const { toast } = useToast();
  const [docs, setDocs] = useState([]);
  const [folders, setFolders] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [worksites, setWorksites] = useState([]);
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState({ type: "view", key: "all" }); // oppure { type: "folder", id }
  const [expanded, setExpanded] = useState(new Set());
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sort, setSort] = useState(pref("sort", "recent"));
  const [layout, setLayout] = useState(pref("layout", "list"));
  const [selected, setSelected] = useState(new Set());
  const [detailId, setDetailId] = useState(null);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);
  const [folderDlg, setFolderDlg] = useState(null); // { mode: new|edit, parentId, folder }
  const [moveDlg, setMoveDlg] = useState(null); // { docIds } | { folder }
  const [aiAuto, setAiAuto] = useState(pref("ai", "1") === "1");
  const [queue, setQueue] = useState([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);
  const foldersRef = useRef([]);
  foldersRef.current = folders;

  const load = useCallback(async () => {
    try {
      const [d, f, c, e, w] = await Promise.all([
        db.CompanyDocument.list("-created_date"), db.DocumentFolder.list(), db.Contact.list(), db.Employee.list(), db.Worksite.list("-created_date"),
      ]);
      setDocs(d); setFolders(f); setContacts(c); setEmployees(e); setWorksites(w);
      return { d, f };
    } catch (err) {
      console.error(err);
      toast({ title: "Impossibile caricare i documenti", variant: "destructive" });
      return { d: [], f: [] };
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => {
    load().then(({ d }) => {
      const id = new URLSearchParams(window.location.search).get("doc");
      if (id && d.some((x) => x.id === id)) setDetailId(id);
    });
  }, [load]);

  // ─── Derivati ───
  const byParent = useMemo(() => buildTree(folders), [folders]);
  const currentFolderId = view.type === "folder" ? view.id : null;
  const crumbs = currentFolderId ? pathOf(currentFolderId, folders) : [];

  const counts = useMemo(() => {
    const direct = {};
    for (const d of docs) if (d.cartella_id) direct[d.cartella_id] = (direct[d.cartella_id] || 0) + 1;
    const total = {};
    const walk = (id) => { let n = direct[id] || 0; for (const k of byParent.get(id) || []) n += walk(k.id); total[id] = n; return n; };
    for (const r of byParent.get(null) || []) walk(r.id);
    // cartelle orfane (genitore eliminato)
    for (const f of folders) if (total[f.id] == null) total[f.id] = direct[f.id] || 0;
    return total;
  }, [docs, byParent, folders]);

  const viewCounts = useMemo(() => {
    const c = { all: docs.length, unfiled: 0, expiring: 0, expired: 0, recent: 0, fav: 0 };
    const week = Date.now() - 7 * 86_400_000;
    for (const d of docs) {
      if (!d.cartella_id || !folders.some((f) => f.id === d.cartella_id)) c.unfiled++;
      const e = expiryState(d.data_scadenza);
      if (e?.key === "in_scadenza") c.expiring++;
      if (e?.key === "scaduto") c.expired++;
      if (new Date(d.created_date).getTime() > week) c.recent++;
      if (d.preferito) c.fav++;
    }
    return c;
  }, [docs, folders]);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  const visibleDocs = useMemo(() => {
    let list = docs;
    if (searching) {
      // la ricerca copre tutto l'archivio (o la cartella corrente con le sue sottocartelle)
      if (currentFolderId) {
        const ids = new Set([currentFolderId, ...descendants(currentFolderId, folders).map((f) => f.id)]);
        list = list.filter((d) => ids.has(d.cartella_id));
      }
      list = list.filter((d) => [d.titolo, d.nome_file, d.descrizione, d.riassunto, d.numero, d.emittente, d.contatto_nome, d.dipendente_nome, d.worksite_nome, (d.tag || []).join(" "), d.contenuto_estratto, typeLabel(d.tipo)]
        .some((v) => String(v || "").toLowerCase().includes(q)));
    } else if (currentFolderId) {
      list = list.filter((d) => d.cartella_id === currentFolderId);
    } else {
      const k = view.key;
      const week = Date.now() - 7 * 86_400_000;
      if (k === "unfiled") list = list.filter((d) => !d.cartella_id || !folders.some((f) => f.id === d.cartella_id));
      if (k === "expiring") list = list.filter((d) => expiryState(d.data_scadenza)?.key === "in_scadenza");
      if (k === "expired") list = list.filter((d) => expiryState(d.data_scadenza)?.key === "scaduto");
      if (k === "recent") list = list.filter((d) => new Date(d.created_date).getTime() > week);
      if (k === "fav") list = list.filter((d) => d.preferito);
    }
    if (typeFilter !== "all") list = list.filter((d) => d.tipo === typeFilter);
    const s = [...list];
    if (sort === "name") s.sort((a, b) => String(a.titolo).localeCompare(String(b.titolo), "it"));
    if (sort === "expiry") s.sort((a, b) => (a.data_scadenza || "9999").localeCompare(b.data_scadenza || "9999"));
    if (sort === "recent") s.sort((a, b) => String(b.created_date).localeCompare(String(a.created_date)));
    if (sort === "type") s.sort((a, b) => typeLabel(a.tipo).localeCompare(typeLabel(b.tipo), "it"));
    return s;
  }, [docs, folders, view, currentFolderId, searching, q, typeFilter, sort]);

  const subfolders = !searching && currentFolderId !== undefined
    ? (view.type === "folder" ? byParent.get(currentFolderId) || [] : view.key === "all" ? byParent.get(null) || [] : [])
    : [];

  const detailDoc = docs.find((d) => d.id === detailId) || null;

  // ─── Navigazione ───
  const openFolder = (id) => {
    setView({ type: "folder", id });
    setSelected(new Set());
    setQuery("");
    setTreeOpen(false);
    const n = new Set(expanded);
    for (const f of pathOf(id, folders)) n.add(f.id);
    setExpanded(n);
  };
  const openView = (key) => { setView({ type: "view", key }); setSelected(new Set()); setTreeOpen(false); };

  // ─── Caricamento con IA ───
  const updateQ = (id, patch) => setQueue((qq) => qq.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const processFile = async (item, targetFolderId) => {
    try {
      updateQ(item.id, { status: "upload" });
      const { file_url } = await api.integrations.Core.UploadFile({ file: item.file });
      const folder = foldersRef.current.find((f) => f.id === targetFolderId);
      let doc = await db.CompanyDocument.create({
        titolo: item.file.name.replace(/\.[^.]+$/, ""), tipo: "altro", file_url, nome_file: item.file.name, dimensione: item.file.size, mime: item.file.type,
        cartella_id: folder?.id || "", cartella_nome: folder?.nome || "",
      });
      setDocs((d) => [doc, ...d]);
      if (!aiAuto) { updateQ(item.id, { status: "done", docId: doc.id, info: folder ? pathLabel(folder.id, foldersRef.current) : "Da archiviare" }); return; }

      updateQ(item.id, { status: "ai", docId: doc.id });
      const r = await analyzeDocument(file_url, item.file.name, { folders: foldersRef.current, employees, contacts, worksites });
      let folderId = folder?.id || "";
      if (!folderId && r.cartella) {
        const res = await ensurePath(r.cartella, foldersRef.current, db);
        foldersRef.current = res.folders;
        setFolders(res.folders);
        folderId = res.folderId;
      }
      const { cartella, _smista, ...meta } = r; // eslint-disable-line no-unused-vars
      doc = await db.CompanyDocument.update(doc.id, {
        ...meta, cartella_id: folderId || "", cartella_nome: foldersRef.current.find((f) => f.id === folderId)?.nome || "",
        data_emissione: r.data_emissione || null, data_scadenza: r.data_scadenza || null,
      });
      setDocs((d) => d.map((x) => (x.id === doc.id ? doc : x)));
      if (doc.data_scadenza && new Date(doc.data_scadenza) >= new Date(new Date().toDateString())) {
        await createDocumentReminder(doc.titolo, doc.data_scadenza, doc.id, "CompanyDocument", typeLabel(doc.tipo), doc.dipendente_nome || null).catch(() => null);
      }
      // Smistamento: documenti personali anche nella scheda del dipendente, fatture fornitore nei costi del lavoro.
      const extra = [];
      if (_smista?.dipendente && doc.dipendente_id) {
        const ed = await db.EmployeeDocument.create({
          dipendente_id: doc.dipendente_id, tipo: _smista.dipendente, titolo: doc.titolo, descrizione: doc.riassunto || "",
          file_url, data_emissione: doc.data_emissione || null, data_scadenza: doc.data_scadenza || null,
          ...(_smista.corso_codice ? { corso_codice: _smista.corso_codice } : {}),
        }).catch(() => null);
        if (ed) { await db.CompanyDocument.update(doc.id, { documento_dipendente_id: ed.id }).catch(() => null); extra.push(`scheda di ${doc.dipendente_nome}`); }
      }
      if (_smista?.costo && doc.worksite_id && _smista.costo.importo > 0) {
        const tx = await db.WorksiteTransaction.create({
          worksite_id: doc.worksite_id, worksite_nome: doc.worksite_nome, tipo: "uscita", categoria: _smista.costo.categoria,
          descrizione: doc.titolo, importo: Math.round(_smista.costo.importo * 100) / 100, data: doc.data_emissione || new Date().toISOString().slice(0, 10),
          fornitore: doc.emittente || doc.contatto_nome || "", file_url,
        }).catch(() => null);
        if (tx) { await db.CompanyDocument.update(doc.id, { transazione_id: tx.id }).catch(() => null); extra.push(`costo di ${doc.worksite_nome}`); }
      }
      const where = folderId ? pathLabel(folderId, foldersRef.current) : "Da archiviare";
      updateQ(item.id, { status: "done", title: doc.titolo, info: extra.length ? `${where} · anche in ${extra.join(" e ")}` : where });
    } catch (e) {
      console.error(e);
      // con docId il file è salvato ma l'IA non ha finito; senza, il caricamento è fallito
      setQueue((qq) => qq.map((x) => (x.id !== item.id ? x : x.docId
        ? { ...x, status: "partial", info: "L'IA non ha potuto leggerlo: completa a mano" }
        : { ...x, status: "error", info: "Caricamento non riuscito" })));
    }
  };

  const handleFiles = async (fileList) => {
    const files = [...(fileList || [])].filter((f) => f.size > 0);
    if (!files.length) return;
    const tooBig = files.filter((f) => f.size > 25 * 1024 * 1024);
    if (tooBig.length) toast({ title: `${tooBig.length} file oltre 25 MB ignorati`, variant: "destructive" });
    const items = files.filter((f) => f.size <= 25 * 1024 * 1024).map((file) => ({ id: crypto.randomUUID(), file, name: file.name, status: "wait" }));
    if (!items.length) return;
    setQueue((qq) => [...items, ...qq.filter((x) => x.status !== "done")]);
    const target = currentFolderId;
    let i = 0;
    const worker = async () => { while (i < items.length) { const it = items[i++]; await processFile(it, target); } };
    await Promise.all([worker(), worker(), worker()]);
    load();
  };

  // ─── Cartelle ───
  const createStandardTree = async () => {
    let list = [...folders];
    try {
      for (const [i, root] of STANDARD_TREE.entries()) {
        let r = list.find((f) => !f.parent_id && f.nome.toLowerCase() === root.nome.toLowerCase());
        if (!r) { r = await db.DocumentFolder.create({ nome: root.nome, colore: root.colore, parent_id: null, ordine: i }); list.push(r); }
        for (const [j, child] of root.figli.entries()) {
          if (!list.some((f) => f.parent_id === r.id && f.nome.toLowerCase() === child.toLowerCase())) {
            list.push(await db.DocumentFolder.create({ nome: child, colore: root.colore, parent_id: r.id, ordine: j }));
          }
        }
      }
      // una cartella per ogni cantiere attivo
      const cantieri = list.find((f) => !f.parent_id && f.nome === "Cantieri");
      for (const w of worksites.filter((x) => !["completato", "annullato"].includes(x.stato)).slice(0, 40)) {
        const name = w.nome || w.titolo;
        if (cantieri && name && !list.some((f) => f.parent_id === cantieri.id && f.nome.toLowerCase() === name.toLowerCase())) {
          list.push(await db.DocumentFolder.create({ nome: name, colore: cantieri.colore, parent_id: cantieri.id, ordine: 0 }));
        }
      }
      setFolders(list);
      toast({ title: "Struttura creata", description: "Cartelle standard per impresa edile e impiantistica." });
    } catch (e) {
      toast({ title: "Errore nella creazione delle cartelle", variant: "destructive" });
      load();
    }
  };

  const saveFolder = async ({ nome, colore }) => {
    const dlg = folderDlg;
    try {
      if (dlg.mode === "new") {
        const f = await db.DocumentFolder.create({ nome, colore, parent_id: dlg.parentId || null, ordine: (byParent.get(dlg.parentId || null) || []).length });
        setFolders((l) => [...l, f]);
        if (dlg.parentId) setExpanded((s) => new Set([...s, dlg.parentId]));
      } else {
        const f = await db.DocumentFolder.update(dlg.folder.id, { nome, colore });
        setFolders((l) => l.map((x) => (x.id === f.id ? f : x)));
        const inside = docs.filter((d) => d.cartella_id === f.id);
        if (inside.length && nome !== dlg.folder.nome) await db.CompanyDocument.bulkUpdate(inside.map((d) => ({ id: d.id, cartella_nome: nome })));
      }
      setFolderDlg(null);
    } catch (e) {
      toast({ title: "Errore", variant: "destructive" });
    }
  };

  const deleteFolder = async (folder) => {
    const n = counts[folder.id] || 0;
    const subs = byParent.get(folder.id) || [];
    if (!confirm(`Eliminare la cartella "${folder.nome}"?${n || subs.length ? `\n\nIl contenuto (${n} documenti, ${subs.length} sottocartelle) verrà spostato nella cartella superiore.` : ""}`)) return;
    try {
      const parent = folder.parent_id || null;
      const parentName = folders.find((f) => f.id === parent)?.nome || "";
      const inside = docs.filter((d) => d.cartella_id === folder.id);
      if (inside.length) await db.CompanyDocument.bulkUpdate(inside.map((d) => ({ id: d.id, cartella_id: parent || "", cartella_nome: parentName })));
      for (const s of subs) await db.DocumentFolder.update(s.id, { parent_id: parent });
      await db.DocumentFolder.delete(folder.id);
      if (currentFolderId === folder.id) parent ? openFolder(parent) : openView("all");
      toast({ title: "Cartella eliminata" });
      load();
    } catch (e) { toast({ title: "Errore", variant: "destructive" }); }
  };

  const folderAction = (action, f) => {
    if (action === "sub") setFolderDlg({ mode: "new", parentId: f.id });
    if (action === "edit") setFolderDlg({ mode: "edit", folder: f });
    if (action === "move") setMoveDlg({ folder: f });
    if (action === "delete") deleteFolder(f);
  };

  // ─── Documenti ───
  const moveDocs = async (ids, folderId) => {
    const f = folders.find((x) => x.id === folderId);
    try {
      await db.CompanyDocument.bulkUpdate(ids.map((id) => ({ id, cartella_id: folderId || "", cartella_nome: f?.nome || "" })));
      setDocs((d) => d.map((x) => (ids.includes(x.id) ? { ...x, cartella_id: folderId || "", cartella_nome: f?.nome || "" } : x)));
      setSelected(new Set());
      toast({ title: ids.length === 1 ? "Documento spostato" : `${ids.length} documenti spostati`, description: f ? pathLabel(f.id, folders) : "Da archiviare" });
    } catch (e) { toast({ title: "Spostamento non riuscito", variant: "destructive" }); }
  };

  const moveFolder = async (folder, newParent) => {
    if (newParent === folder.id || descendants(folder.id, folders).some((d) => d.id === newParent)) {
      toast({ title: "Non puoi spostare una cartella dentro sé stessa", variant: "destructive" });
      return;
    }
    const f = await db.DocumentFolder.update(folder.id, { parent_id: newParent || null });
    setFolders((l) => l.map((x) => (x.id === f.id ? f : x)));
    toast({ title: "Cartella spostata" });
  };

  const deleteDocs = async (list) => {
    if (!confirm(list.length === 1 ? `Eliminare "${list[0].titolo}"?` : `Eliminare ${list.length} documenti?`)) return;
    try {
      for (const d of list) { await deleteRemindersForDoc(d.id).catch(() => null); await db.CompanyDocument.delete(d.id); }
      const ids = new Set(list.map((d) => d.id));
      setDocs((all) => all.filter((d) => !ids.has(d.id)));
      setSelected(new Set());
      if (ids.has(detailId)) setDetailId(null);
      toast({ title: list.length === 1 ? "Documento eliminato" : `${list.length} documenti eliminati` });
    } catch (e) { toast({ title: "Errore", variant: "destructive" }); load(); }
  };

  const toggleSel = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const onDragDoc = (e, id) => {
    const ids = selected.has(id) ? [...selected] : [id];
    e.dataTransfer.setData("application/x-talo-docs", JSON.stringify(ids));
    e.dataTransfer.effectAllowed = "move";
  };

  if (loading) return <LoadingSpinner />;

  const title = searching ? `Risultati per "${query}"` : currentFolderId ? crumbs.at(-1)?.nome : VIEWS.find((v) => v.key === view.key)?.label;
  const activeQueue = queue.some((x) => ["wait", "upload", "ai"].includes(x.status));

  const sidebar = (
    <nav className="space-y-4">
      <ul className="space-y-0.5">
        {VIEWS.map((v) => (
          <li key={v.key}>
            <button onClick={() => openView(v.key)} className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${view.type === "view" && view.key === v.key ? "bg-brand-50 text-brand-800 font-medium" : "text-slate-700 hover:bg-slate-100"}`}>
              <v.icon className={`w-4 h-4 ${v.key === "expired" && viewCounts.expired ? "text-red-600" : v.key === "expiring" && viewCounts.expiring ? "text-amber-600" : ""}`} />
              <span className="flex-1 text-left">{v.label}</span>
              {viewCounts[v.key] > 0 && <span className={`text-xs tabular-nums ${v.key === "expired" ? "text-red-600 font-semibold" : "text-slate-500"}`}>{viewCounts[v.key]}</span>}
            </button>
          </li>
        ))}
      </ul>
      <div>
        <div className="flex items-center justify-between px-2 mb-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cartelle</p>
          <button onClick={() => setFolderDlg({ mode: "new", parentId: null })} className="p-1 rounded hover:bg-slate-100 text-slate-500" aria-label="Nuova cartella"><FolderPlus className="w-4 h-4" /></button>
        </div>
        {folders.length ? (
          <FolderTree byParent={byParent} counts={counts} currentId={currentFolderId} onOpen={openFolder} onDropDocs={moveDocs} onAction={folderAction} expanded={expanded} setExpanded={setExpanded} />
        ) : (
          <div className="px-2 py-3 text-sm text-slate-500">
            Nessuna cartella.
            <Button size="sm" variant="outline" className="mt-2 w-full gap-1.5" onClick={createStandardTree}><Wand2 className="w-4 h-4" /> Crea struttura consigliata</Button>
          </div>
        )}
      </div>
    </nav>
  );

  return (
    <div
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
      onDrop={(e) => { if (e.dataTransfer.files?.length) { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); } }}
      className="relative"
    >
      <PageHeader title="Documenti ditta" subtitle="L'archivio dell'impresa: carica qualsiasi file, l'IA lo legge, lo rinomina e lo mette nella cartella giusta." actionLabel="Carica file" onAction={() => fileInput.current?.click()} actionIcon={Upload}>
        <Button variant="outline" onClick={() => setOrganizeOpen(true)} className="gap-2" disabled={!docs.length}><Sparkles className="w-4 h-4" /> Organizza con IA</Button>
      </PageHeader>
      <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />

      <div className="grid lg:grid-cols-[250px_1fr] gap-4 items-start">
        <aside className="hidden lg:block bg-white rounded-xl border border-slate-200 p-3 sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto">{sidebar}</aside>

        <section className="min-w-0 space-y-3">
          {/* Barra strumenti */}
          <div className="bg-white rounded-xl border border-slate-200 p-2.5 flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" className="lg:hidden h-9 w-9" onClick={() => setTreeOpen(true)} aria-label="Cartelle"><PanelLeft className="w-4 h-4" /></Button>
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={currentFolderId ? "Cerca in questa cartella…" : "Cerca per nome, contenuto, numero, cliente…"} className="pl-8 h-9" />
              {query && <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label="Cancella ricerca"><X className="w-4 h-4" /></button>}
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i tipi</SelectItem>
                {DOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => { setSort(v); savePref("sort", v); }}>
              <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Più recenti</SelectItem>
                <SelectItem value="name">Nome A–Z</SelectItem>
                <SelectItem value="expiry">Scadenza</SelectItem>
                <SelectItem value="type">Tipo</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex rounded-md border border-slate-200 overflow-hidden">
              {[["list", List], ["grid", LayoutGrid]].map(([k, I]) => (
                <button key={k} onClick={() => { setLayout(k); savePref("layout", k); }} className={`h-9 w-9 grid place-items-center ${layout === k ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`} aria-label={k === "list" ? "Elenco" : "Griglia"}><I className="w-4 h-4" /></button>
              ))}
            </div>
          </div>

          {/* Percorso */}
          <div className="flex flex-wrap items-center justify-between gap-2 min-h-9">
            <div className="flex items-center gap-1 text-sm min-w-0 flex-wrap">
              <button onClick={() => openView("all")} className="flex items-center gap-1 text-slate-500 hover:text-slate-900"><Home className="w-4 h-4" /> Archivio</button>
              {crumbs.map((c, i) => (
                <React.Fragment key={c.id}>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  <button onClick={() => openFolder(c.id)} className={i === crumbs.length - 1 ? "font-semibold text-slate-900" : "text-slate-500 hover:text-slate-900"}>{c.nome}</button>
                </React.Fragment>
              ))}
              {!crumbs.length && view.key !== "all" && <><ChevronRight className="w-3.5 h-3.5 text-slate-400" /><span className="font-semibold text-slate-900">{title}</span></>}
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer" title="Ogni file caricato viene letto, rinominato e archiviato dall'IA">
                <Switch checked={aiAuto} onCheckedChange={(v) => { setAiAuto(v); savePref("ai", v ? "1" : "0"); }} /> Archiviazione IA
              </label>
              {(currentFolderId || (view.type === "view" && view.key === "all")) && (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setFolderDlg({ mode: "new", parentId: currentFolderId })}><FolderPlus className="w-4 h-4" /> Nuova cartella</Button>
              )}
            </div>
          </div>

          {/* Coda di caricamento */}
          {queue.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-slate-800">{activeQueue ? "Caricamento in corso…" : "Caricamento completato"}</p>
                {!activeQueue && <button onClick={() => setQueue([])} className="text-xs text-slate-500 hover:text-slate-800">Chiudi</button>}
              </div>
              <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                {queue.map((x) => (
                  <li key={x.id} className="flex items-center gap-2 text-sm">
                    {x.status === "done" ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : x.status === "error" ? <XCircle className="w-4 h-4 text-red-600 shrink-0" /> : x.status === "partial" ? <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" /> : <Loader2 className="w-4 h-4 animate-spin text-brand-600 shrink-0" />}
                    <button disabled={!x.docId} onClick={() => x.docId && setDetailId(x.docId)} className="truncate text-left text-slate-800 enabled:hover:underline">{x.title || x.name}</button>
                    <span className="ml-auto text-xs text-slate-500 shrink-0 truncate max-w-[45%]">
                      {x.status === "wait" ? "In attesa" : x.status === "upload" ? "Carico…" : x.status === "ai" ? "L'IA sta leggendo…" : x.info}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Selezione multipla */}
          {selected.size > 0 && (
            <div className="bg-slate-900 text-white rounded-xl px-3 py-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{selected.size} selezionati</span>
              <Button size="sm" variant="secondary" className="h-8 gap-1.5" onClick={() => setMoveDlg({ docIds: [...selected] })}><FolderInput className="w-4 h-4" /> Sposta</Button>
              <Button size="sm" variant="secondary" className="h-8 gap-1.5" onClick={() => deleteDocs(docs.filter((d) => selected.has(d.id)))}><Trash2 className="w-4 h-4" /> Elimina</Button>
              <button onClick={() => setSelected(new Set())} className="ml-auto text-white/80 hover:text-white">Annulla</button>
            </div>
          )}

          {/* Contenuto */}
          {subfolders.length === 0 && visibleDocs.length === 0 ? (
            <Empty
              searching={searching} folder={!!currentFolderId} noDocs={!docs.length} noFolders={!folders.length}
              onUpload={() => fileInput.current?.click()} onStandard={createStandardTree}
            />
          ) : (
            <div className="space-y-3">
              {subfolders.length > 0 && (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2">
                  {subfolders.map((f) => (
                    <FolderCard key={f.id} f={f} count={counts[f.id] || 0} subs={(byParent.get(f.id) || []).length} onOpen={() => openFolder(f.id)} onDropDocs={moveDocs} />
                  ))}
                </div>
              )}
              {visibleDocs.length > 0 && (layout === "grid" ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
                  {visibleDocs.map((d) => (
                    <DocCard key={d.id} d={d} selected={selected.has(d.id)} onSelect={() => toggleSel(d.id)} onOpen={() => setDetailId(d.id)} onDragStart={(e) => onDragDoc(e, d.id)} />
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                  <div className="hidden md:grid grid-cols-[28px_1fr_150px_170px_130px] gap-3 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500 bg-slate-50">
                    <input type="checkbox" aria-label="Seleziona tutti" checked={visibleDocs.every((d) => selected.has(d.id))} onChange={(e) => setSelected(e.target.checked ? new Set(visibleDocs.map((d) => d.id)) : new Set())} />
                    <span>Nome</span><span>Tipo</span><span>{searching || !currentFolderId ? "Cartella" : "Collegato a"}</span><span>Scadenza</span>
                  </div>
                  {visibleDocs.map((d) => (
                    <DocRow key={d.id} d={d} folders={folders} showFolder={searching || !currentFolderId} selected={selected.has(d.id)} onSelect={() => toggleSel(d.id)} onOpen={() => setDetailId(d.id)} onDragStart={(e) => onDragDoc(e, d.id)} query={searching ? q : ""} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {dragging && (
        <div className="fixed inset-0 z-40 bg-brand-600/10 backdrop-blur-[1px] border-4 border-dashed border-brand-500 grid place-items-center pointer-events-none">
          <div className="bg-white rounded-xl shadow-lg px-6 py-4 text-center">
            <Upload className="w-8 h-8 text-brand-600 mx-auto" />
            <p className="mt-2 font-semibold text-slate-900">Rilascia per caricare</p>
            <p className="text-sm text-slate-600">{currentFolderId ? `In "${crumbs.at(-1)?.nome}"` : aiAuto ? "L'IA sceglierà la cartella giusta" : "Andranno in Da archiviare"}</p>
          </div>
        </div>
      )}

      <Sheet open={treeOpen} onOpenChange={setTreeOpen}>
        <SheetContent side="left" className="w-[290px] overflow-y-auto">
          <SheetHeader><SheetTitle>Archivio</SheetTitle></SheetHeader>
          <div className="mt-4">{sidebar}</div>
        </SheetContent>
      </Sheet>

      <DocumentDetailSheet
        doc={detailDoc} open={!!detailDoc} onOpenChange={(v) => !v && setDetailId(null)}
        folders={folders} contacts={contacts} employees={employees} worksites={worksites}
        onChanged={(u) => setDocs((all) => all.map((x) => (x.id === u.id ? u : x)))}
        onDelete={(d) => deleteDocs([d])}
      />

      <AiOrganizeDialog open={organizeOpen} onOpenChange={setOrganizeOpen} documents={docs} folders={folders} onApplied={load} />

      {folderDlg && <FolderDialog dlg={folderDlg} folders={folders} onClose={() => setFolderDlg(null)} onSave={saveFolder} />}

      {moveDlg && (
        <MoveDialog
          folders={folders} excludeId={moveDlg.folder?.id}
          title={moveDlg.folder ? `Sposta "${moveDlg.folder.nome}"` : `Sposta ${moveDlg.docIds.length} ${moveDlg.docIds.length === 1 ? "documento" : "documenti"}`}
          rootLabel={moveDlg.folder ? "Livello principale" : "Da archiviare (nessuna cartella)"}
          onClose={() => setMoveDlg(null)}
          onPick={async (id) => { const m = moveDlg; setMoveDlg(null); m.folder ? await moveFolder(m.folder, id) : await moveDocs(m.docIds, id); }}
        />
      )}
    </div>
  );
}

// ─── Componenti di presentazione ───

function Highlight({ text, q }) {
  if (!q) return text;
  const i = String(text).toLowerCase().indexOf(q);
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark className="bg-yellow-100 text-slate-900 rounded px-0.5">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

function snippet(d, q) {
  if (!q) return "";
  for (const t of [d.riassunto, d.contenuto_estratto, d.descrizione]) {
    const s = String(t || "");
    const i = s.toLowerCase().indexOf(q);
    if (i >= 0) return `${i > 40 ? "…" : ""}${s.slice(Math.max(0, i - 40), i + q.length + 60)}…`;
  }
  return "";
}

function DocRow({ d, folders, showFolder, selected, onSelect, onOpen, onDragStart, query }) {
  const Icon = KIND_ICON[fileKind(d)];
  const exp = expiryState(d.data_scadenza);
  const snip = snippet(d, query);
  const linked = d.worksite_nome || d.contatto_nome || d.dipendente_nome;
  return (
    <div draggable onDragStart={onDragStart} onClick={onOpen} className={`grid grid-cols-[28px_1fr] md:grid-cols-[28px_1fr_150px_170px_130px] gap-x-3 gap-y-1 px-3 py-2.5 items-center cursor-pointer ${selected ? "bg-brand-50" : "hover:bg-slate-50"}`}>
      <input type="checkbox" checked={selected} onClick={(e) => e.stopPropagation()} onChange={onSelect} aria-label={`Seleziona ${d.titolo}`} />
      <div className="min-w-0 flex items-center gap-2.5">
        <Icon className="w-5 h-5 text-slate-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate flex items-center gap-1">
            {d.preferito && <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500 shrink-0" />}
            <span className="truncate"><Highlight text={d.titolo || "Senza titolo"} q={query} /></span>
          </p>
          <p className="text-xs text-slate-500 truncate">
            {snip || [d.numero && `n. ${d.numero}`, d.emittente, formatSize(d.dimensione)].filter(Boolean).join(" · ") || d.nome_file}
          </p>
          <div className="md:hidden flex flex-wrap gap-1.5 mt-1">
            <span className="text-xs text-slate-600">{typeLabel(d.tipo)}</span>
            {exp && exp.key !== "valido" && <span className={`text-xs font-medium px-1.5 rounded ${exp.className}`}>{exp.label}</span>}
          </div>
        </div>
      </div>
      <span className="hidden md:block text-sm text-slate-600 truncate">{typeLabel(d.tipo)}</span>
      <span className="hidden md:block text-sm text-slate-600 truncate">
        {showFolder ? (d.cartella_id && folders.some((f) => f.id === d.cartella_id) ? pathLabel(d.cartella_id, folders) : <span className="text-amber-700">Da archiviare</span>) : linked || "—"}
      </span>
      <span className="hidden md:block">
        {exp ? <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${exp.className}`}>{exp.key === "valido" ? new Date(d.data_scadenza).toLocaleDateString("it-IT") : exp.label}</span> : <span className="text-sm text-slate-400">—</span>}
      </span>
    </div>
  );
}

function DocCard({ d, selected, onSelect, onOpen, onDragStart }) {
  const kind = fileKind(d);
  const Icon = KIND_ICON[kind];
  const exp = expiryState(d.data_scadenza);
  return (
    <div draggable onDragStart={onDragStart} onClick={onOpen} className={`relative bg-white rounded-xl border overflow-hidden cursor-pointer transition-shadow hover:shadow-md ${selected ? "border-brand-600 ring-1 ring-brand-600" : "border-slate-200"}`}>
      <input type="checkbox" checked={selected} onClick={(e) => e.stopPropagation()} onChange={onSelect} className="absolute top-2 left-2 z-10" aria-label={`Seleziona ${d.titolo}`} />
      <div className="h-28 bg-slate-50 grid place-items-center border-b border-slate-100 overflow-hidden">
        {kind === "image" ? <img src={d.file_url} alt="" loading="lazy" className="w-full h-full object-cover" /> : <Icon className="w-10 h-10 text-slate-300" />}
      </div>
      <div className="p-2.5">
        <p className="text-sm font-medium text-slate-900 line-clamp-2 leading-snug">{d.titolo}</p>
        <p className="text-xs text-slate-500 mt-0.5 truncate">{typeLabel(d.tipo)}</p>
        {exp && exp.key !== "valido" && <span className={`inline-block mt-1.5 text-xs font-medium px-1.5 py-0.5 rounded ${exp.className}`}>{exp.label}</span>}
      </div>
    </div>
  );
}

function FolderCard({ f, count, subs, onOpen, onDropDocs }) {
  const [over, setOver] = useState(false);
  return (
    <button
      onClick={onOpen}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("application/x-talo-docs")) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); const ids = JSON.parse(e.dataTransfer.getData("application/x-talo-docs") || "[]"); if (ids.length) onDropDocs(ids, f.id); }}
      className={`flex items-center gap-3 bg-white rounded-xl border p-3 text-left hover:border-slate-300 hover:shadow-sm transition ${over ? "border-brand-500 ring-2 ring-brand-500" : "border-slate-200"}`}
    >
      <div className="w-10 h-10 rounded-lg grid place-items-center shrink-0" style={{ background: `${f.colore || "#2563eb"}14` }}>
        <Folder className="w-5 h-5" style={{ color: f.colore || "#2563eb" }} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">{f.nome}</p>
        <p className="text-xs text-slate-500">{count} file{subs ? ` · ${subs} ${subs === 1 ? "cartella" : "cartelle"}` : ""}</p>
      </div>
    </button>
  );
}

function Empty({ searching, folder, noDocs, noFolders, onUpload, onStandard }) {
  return (
    <div className="bg-white rounded-xl border border-dashed border-slate-300 py-14 px-6 text-center">
      <Folder className="w-10 h-10 text-slate-300 mx-auto" />
      <p className="mt-3 font-semibold text-slate-900">{searching ? "Nessun risultato" : folder ? "Cartella vuota" : noDocs ? "L'archivio è vuoto" : "Nessun documento qui"}</p>
      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
        {searching ? "Prova con un'altra parola: la ricerca guarda anche dentro il testo dei documenti." : "Trascina qui i file o caricali: PDF, foto, scansioni, Excel, Word. Con l'archiviazione IA attiva vengono letti e messi in ordine da soli."}
      </p>
      {!searching && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button onClick={onUpload} className="bg-brand-600 hover:bg-brand-700 gap-2"><Upload className="w-4 h-4" /> Carica file</Button>
          {noFolders && <Button variant="outline" onClick={onStandard} className="gap-2"><Wand2 className="w-4 h-4" /> Crea struttura consigliata</Button>}
        </div>
      )}
    </div>
  );
}

function FolderDialog({ dlg, folders, onClose, onSave }) {
  const [nome, setNome] = useState(dlg.folder?.nome || "");
  const parent = folders.find((f) => f.id === (dlg.folder?.parent_id || dlg.parentId));
  const [colore, setColore] = useState(dlg.folder?.colore || parent?.colore || FOLDER_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => { e.preventDefault(); if (!nome.trim()) return; setBusy(true); await onSave({ nome: cleanFolderName(nome), colore }); setBusy(false); };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{dlg.mode === "new" ? "Nuova cartella" : "Modifica cartella"}</DialogTitle>
          {parent && <DialogDescription>Dentro: {pathLabel(parent.id, folders)}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div><Label>Nome</Label><Input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} /></div>
          <div>
            <Label>Colore</Label>
            <div className="flex gap-2 mt-1.5">
              {FOLDER_COLORS.map((c) => (
                <button type="button" key={c} onClick={() => setColore(c)} className={`w-7 h-7 rounded-full ${colore === c ? "ring-2 ring-offset-2 ring-slate-900" : ""}`} style={{ background: c }} aria-label={`Colore ${c}`} />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
            <Button type="submit" disabled={!cleanFolderName(nome) || busy} className="bg-brand-600 hover:bg-brand-700">{busy && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}Salva</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MoveDialog({ folders, excludeId, title, rootLabel, onClose, onPick }) {
  const [filter, setFilter] = useState("");
  const banned = new Set(excludeId ? [excludeId, ...descendants(excludeId, folders).map((f) => f.id)] : []);
  const options = folders.filter((f) => !banned.has(f.id)).map((f) => ({ id: f.id, label: pathLabel(f.id, folders), colore: f.colore }))
    .sort((a, b) => a.label.localeCompare(b.label, "it"))
    .filter((o) => o.label.toLowerCase().includes(filter.toLowerCase()));
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <Input autoFocus placeholder="Cerca cartella…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="max-h-[50vh] overflow-y-auto -mx-2">
          <button onClick={() => onPick("")} className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left hover:bg-slate-100"><Inbox className="w-4 h-4 text-slate-500" /> {rootLabel}</button>
          {options.map((o) => (
            <button key={o.id} onClick={() => onPick(o.id)} className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left hover:bg-slate-100">
              <Folder className="w-4 h-4 shrink-0" style={{ color: o.colore || "#2563eb" }} /> <span className="truncate">{o.label}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
