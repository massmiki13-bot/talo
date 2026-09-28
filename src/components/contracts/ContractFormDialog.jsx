import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, Eye } from "lucide-react";
import { contractTypes, getFieldsForType, fieldDefinitions, extractFields, contractVariants } from "@/utils/contractTemplates";

export default function ContractFormDialog({
  open, onOpenChange, customTemplates, onGenerate, onPreview,
}) {
  const [selectedType, setSelectedType] = useState("determinato");
  const [variant, setVariant] = useState("pro");
  const [fields, setFields] = useState({});
  const [showOptional, setShowOptional] = useState(false);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");

  useEffect(() => {
    if (open) {
      setSelectedType("determinato");
      setVariant("pro");
      setFields({ DATA_CONTRATTO: new Date().toISOString().slice(0, 10) });
      setShowOptional(false);
      setSaveAsTemplate(false);
      setNewTemplateName("");
    }
  }, [open]);

  const allTypes = [
    ...contractTypes,
    ...customTemplates.map(t => ({ value: `custom_${t.id}`, label: t.nome })),
  ];

  const isCustom = selectedType.startsWith("custom_");

  // Per template personalizzati, estrai tutti i campi dal testo
  const customTemplateContent = isCustom
    ? customTemplates.find(t => `custom_${t.id}` === selectedType)?.contenuto || ""
    : "";

  const customFields = isCustom
    ? extractFields(customTemplateContent).filter(f => !["DITTA", "SEDE", "PIVA"].includes(f))
    : [];

  const { required, optional } = isCustom
    ? { required: [], optional: [] }
    : getFieldsForType(selectedType);

  const handleFieldChange = (key, value) => {
    setFields(prev => ({ ...prev, [key]: value }));
  };

  const handleGenerate = () => {
    onGenerate({
      tipo: selectedType,
      variant,
      fields,
      saveAsTemplate,
      newTemplateName,
    });
  };

  const handlePreview = () => {
    onPreview({
      tipo: selectedType,
      variant,
      fields,
      saveAsTemplate,
      newTemplateName,
    });
  };

  const renderField = (field, isRequired = false) => {
    const def = fieldDefinitions[field.key] || { label: field.key.replace(/_/g, " "), type: "text" };
    const label = field.label || def.label;
    const type = field.type || def.type;

    return (
      <div key={field.key} className="space-y-1">
        <Label className="text-xs font-medium text-slate-600">{label}</Label>
        {type === "textarea" ? (
          <Textarea
            value={fields[field.key] || ""}
            onChange={e => handleFieldChange(field.key, e.target.value)}
            rows={3}
            className="resize-none"
          />
        ) : (
          <Input
            type={type}
            value={fields[field.key] || ""}
            onChange={e => handleFieldChange(field.key, e.target.value)}
          />
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuovo Contratto</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Tipo contratto */}
          <div className="space-y-1">
            <Label className="text-xs font-medium text-slate-600">Tipo di Contratto</Label>
            <Select value={selectedType} onValueChange={v => { setSelectedType(v); setFields({ DATA_CONTRATTO: new Date().toISOString().slice(0, 10) }); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {allTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2.5">
            I dati della ditta (ragione sociale, sede, P.IVA) vengono inseriti automaticamente dal profilo aziendale.
          </p>

          {/* Livello di dettaglio */}
          {!isCustom && (
            <div className="space-y-2">
              <Label className="text-xs font-medium text-slate-600">Livello di Dettaglio</Label>
              <div className="grid grid-cols-3 gap-2">
                {contractVariants.map(v => (
                  <button
                    key={v.value}
                    type="button"
                    onClick={() => setVariant(v.value)}
                    className={`flex flex-col items-center gap-0.5 p-2.5 rounded-lg border text-center transition-colors ${
                      variant === v.value
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-slate-200 hover:bg-slate-50 text-slate-600"
                    }`}
                  >
                    <span className="text-xs font-semibold">{v.label}</span>
                    <span className="text-[10px] leading-tight opacity-70">{v.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Campi obbligatori */}
          {!isCustom && required.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-500"></span>
                <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Informazioni Principali</span>
              </div>
              {required.map(f => renderField(f))}
            </div>
          )}

          {/* Campi facoltativi (built-in) */}
          {!isCustom && optional.length > 0 && (
            <div className="border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setShowOptional(!showOptional)}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
              >
                {showOptional ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                Campi Facoltativi
                <span className="text-slate-400 font-normal">— compilali solo se necessario</span>
              </button>
              {showOptional && (
                <div className="space-y-3 mt-3">
                  {optional.map(renderField)}
                </div>
              )}
            </div>
          )}

          {/* Campi per template personalizzati */}
          {isCustom && customFields.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-500"></span>
                <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Campi da Compilare</span>
              </div>
              {customFields.map(fieldKey => renderField({
                key: fieldKey,
                label: (fieldDefinitions[fieldKey]?.label) || fieldKey.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
                type: (fieldDefinitions[fieldKey]?.type) || "text",
              }))}
            </div>
          )}

          {/* Salva come modello */}
          <div className="border-t border-slate-100 pt-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={saveAsTemplate} onChange={e => setSaveAsTemplate(e.target.checked)} className="w-4 h-4" />
              <span className="text-sm text-slate-700">Salva questo contratto come modello personalizzato</span>
            </label>
            {saveAsTemplate && (
              <Input
                value={newTemplateName}
                onChange={e => setNewTemplateName(e.target.value)}
                placeholder="Nome del modello"
                className="mt-2"
              />
            )}
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          {onPreview && (
            <Button variant="outline" onClick={handlePreview} className="border-brand-300 text-brand-600 hover:bg-brand-50">
              <Eye className="w-4 h-4" /> Anteprima
            </Button>
          )}
          <Button onClick={handleGenerate} className="bg-brand-600 hover:bg-brand-700">
            Genera Contratto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}