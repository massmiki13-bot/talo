import React, { useState, useEffect } from "react";
import { db } from "@/lib/db";
import { useToast } from "@/components/ui/use-toast";
import { StickyNote, Save, Loader2 } from "lucide-react";

export default function WorksiteQuickNotes({ worksite }) {
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (worksite) setNotes(worksite.note_veloci || "");
  }, [worksite]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await db.Worksite.update(worksite.id, { note_veloci: notes });
      toast({ title: "Note salvate" });
    } catch (e) { toast({ title: "Errore", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
          <StickyNote className="w-4 h-4 text-amber-500" /> Note Veloci
        </h3>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Salva
        </button>
      </div>
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Accordi col cliente, problemi, promemoria interni…"
        className="w-full border border-zinc-200 rounded-lg p-3 text-sm min-h-[100px] resize-y focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
      />
    </div>
  );
}