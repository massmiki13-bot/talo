import React, { useState, useEffect } from "react";
import { api, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, GraduationCap, Stethoscope } from "lucide-react";
import { CORSI, VISITA, addYears, fullName } from "@/lib/employees";
import { createDocumentReminder } from "@/utils/expirationReminders";

/**
 * Registra un corso di formazione o una visita medica: la scadenza si calcola
 * dalla validità prevista dalla norma (modificabile) e crea il promemoria.
 * kind: "corso" | "visita_medica"
 */
export default function TrainingDialog({ open, onOpenChange, employee, kind = "corso", onSaved, preset }) {
  const { toast } = useToast();
  const [codice, setCodice] = useState("specifica_alto");
  const [titolo, setTitolo] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [scadenza, setScadenza] = useState("");
  const [validita, setValidita] = useState("");
  const [ente, setEnte] = useState("");
  const [esito, setEsito] = useState("Idoneo");
  const [file, setFile] = useState(null);
  const [anticipo, setAnticipo] = useState("30");
  const [saving, setSaving] = useState(false);
  const isVisit = kind === "visita_medica";

  useEffect(() => {
    if (!open) return;
    const c = preset || (isVisit ? null : "specifica_alto");
    setCodice(c || "specifica_alto");
    const corso = CORSI.find((x) => x.codice === c);
    setTitolo(isVisit ? VISITA.nome : corso?.nome || "");
    setData(new Date().toISOString().slice(0, 10));
    setValidita(String(isVisit ? VISITA.validita_anni : corso?.validita_anni ?? ""));
    setEnte(""); setEsito("Idoneo"); setFile(null); setAnticipo("30");
  }, [open, kind, preset]);

  // Scadenza = data + validità (anni), ricalcolata quando cambiano.
  useEffect(() => { setScadenza(validita ? addYears(data, validita) : ""); }, [data, validita]);

  const pickCourse = (c) => {
    setCodice(c);
    const corso = CORSI.find((x) => x.codice === c);
    setTitolo(c === "altro" ? "" : corso.nome);
    setValidita(corso.validita_anni ? String(corso.validita_anni) : "");
  };

  const save = async () => {
    if (!titolo.trim()) return toast({ title: "Indica il nome del corso", variant: "destructive" });
    setSaving(true);
    try {
      let file_url = "";
      if (file) file_url = (await api.integrations.Core.UploadFile({ file, private: true })).file_url;
      const corso = CORSI.find((x) => x.codice === codice);
      const doc = await db.EmployeeDocument.create({
        dipendente_id: employee.id,
        tipo: kind,
        corso_codice: isVisit ? "visita_medica" : codice,
        titolo: titolo.trim(),
        descrizione: isVisit ? `Giudizio: ${esito}` : [corso?.ore && `Durata ${corso.ore} ore`, ente && `Ente: ${ente}`].filter(Boolean).join(" · "),
        ente, esito: isVisit ? esito : null, ore_corso: isVisit ? null : corso?.ore ?? null,
        file_url, data_emissione: data || null, data_scadenza: scadenza || null,
      });
      if (scadenza) {
        await createDocumentReminder(titolo.trim(), scadenza, doc.id, "EmployeeDocument", isVisit ? "Visita medica" : "Corso", fullName(employee), Number(anticipo) || 0, "nessuna");
      }
      toast({ title: isVisit ? "Visita registrata" : "Corso registrato", description: scadenza ? `Scadenza ${new Date(scadenza).toLocaleDateString("it-IT")} con promemoria.` : "Nessuna scadenza." });
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isVisit ? <Stethoscope className="w-5 h-5 text-brand-600" /> : <GraduationCap className="w-5 h-5 text-brand-600" />}
            {isVisit ? "Registra visita medica" : "Registra corso di formazione"}
          </DialogTitle>
          <DialogDescription>{employee && fullName(employee)} · la scadenza si calcola in automatico, puoi correggerla.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!isVisit && (
            <div>
              <Label htmlFor="trainingdialog-corso">Corso</Label>
              <Select value={codice} onValueChange={pickCourse}>
                <SelectTrigger id="trainingdialog-corso" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CORSI.map((c) => (
                    <SelectItem key={c.codice} value={c.codice}>
                      {c.nome}{c.validita_anni ? ` · ogni ${c.validita_anni} ${c.validita_anni === 1 ? "anno" : "anni"}` : c.codice !== "altro" ? " · senza scadenza" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {(isVisit || codice === "altro") && (
            <div><Label htmlFor="trainingdialog-titolo">Titolo</Label><Input id="trainingdialog-titolo" className="mt-1" value={titolo} onChange={(e) => setTitolo(e.target.value)} /></div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1"><Label htmlFor="trainingdialog-campo">{isVisit ? "Data visita" : "Data attestato"}</Label><Input id="trainingdialog-campo" type="date" className="mt-1" value={data} onChange={(e) => setData(e.target.value)} /></div>
            <div className="col-span-1"><Label htmlFor="trainingdialog-validita-anni">Validità (anni)</Label><Input id="trainingdialog-validita-anni" type="number" min="0" className="mt-1" value={validita} onChange={(e) => setValidita(e.target.value)} placeholder="nessuna" /></div>
            <div className="col-span-1"><Label htmlFor="trainingdialog-scadenza">Scadenza</Label><Input id="trainingdialog-scadenza" type="date" className="mt-1" value={scadenza} onChange={(e) => setScadenza(e.target.value)} /></div>
          </div>
          {isVisit ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="trainingdialog-giudizio">Giudizio</Label>
                <Select value={esito} onValueChange={setEsito}>
                  <SelectTrigger id="trainingdialog-giudizio" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{["Idoneo", "Idoneo con prescrizioni", "Idoneo con limitazioni", "Temporaneamente non idoneo", "Non idoneo"].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label htmlFor="trainingdialog-medico-competente">Medico competente</Label><Input id="trainingdialog-medico-competente" className="mt-1" value={ente} onChange={(e) => setEnte(e.target.value)} /></div>
            </div>
          ) : (
            <div><Label htmlFor="trainingdialog-ente-formatore">Ente formatore</Label><Input id="trainingdialog-ente-formatore" className="mt-1" value={ente} onChange={(e) => setEnte(e.target.value)} placeholder="Es. Scuola Edile, CPT" /></div>
          )}
          <div><Label htmlFor="trainingdialog-facoltativo">{isVisit ? "Certificato di idoneità" : "Attestato"} (facoltativo)</Label><Input id="trainingdialog-facoltativo" type="file" accept="image/*,application/pdf" className="mt-1" onChange={(e) => setFile(e.target.files[0] || null)} /></div>
          {scadenza && (
            <div>
              <Label htmlFor="trainingdialog-avvisami-prima-della-scadenz">Avvisami prima della scadenza</Label>
              <Select value={anticipo} onValueChange={setAnticipo}>
                <SelectTrigger id="trainingdialog-avvisami-prima-della-scadenz" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Solo il giorno della scadenza</SelectItem>
                  <SelectItem value="14">2 settimane prima</SelectItem>
                  <SelectItem value="30">1 mese prima</SelectItem>
                  <SelectItem value="60">2 mesi prima</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}Registra</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
