import React, { useState, useEffect, useRef } from "react";
import { db, base44 } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Sparkles, Loader2, FileText, AlertCircle, Check, FolderPlus, Trash2, Folder } from "lucide-react";
import AiWarning from "@/components/shared/AiWarning";
import { extractDocumentText } from "@/utils/documentContent";

export default function AiReorganizeDialog({ open, onOpenChange, documents, onApplied }) {
  const [phase, setPhase] = useState("idle");
  const [extractProgress, setExtractProgress] = useState({ current: 0, total: 0 });
  const [proposedFolders, setProposedFolders] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [applying, setApplying] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [addingFolder, setAddingFolder] = useState(false);
  const { toast } = useToast();
  const startedRef = useRef(false);
  const docsRef = useRef([]);

  useEffect(() => {
    if (open) {
      startedRef.current = false;
      setPhase("idle");
      setProposedFolders([]);
      setAssignments([]);
      setAddingFolder(false);
      setNewFolderName("");
    }
  }, [open]);

  useEffect(() => {
    if (open && !startedRef.current && documents.length > 0) {
      startProcess();
    }
  }, [open, documents]);

  const startProcess = async () => {
    startedRef.current = true;
    docsRef.current = [...documents];

    if (documents.length === 0) {
      toast({ title: "Nessun documento", description: "Carica prima dei documenti", variant: "destructive" });
      onOpenChange(false);
      return;
    }

    // Phase 1: Extract content for documents that don't have it
    const docsWithoutContent = documents.filter((d) => d.file_url && !d.contenuto_estratto);
    if (docsWithoutContent.length > 0) {
      setPhase("extracting");
      setExtractProgress({ current: 0, total: docsWithoutContent.length });
      for (let i = 0; i < docsWithoutContent.length; i++) {
        const doc = docsWithoutContent[i];
        try {
          const text = await extractDocumentText(doc.file_url);
          await db.CompanyDocument.update(doc.id, { contenuto_estratto: text });
          docsRef.current = docsRef.current.map((d) => (d.id === doc.id ? { ...d, contenuto_estratto: text } : d));
        } catch (e) {
          console.error("Extraction failed for", doc.id, e);
        }
        setExtractProgress({ current: i + 1, total: docsWithoutContent.length });
      }
    }

    // Phase 2: Propose folder structure
    setPhase("proposing");
    try {
      const proposal = await proposeFolderStructure(docsRef.current);
      setProposedFolders(proposal.cartelle);
      setAssignments(proposal.assegnazioni);
      setPhase("review");
    } catch (e) {
      console.error(e);
      toast({ title: "Errore durante l'analisi IA", variant: "destructive" });
      onOpenChange(false);
    }
  };

  const proposeFolderStructure = async (docs) => {
    const docSummaries = docs
      .map((d, i) => {
        const content = (d.contenuto_estratto || "").substring(0, 500).replace(/\n/g, " ");
        return `${i + 1}. ID: "${d.id}" | Titolo: "${d.titolo}" | Tipo: ${d.tipo || "non specificato"} | Descrizione: ${d.descrizione || "nessuna"} | Anteprima contenuto: "${content}"`;
      })
      .join("\n");

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Sei un assistente che aiuta a organizzare i documenti aziendali in cartelle.

Ecco ${docs.length} documenti da organizzare:

${docSummaries}

REGOLE PER LA CREAZIONE DELLE CARTELLE:
- Analizza tutti i documenti e crea un'organizzazione in cartelle su misura, basata sul contenuto reale
- Il numero di cartelle deve essere proporzionale alla quantità e varietà dei documenti:
  * 1-5 documenti: 2-3 cartelle generali
  * 6-15 documenti: 3-5 cartelle tematiche
  * 16+ documenti: cartelle più specifiche, specialmente se ci sono gruppi omogenei numerosi
- Se ci sono molti documenti dello stesso tipo, crea una cartella dedicata
- I nomi delle cartelle devono riflettere il contenuto reale (es. "Assicurazioni", "Fatture Fornitori", "Contratti Clienti", "Certificazioni Qualità", "DURC e Documenti Legali")
- NON usare un elenco fisso: adatta le cartelle ai documenti effettivamente presenti
- Ogni documento deve essere assegnato a una cartella (usa l'indice della cartella, partendo da 0)
- Se non sei sicuro di dove collocare un documento, imposta needs_clarification=true, cartella_index=-1, e scrivi una domanda specifica in "domanda"
- Non indovinare mai: se manca un'informazione importante, chiedi

Rispondi con un JSON contenente "cartelle" (array di {nome}) e "assegnazioni" (array di {doc_id, cartella_index, needs_clarification, domanda}).`,
      response_json_schema: {
        type: "object",
        properties: {
          cartelle: {
            type: "array",
            items: {
              type: "object",
              properties: {
                nome: { type: "string", description: "Nome della cartella" },
              },
            },
          },
          assegnazioni: {
            type: "array",
            items: {
              type: "object",
              properties: {
                doc_id: { type: "string" },
                cartella_index: { type: "number", description: "Indice della cartella (0-based), o -1 se needs_clarification" },
                needs_clarification: { type: "boolean" },
                domanda: { type: "string", description: "Domanda per l'utente se needs_clarification" },
              },
            },
          },
        },
      },
    });

    const proposedFolders = (result.cartelle || []).map((c, i) => ({
      tempId: `temp-${i}`,
      nome: c.nome,
    }));

    const assignmentList = docs.map((d) => {
      const a = (result.assegnazioni || []).find((x) => x.doc_id === d.id);
      if (!a) return { doc: d, folderTempId: null, needsClarification: true, question: "Documento non analizzato dall'IA." };
      if (a.needs_clarification || a.cartella_index < 0) {
        return { doc: d, folderTempId: null, needsClarification: true, question: a.domanda || "L'IA non è sicura di dove collocare questo documento." };
      }
      const folder = proposedFolders[a.cartella_index];
      return { doc: d, folderTempId: folder?.tempId || null, needsClarification: false, question: "" };
    });

    return { cartelle: proposedFolders, assegnazioni: assignmentList };
  };

  // Review handlers
  const handleRenameFolder = (tempId, nome) => {
    setProposedFolders((prev) => prev.map((f) => (f.tempId === tempId ? { ...f, nome } : f)));
  };

  const handleMoveDoc = (docId, folderTempId) => {
    setAssignments((prev) =>
      prev.map((a) =>
        a.doc.id === docId ? { ...a, folderTempId: folderTempId || null, needsClarification: !folderTempId } : a
      )
    );
  };

  const handleAddFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    const tempId = `temp-${Date.now()}`;
    setProposedFolders((prev) => [...prev, { tempId, nome: name }]);
    setNewFolderName("");
    setAddingFolder(false);
  };

  const handleDeleteFolder = (tempId) => {
    const folder = proposedFolders.find((f) => f.tempId === tempId);
    if (!confirm(`Eliminare la cartella "${folder?.nome}"? I documenti al suo interno torneranno tra i "da collocare".`)) return;
    setProposedFolders((prev) => prev.filter((f) => f.tempId !== tempId));
    setAssignments((prev) =>
      prev.map((a) =>
        a.folderTempId === tempId
          ? { ...a, folderTempId: null, needsClarification: true, question: "Cartella eliminata. Scegli una cartella per questo documento." }
          : a
      )
    );
  };

  const handleApply = async () => {
    setApplying(true);
    try {
      const folderIdMap = {};
      for (const f of proposedFolders) {
        const created = await db.DocumentFolder.create({ nome: f.nome, ordine: 0 });
        folderIdMap[f.tempId] = created.id;
      }

      let movedCount = 0;
      for (const a of assignments) {
        if (a.folderTempId) {
          const folderId = folderIdMap[a.folderTempId];
          const folder = proposedFolders.find((f) => f.tempId === a.folderTempId);
          await db.CompanyDocument.update(a.doc.id, {
            cartella_id: folderId,
            cartella_nome: folder?.nome || "",
          });
          movedCount++;
        }
      }

      toast({
        title: "Documenti riorganizzati",
        description: `${proposedFolders.length} cartelle create, ${movedCount} documenti sistemati`,
        duration: 5000,
      });
      onApplied();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast({ title: "Errore durante il salvataggio", variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  const docsInFolder = (tempId) => assignments.filter((a) => a.folderTempId === tempId);
  const unassigned = assignments.filter((a) => !a.folderTempId);
  const uncertainCount = assignments.filter((a) => a.needsClarification).length;

  const renderFolderSelect = (assignment) => (
    <Select
      value={assignment.folderTempId || "unassigned"}
      onValueChange={(v) => handleMoveDoc(assignment.doc.id, v === "unassigned" ? null : v)}
    >
      <SelectTrigger className="h-7 text-xs w-32 flex-shrink-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="unassigned">— Da collocare —</SelectItem>
        {proposedFolders.map((f) => (
          <SelectItem key={f.tempId} value={f.tempId}>{f.nome}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) startedRef.current = false; }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600" /> Riordina con IA
          </DialogTitle>
        </DialogHeader>

        {/* Phase: Extracting */}
        {phase === "extracting" && (
          <div className="flex flex-col items-center py-12">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
            <p className="text-sm text-slate-600">
              Lettura dei documenti… ({extractProgress.current}/{extractProgress.total})
            </p>
            <p className="text-xs text-slate-400 mt-1">Sto leggendo il contenuto per decidere come organizzarli</p>
            <div className="w-full max-w-xs mt-4 bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-600 h-full transition-all duration-300"
                style={{ width: `${extractProgress.total > 0 ? (extractProgress.current / extractProgress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Phase: Proposing */}
        {phase === "proposing" && (
          <div className="flex flex-col items-center py-12">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
            <p className="text-sm text-slate-600">Sto creando l'organizzazione…</p>
            <p className="text-xs text-slate-400 mt-1">Analisi di {docsRef.current.length} documenti per proporre le cartelle migliori</p>
          </div>
        )}

        {/* Phase: Review */}
        {phase === "review" && (
          <div className="mt-4 space-y-4">
            <AiWarning className="mb-3" />

            {uncertainCount > 0 && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                  L'IA ha {uncertainCount} {uncertainCount === 1 ? "dubbio" : "dubbi"} su dove collocare{" "}
                  {uncertainCount === 1 ? "un documento" : "alcuni documenti"}. Rivedi la sezione "Da collocare".
                </p>
              </div>
            )}

            {/* Proposed folders */}
            {proposedFolders.map((folder) => {
              const docs = docsInFolder(folder.tempId);
              return (
                <div key={folder.tempId} className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2.5 flex items-center gap-2 border-b border-slate-200">
                    <Folder className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    <Input
                      value={folder.nome}
                      onChange={(e) => handleRenameFolder(folder.tempId, e.target.value)}
                      className="h-7 text-sm font-medium border-none bg-transparent shadow-none focus-visible:ring-1 flex-1 min-w-0"
                    />
                    <span className="text-xs text-slate-400 flex-shrink-0">{docs.length} doc.</span>
                    <button
                      onClick={() => handleDeleteFolder(folder.tempId)}
                      className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 flex-shrink-0"
                      title="Elimina cartella"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {docs.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-slate-400 italic">Cartella vuota</p>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {docs.map((a) => (
                        <div key={a.doc.id} className="px-4 py-2 flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <span className="text-sm text-slate-700 truncate flex-1 min-w-0">{a.doc.titolo}</span>
                          {renderFolderSelect(a)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add folder */}
            {addingFolder ? (
              <div className="flex items-center gap-2">
                <Input
                  autoFocus
                  placeholder="Nome nuova cartella..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onBlur={handleAddFolder}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddFolder();
                    if (e.key === "Escape") { setAddingFolder(false); setNewFolderName(""); }
                  }}
                  className="h-8 text-sm"
                />
              </div>
            ) : (
              <button
                onClick={() => setAddingFolder(true)}
                className="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600 transition-colors"
              >
                <FolderPlus className="w-4 h-4" /> Aggiungi cartella
              </button>
            )}

            {/* Unassigned documents */}
            {unassigned.length > 0 && (
              <div className="border border-amber-200 rounded-lg overflow-hidden">
                <div className="bg-amber-50 px-4 py-2.5 flex items-center gap-2 border-b border-amber-200">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span className="text-sm font-medium text-amber-800">Da collocare ({unassigned.length})</span>
                </div>
                <div className="divide-y divide-amber-50">
                  {unassigned.map((a) => (
                    <div key={a.doc.id} className="px-4 py-2.5">
                      {a.needsClarification && a.question && (
                        <div className="flex items-start gap-2 mb-2 bg-amber-50 rounded p-2">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-amber-700">{a.question}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span className="text-sm text-slate-700 truncate flex-1 min-w-0">{a.doc.titolo}</span>
                        {renderFolderSelect(a)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 sticky bottom-0 bg-white pb-1">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
              <Button onClick={handleApply} disabled={applying} className="bg-blue-600 hover:bg-blue-700 gap-2">
                {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Conferma e applica
              </Button>
            </div>
          </div>
        )}

        {/* Phase: Idle / no documents */}
        {phase === "idle" && (
          <div className="py-12 text-center">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-500">Preparazione analisi…</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}