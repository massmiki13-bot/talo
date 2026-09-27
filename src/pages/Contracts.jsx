import React, { useState, useEffect } from "react";
import { db } from "@/lib/db";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { FileSignature, FileDown, Eye, Trash2, Copy, Plus, Mail, CalendarClock } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { contractTypes, buildBody } from "@/utils/contractTemplates";
import { fillTemplate, generateContractPDF, generateContractWord, generateContractPDFBlob } from "@/utils/docExportUtils";
import EmailComposer from "@/components/shared/EmailComposer";
import ContractFormDialog from "@/components/contracts/ContractFormDialog";
import ContractPreviewDialog from "@/components/contracts/ContractPreviewDialog";
import ExportFormatDialog from "@/components/contracts/ExportFormatDialog";
import EditContractScadenzaDialog from "@/components/contracts/EditContractScadenzaDialog";
import { getExpirationStatus } from "@/utils/expirationReminders";

export default function Contracts() {
  const [contracts, setContracts] = useState([]);
  const [customTemplates, setCustomTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewDialog, setPreviewDialog] = useState(false);
  const [previewContract, setPreviewContract] = useState(null);
  const [previewProfile, setPreviewProfile] = useState(null);
  const [previewMode, setPreviewMode] = useState("saved");
  const [pendingFormData, setPendingFormData] = useState(null);
  const [exportDialog, setExportDialog] = useState(false);
  const [exportContract, setExportContract] = useState(null);
  const [emailComposer, setEmailComposer] = useState(false);
  const [emailAttachment, setEmailAttachment] = useState(null);
  const [emailDefaults, setEmailDefaults] = useState({ to: "", subject: "", body: "" });
  const [scadenzaContract, setScadenzaContract] = useState(null);
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setContracts(await db.GeneratedContract.list("-created_date"));
      setCustomTemplates(await db.ContractTemplate.list());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const allTypes = [
    ...contractTypes,
    ...customTemplates.map(t => ({ value: `custom_${t.id}`, label: t.nome })),
  ];

  const getTemplate = (type, variant) => {
    if (type?.startsWith("custom_")) {
      const t = customTemplates.find(t => `custom_${t.id}` === type);
      return t?.contenuto || "";
    }
    return buildBody(type, variant || "pro");
  };

  const buildTempContract = (tipo, variant, fields, profile) => {
    const templateText = getTemplate(tipo, variant);
    const content = fillTemplate(templateText, fields, profile);
    const typeLabel = allTypes.find(t => t.value === tipo)?.label || tipo;
    const controparte = fields.NOME_CONTROPARTE || "";
    return {
      tipo,
      titolo: `${typeLabel}${controparte ? " - " + controparte : ""}`,
      dati_compilati: fields,
      contenuto_finale: content,
      controparte_nome: controparte,
      _templateText: templateText,
    };
  };

  const handleGenerate = async ({ tipo, variant, fields, saveAsTemplate, newTemplateName }) => {
    try {
      const profiles = await db.CompanyProfile.list();
      const profile = profiles[0];
      const temp = buildTempContract(tipo, variant, fields, profile);
      await db.GeneratedContract.create({
        tipo,
        titolo: temp.titolo,
        dati_compilati: fields,
        contenuto_finale: temp.contenuto_finale,
        data_creazione: new Date().toISOString().slice(0, 10),
        controparte_nome: temp.controparte_nome,
      });
      if (saveAsTemplate && newTemplateName.trim()) {
        await db.ContractTemplate.create({
          nome: newTemplateName,
          tipo: tipo.startsWith("custom_") ? "generico" : tipo,
          contenuto: temp._templateText,
        });
        toast({ title: "Modello salvato e contratto generato", className: "bg-green-600 text-white" });
      } else {
        toast({ title: "Contratto generato", className: "bg-green-600 text-white" });
      }
      setDialogOpen(false);
      load();
    } catch (e) {
      toast({ title: "Errore nella generazione", variant: "destructive" });
    }
  };

  const handlePreview = async (formData) => {
    try {
      const { tipo, variant, fields } = formData;
      const profiles = await db.CompanyProfile.list();
      const profile = profiles[0];
      const tempContract = buildTempContract(tipo, variant, fields, profile);
      setPendingFormData(formData);
      setPreviewContract(tempContract);
      setPreviewProfile(profile);
      setPreviewMode("preview");
      setPreviewDialog(true);
    } catch (e) {
      toast({ title: "Errore nell'anteprima", variant: "destructive" });
    }
  };

  const handleConfirmSave = async () => {
    if (!pendingFormData || !previewContract) return;
    const { tipo, variant, fields, saveAsTemplate, newTemplateName } = pendingFormData;
    try {
      await db.GeneratedContract.create({
        tipo,
        titolo: previewContract.titolo,
        dati_compilati: fields,
        contenuto_finale: previewContract.contenuto_finale,
        data_creazione: new Date().toISOString().slice(0, 10),
        controparte_nome: previewContract.controparte_nome,
      });
      if (saveAsTemplate && newTemplateName.trim()) {
        await db.ContractTemplate.create({
          nome: newTemplateName,
          tipo: tipo.startsWith("custom_") ? "generico" : tipo,
          contenuto: previewContract._templateText,
        });
        toast({ title: "Modello salvato e contratto generato", className: "bg-green-600 text-white" });
      } else {
        toast({ title: "Contratto salvato", className: "bg-green-600 text-white" });
      }
      setPreviewDialog(false);
      setDialogOpen(false);
      setPendingFormData(null);
      load();
    } catch (e) {
      toast({ title: "Errore nel salvataggio", variant: "destructive" });
    }
  };

  const openSavedPreview = async (contract) => {
    try {
      const profiles = await db.CompanyProfile.list();
      setPreviewContract(contract);
      setPreviewProfile(profiles[0]);
      setPreviewMode("saved");
      setPreviewDialog(true);
    } catch (e) {
      toast({ title: "Errore", variant: "destructive" });
    }
  };

  const handleDuplicate = async (contract) => {
    try {
      await db.GeneratedContract.create({
        tipo: contract.tipo,
        titolo: `${contract.titolo} (copia)`,
        dati_compilati: contract.dati_compilati,
        contenuto_finale: contract.contenuto_finale,
        data_creazione: new Date().toISOString().slice(0, 10),
        controparte_nome: contract.controparte_nome,
      });
      load();
      toast({ title: "Contratto duplicato", className: "bg-green-600 text-white" });
    } catch (e) { toast({ title: "Errore", variant: "destructive" }); }
  };

  const handleExportPDF = async (contract) => {
    try {
      const profiles = await db.CompanyProfile.list();
      const profile = profiles[0];
      await generateContractPDF(contract, profile);
      toast({ title: "PDF generato", className: "bg-green-600 text-white" });
    } catch (e) {
      console.error(e);
      toast({ title: "Errore nella generazione del PDF", variant: "destructive" });
    }
  };

  const handleExportWord = async (contract) => {
    try {
      const profiles = await db.CompanyProfile.list();
      const profile = profiles[0];
      generateContractWord(contract, profile);
      toast({ title: "Documento Word generato", className: "bg-green-600 text-white" });
    } catch (e) {
      console.error(e);
      toast({ title: "Errore nella generazione del documento", variant: "destructive" });
    }
  };

  const openEmailSender = async (contract) => {
    try {
      const profiles = await db.CompanyProfile.list();
      const profile = profiles[0];
      const blob = await generateContractPDFBlob(contract, profile);
      setEmailAttachment({
        blob,
        filename: `Contratto_${(contract.titolo || "").replace(/[^a-zA-Z0-9_\-]/g, "_")}.pdf`,
      });
      setEmailDefaults({
        to: "",
        subject: `Contratto: ${contract.titolo || ""}`,
        body: `Gentile Cliente,\n\nIn allegato il contratto "${contract.titolo || ""}".\n\nCordiali saluti`,
      });
      setEmailComposer(true);
    } catch (e) {
      toast({ title: "Errore generazione PDF", variant: "destructive" });
    }
  };

  const openExport = (contract) => {
    setExportContract(contract);
    setExportDialog(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Eliminare questo contratto?")) return;
    await db.GeneratedContract.delete(id);
    load();
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        title="Contratti"
        subtitle="Genera documenti professionali con intestazione, logo e firma della ditta"
        actionLabel="+ Nuovo Contratto"
        onAction={() => setDialogOpen(true)}
      />

      {contracts.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title="Nessun contratto generato"
          description="Crea il tuo primo contratto scegliendo tra i modelli disponibili"
          actionLabel="+ Nuovo Contratto"
          onAction={() => setDialogOpen(true)}
        />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-3">Titolo</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-3 hidden md:table-cell">Tipo</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-3 hidden md:table-cell">Data</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-3 hidden lg:table-cell">Scadenza</th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase px-4 py-3">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contracts.map(c => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{c.titolo}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 hidden md:table-cell">{allTypes.find(t => t.value === c.tipo)?.label || c.tipo}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 hidden md:table-cell">{c.data_creazione ? new Date(c.data_creazione).toLocaleDateString("it-IT") : "—"}</td>
                  <td className="px-4 py-3 text-sm hidden lg:table-cell">
                    {c.data_scadenza ? (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        getExpirationStatus(c.data_scadenza) === "expired"
                          ? "bg-red-50 text-red-700"
                          : getExpirationStatus(c.data_scadenza) === "expiring_soon"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-slate-100 text-slate-600"
                      }`}>
                        <CalendarClock className="w-3 h-3" />
                        {new Date(c.data_scadenza).toLocaleDateString("it-IT")}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setScadenzaContract(c)} className={`p-1.5 rounded-lg hover:bg-blue-50 ${c.data_scadenza ? "text-blue-600" : "text-slate-400 hover:text-blue-600"}`} title="Gestisci scadenza"><CalendarClock className="w-4 h-4" /></button>
                      <button onClick={() => openSavedPreview(c)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600" title="Anteprima"><Eye className="w-4 h-4" /></button>
                      <button onClick={() => openExport(c)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600" title="Esporta"><FileDown className="w-4 h-4" /></button>
                      <button onClick={() => openEmailSender(c)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600" title="Invia via email"><Mail className="w-4 h-4" /></button>
                      <button onClick={() => handleDuplicate(c)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600" title="Duplica"><Copy className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600" title="Elimina"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ContractFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        customTemplates={customTemplates}
        onGenerate={handleGenerate}
        onPreview={handlePreview}
      />

      <ExportFormatDialog
        open={exportDialog}
        onOpenChange={setExportDialog}
        contract={exportContract}
        onExportPDF={handleExportPDF}
        onExportWord={handleExportWord}
      />

      <ContractPreviewDialog
        open={previewDialog}
        onOpenChange={setPreviewDialog}
        contract={previewContract}
        profile={previewProfile}
        mode={previewMode}
        onConfirm={handleConfirmSave}
      />

      <EmailComposer
        open={emailComposer}
        onOpenChange={setEmailComposer}
        defaultTo={emailDefaults.to}
        defaultSubject={emailDefaults.subject}
        defaultBody={emailDefaults.body}
        attachment={emailAttachment}
        context={emailDefaults.subject}
      />

      <EditContractScadenzaDialog
        open={!!scadenzaContract}
        onOpenChange={(open) => !open && setScadenzaContract(null)}
        contract={scadenzaContract}
        typeLabel={scadenzaContract ? (allTypes.find(t => t.value === scadenzaContract.tipo)?.label || scadenzaContract.tipo) : ""}
        onUpdated={load}
      />
    </div>
  );
}