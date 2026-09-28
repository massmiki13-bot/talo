import React, { useState } from "react";
import { Folder, X, Plus } from "lucide-react";

export default function FolderTabs({
  folders,
  selectedFolderId,
  onSelectFolder,
  onCreate,
  onRename,
  onDelete,
  docCounts = {},
}) {
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");

  const handleAddConfirm = () => {
    const name = newFolderName.trim();
    if (name) onCreate(name);
    setNewFolderName("");
    setAddingFolder(false);
  };

  const handleRenameConfirm = (id) => {
    const name = editingName.trim();
    if (name) onRename(id, name);
    setEditingId(null);
  };

  const baseBtn =
    "flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5";

  return (
    <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
      <button
        onClick={() => onSelectFolder(null)}
        className={`${baseBtn} ${
          !selectedFolderId
            ? "bg-brand-600 text-white"
            : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
        }`}
      >
        <Folder className="w-3.5 h-3.5" />
        Tutti
        {docCounts.all > 0 && (
          <span className={`text-xs ${!selectedFolderId ? "text-brand-100" : "text-slate-400"}`}>
            {docCounts.all}
          </span>
        )}
      </button>

      {folders.map((f) => {
        const isSelected = selectedFolderId === f.id;
        const isEditing = editingId === f.id;
        const count = docCounts[f.id] || 0;

        if (isEditing) {
          return (
            <input
              key={f.id}
              autoFocus
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={() => handleRenameConfirm(f.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameConfirm(f.id);
                if (e.key === "Escape") setEditingId(null);
              }}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg text-sm border border-brand-300 outline-none w-36"
            />
          );
        }

        return (
          <div key={f.id} className="flex-shrink-0 flex items-center gap-0.5 group">
            <button
              onClick={() => onSelectFolder(f.id)}
              onDoubleClick={() => {
                setEditingId(f.id);
                setEditingName(f.nome);
              }}
              className={`${baseBtn} ${
                isSelected
                  ? "bg-brand-600 text-white"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
              title="Doppio click per rinominare"
            >
              <Folder className="w-3.5 h-3.5" />
              {f.nome}
              {count > 0 && (
                <span className={`text-xs ${isSelected ? "text-brand-100" : "text-slate-400"}`}>
                  {count}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                if (
                  confirm(
                    `Eliminare la cartella "${f.nome}"? I documenti al suo interno non verranno eliminati, ma rimarranno senza cartella.`
                  )
                )
                  onDelete(f.id);
              }}
              className={`p-1 rounded transition-opacity ${
                isSelected
                  ? "text-brand-100 hover:text-white opacity-100"
                  : "text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100"
              }`}
              title="Elimina cartella"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}

      {addingFolder ? (
        <input
          autoFocus
          placeholder="Nome cartella..."
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          onBlur={handleAddConfirm}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAddConfirm();
            if (e.key === "Escape") {
              setNewFolderName("");
              setAddingFolder(false);
            }
          }}
          className="flex-shrink-0 px-3 py-1.5 rounded-lg text-sm border border-brand-300 outline-none w-36"
        />
      ) : (
        <button
          onClick={() => setAddingFolder(true)}
          className={`${baseBtn} bg-white border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50 hover:border-slate-400`}
        >
          <Plus className="w-3.5 h-3.5" />
          Cartella
        </button>
      )}
    </div>
  );
}