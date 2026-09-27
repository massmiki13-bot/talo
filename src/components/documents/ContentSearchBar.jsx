import React, { useState } from "react";
import { db } from "@/lib/db";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Search, Loader2, FileText, X } from "lucide-react";
import { searchDocuments, extractDocumentText } from "@/utils/documentContent";

export default function ContentSearchBar({ documents, folders, onResultClick, onDocumentsUpdated }) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState(null);
  const { toast } = useToast();

  const handleSearch = async () => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    setSearching(true);

    // Phase 1: instant search in titles/descriptions
    let workingDocs = [...documents];
    const instantResults = searchDocuments(workingDocs, q);
    setResults(instantResults);

    // Phase 2: extract text from docs without cached content
    const docsNeedingExtraction = documents.filter((d) => d.file_url && !d.contenuto_estratto);
    if (docsNeedingExtraction.length > 0) {
      setExtracting(true);
      setExtractProgress({ current: 0, total: docsNeedingExtraction.length });

      for (let i = 0; i < docsNeedingExtraction.length; i++) {
        const doc = docsNeedingExtraction[i];
        try {
          const text = await extractDocumentText(doc.file_url);
          await db.CompanyDocument.update(doc.id, { contenuto_estratto: text });
          workingDocs = workingDocs.map((d) =>
            d.id === doc.id ? { ...d, contenuto_estratto: text } : d
          );
        } catch (e) {
          console.error("Extraction failed for", doc.id, e);
        }
        setExtractProgress({ current: i + 1, total: docsNeedingExtraction.length });
      }
      setExtracting(false);

      // Notify parent to reload docs (so cached text is available next time)
      if (onDocumentsUpdated) onDocumentsUpdated();

      // Phase 3: search again with all content
      const allResults = searchDocuments(workingDocs, q);
      setResults(allResults);
    }

    setSearching(false);
  };

  const handleClear = () => {
    setQuery("");
    setResults(null);
  };

  const matchBadge = (type) => {
    const map = {
      contenuto: { label: "Nel contenuto", className: "bg-purple-100 text-purple-700" },
      descrizione: { label: "In descrizione", className: "bg-blue-100 text-blue-700" },
      titolo: { label: "Nel titolo", className: "bg-emerald-100 text-emerald-700" },
    };
    const config = map[type] || map.titolo;
    return <Badge variant="secondary" className={`text-xs ${config.className}`}>{config.label}</Badge>;
  };

  const getFolderName = (doc) => {
    if (!doc.cartella_id) return null;
    return folders.find((f) => f.id === doc.cartella_id)?.nome || doc.cartella_nome;
  };

  return (
    <div className="mb-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <Input
          placeholder="Cerca nei titoli, descrizioni e contenuto dei documenti…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSearch();
          }}
          className="pl-9 pr-9"
        />
        {searching ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-slate-400" />
        ) : query ? (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        ) : null}
      </div>

      {extracting && (
        <div className="mt-2 text-xs text-blue-600 flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" />
          Estrazione testo dai documenti… ({extractProgress.current}/{extractProgress.total})
          <span className="text-slate-400">— la prima ricerca può richiedere qualche minuto</span>
        </div>
      )}

      {results && results.length > 0 && (
        <div className="mt-3 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600 flex items-center justify-between">
            <span>
              {results.length} {results.length === 1 ? "risultato" : "risultati"} per "{query}"
            </span>
            <button onClick={handleClear} className="text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {results.map((r) => {
              const folderName = getFolderName(r.doc);
              return (
                <button
                  key={r.doc.id}
                  onClick={() => onResultClick(r.doc)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span className="text-sm font-medium text-slate-900">{r.doc.titolo}</span>
                    {matchBadge(r.matchType)}
                    {folderName && (
                      <Badge variant="outline" className="text-xs text-slate-500">
                        {folderName}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{r.snippet}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {results && results.length === 0 && !searching && (
        <div className="mt-3 text-center py-6 text-sm text-slate-500 bg-white rounded-xl border border-slate-200">
          Nessun risultato per "{query}"
        </div>
      )}
    </div>
  );
}