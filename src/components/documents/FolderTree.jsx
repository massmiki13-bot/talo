import React, { useState } from "react";
import { ChevronRight, Folder, FolderOpen, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// Albero delle cartelle con conteggi, apri/chiudi e rilascio dei documenti trascinati.
export default function FolderTree({ byParent, counts, currentId, onOpen, onDropDocs, onAction, parentId = null, depth = 0, expanded, setExpanded }) {
  const list = byParent.get(parentId) || [];
  if (!list.length) return null;
  return (
    <ul>
      {list.map((f) => (
        <Node key={f.id} f={f} {...{ byParent, counts, currentId, onOpen, onDropDocs, onAction, depth, expanded, setExpanded }} />
      ))}
    </ul>
  );
}

function Node({ f, byParent, counts, currentId, onOpen, onDropDocs, onAction, depth, expanded, setExpanded }) {
  const [over, setOver] = useState(false);
  const kids = byParent.get(f.id) || [];
  const open = expanded.has(f.id);
  const active = currentId === f.id;
  const toggle = (e) => {
    e.stopPropagation();
    const n = new Set(expanded);
    open ? n.delete(f.id) : n.add(f.id);
    setExpanded(n);
  };
  return (
    <li>
      <div
        onClick={() => onOpen(f.id)}
        onDragOver={(e) => { if (e.dataTransfer.types.includes("application/x-talo-docs")) { e.preventDefault(); setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const ids = JSON.parse(e.dataTransfer.getData("application/x-talo-docs") || "[]"); if (ids.length) onDropDocs(ids, f.id); }}
        className={`group flex items-center gap-1 rounded-md pr-1 py-1 text-sm cursor-pointer select-none ${active ? "bg-brand-50 text-brand-800 font-medium" : "text-slate-700 hover:bg-slate-100"} ${over ? "ring-2 ring-brand-500 bg-brand-50" : ""}`}
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        <button type="button" onClick={toggle} className={`p-0.5 rounded hover:bg-slate-200 ${kids.length ? "" : "invisible"}`} aria-label={open ? "Chiudi" : "Apri"}>
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
        {active || open ? <FolderOpen className="w-4 h-4 shrink-0" style={{ color: f.colore || "#2563eb" }} /> : <Folder className="w-4 h-4 shrink-0" style={{ color: f.colore || "#2563eb" }} />}
        <span className="truncate flex-1">{f.nome}</span>
        {counts[f.id] > 0 && <span className="text-xs text-slate-500 tabular-nums">{counts[f.id]}</span>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" onClick={(e) => e.stopPropagation()} className="p-0.5 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-slate-200" aria-label="Azioni cartella">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onAction("sub", f)}>Nuova sottocartella</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("edit", f)}>Rinomina / colore</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("move", f)}>Sposta in…</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onAction("delete", f)} className="text-red-700">Elimina cartella</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {open && kids.length > 0 && (
        <FolderTree {...{ byParent, counts, currentId, onOpen, onDropDocs, onAction, expanded, setExpanded }} parentId={f.id} depth={depth + 1} />
      )}
    </li>
  );
}
