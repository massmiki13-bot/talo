import React, { useState, useEffect, useRef } from "react";
import { db } from "@/lib/db";

// Suggerimenti email da contatti salvati e indirizzi usati in invii precedenti
export default function EmailAutocomplete({ value, onChange, placeholder }) {
  const [suggestions, setSuggestions] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [showList, setShowList] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [contacts, quotes, invoices] = await Promise.all([
          db.Contact.list("-updated_date", 200),
          db.Quote.list("-updated_date", 100),
          db.Invoice.list("-updated_date", 100),
        ]);
        const set = new Set();
        contacts.forEach(c => {
          if (c.email) set.add(c.email);
          if (c.pec) set.add(c.pec);
        });
        quotes.forEach(q => { if (q.inviato_a) set.add(q.inviato_a); });
        invoices.forEach(i => { if (i.inviato_a) set.add(i.inviato_a); });
        if (!cancelled) setSuggestions([...set].sort());
      } catch (e) { /* silenzioso */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const q = value.trim().toLowerCase();
    if (!q) { setFiltered([]); setShowList(false); return; }
    const matches = suggestions.filter(e => e.toLowerCase().includes(q) && e.toLowerCase() !== q).slice(0, 8);
    setFiltered(matches);
    setShowList(matches.length > 0);
    setActiveIndex(-1);
  }, [value, suggestions]);

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowList(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const pick = (email) => {
    onChange(email);
    setShowList(false);
  };

  const onKeyDown = (e) => {
    if (!showList) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      pick(filtered[activeIndex]);
    } else if (e.key === "Escape") {
      setShowList(false);
    }
  };

  return (
    <div className="relative" ref={wrapRef}>
      <input
        type="email"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => { if (filtered.length) setShowList(true); }}
        placeholder={placeholder}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
      />
      {showList && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-56 overflow-y-auto">
          {filtered.map((email, i) => (
            <button
              key={email}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(email); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2 ${i === activeIndex ? "bg-blue-50" : ""}`}
            >
              <span className="text-slate-400 text-xs">✉</span>
              <span className="truncate">{email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}