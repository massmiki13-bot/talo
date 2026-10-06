import React, { useState, useEffect, useRef, useMemo } from "react";
import { db } from "@/lib/db";
import { isEmail } from "@/lib/email";
import { X, User, Building2, HardHat, History, ShieldCheck } from "lucide-react";

// Rubrica condivisa: clienti/fornitori (email e PEC), dipendenti, indirizzi usati.
let bookPromise = null;
export function loadAddressBook(force = false) {
  if (!bookPromise || force) {
    bookPromise = (async () => {
      const [contacts, employees, messages] = await Promise.all([
        db.Contact.list("-updated_date", 1000).catch(() => []),
        db.Employee.list("-updated_date", 500).catch(() => []),
        db.EmailMessage.filter({ direzione: "out" }, "-created_date", 300).catch(() => []),
      ]);
      const map = new Map();
      const add = (email, entry) => {
        const e = String(email || "").trim().toLowerCase();
        if (!isEmail(e) || map.has(e)) return;
        map.set(e, { email: e, ...entry });
      };
      contacts.forEach((c) => {
        const name = c.nome || c.nome_privato || "";
        add(c.email, { name, kind: c.tipo === "fornitore" ? "fornitore" : "cliente", contactId: c.id });
        add(c.pec, { name, kind: "pec", contactId: c.id });
      });
      employees.forEach((e) => add(e.email, { name: `${e.nome || ""} ${e.cognome || ""}`.trim(), kind: "dipendente" }));
      messages.forEach((m) => [...(m.to || []), ...(m.cc || [])].forEach((a) => add(a, { name: "", kind: "recente" })));
      return [...map.values()];
    })();
  }
  return bookPromise;
}

const KIND = {
  cliente: { icon: User, label: "Cliente" },
  fornitore: { icon: Building2, label: "Fornitore" },
  dipendente: { icon: HardHat, label: "Dipendente" },
  pec: { icon: ShieldCheck, label: "PEC" },
  recente: { icon: History, label: "Usato di recente" },
};

export default function RecipientInput({ label, value = [], onChange, placeholder, autoFocus, id }) {
  const [text, setText] = useState("");
  const [book, setBook] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { loadAddressBook().then(setBook).catch(() => {}); }, []);

  useEffect(() => {
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) { commit(); setOpen(false); } };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  });

  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    return book
      .filter((b) => !value.includes(b.email) && (b.email.includes(q) || b.name.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [text, book, value]);

  const addEmails = (raw) => {
    const parts = String(raw).split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const valid = parts.filter(isEmail).filter((e) => !value.includes(e));
    if (valid.length) onChange([...value, ...valid]);
    return parts.length === valid.length || parts.every((p) => value.includes(p) || isEmail(p));
  };

  const commit = () => {
    if (!text.trim()) return;
    if (addEmails(text)) setText("");
  };

  const pick = (entry) => {
    onChange([...value, entry.email]);
    setText("");
    setOpen(false);
    inputRef.current?.focus();
  };

  const onKeyDown = (e) => {
    if (open && suggestions.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, suggestions.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter" || e.key === "Tab") {
        if (text.trim()) { e.preventDefault(); pick(suggestions[active] || suggestions[0]); return; }
      }
    }
    if (["Enter", ",", ";"].includes(e.key) && text.trim()) { e.preventDefault(); commit(); return; }
    if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
  };

  const nameOf = (email) => book.find((b) => b.email === email)?.name;
  const invalidText = text.trim() && !suggestions.length && text.includes("@") && !isEmail(text.trim());

  return (
    <div ref={wrapRef} className="relative">
      <div
        className="flex flex-wrap items-center gap-1.5 min-h-10 rounded-md border border-input bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {label && <span className="text-xs font-medium text-zinc-500 w-9 shrink-0">{label}</span>}
        {value.map((email) => (
          <span key={email} className="inline-flex items-center gap-1 max-w-full rounded-full bg-zinc-100 border border-zinc-200 pl-2.5 pr-1 py-0.5 text-xs text-zinc-700">
            <span className="truncate" title={email}>{nameOf(email) ? `${nameOf(email)} ‹${email}›` : email}</span>
            <button
              type="button"
              aria-label={`Rimuovi ${email}`}
              onClick={(e) => { e.stopPropagation(); onChange(value.filter((v) => v !== email)); }}
              className="rounded-full p-0.5 hover:bg-zinc-200"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          ref={inputRef}
          value={text}
          autoFocus={autoFocus}
          onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0); }}
          onKeyDown={onKeyDown}
          onPaste={(e) => {
            const t = e.clipboardData.getData("text");
            if (/[,;\s]/.test(t.trim())) { e.preventDefault(); if (!addEmails(t)) setText(t); }
          }}
          onFocus={() => setOpen(true)}
          placeholder={value.length ? "" : placeholder}
          className="flex-1 min-w-[140px] bg-transparent text-sm outline-none py-0.5"
          autoComplete="off"
        />
      </div>
      {invalidText && <p className="text-[11px] text-red-700 mt-1">Indirizzo non valido</p>}
      {open && suggestions.length > 0 && (
        <ul role="listbox" className="absolute z-50 mt-1 w-full rounded-lg border border-zinc-200 bg-white shadow-lg py-1 max-h-72 overflow-y-auto">
          {suggestions.map((s, i) => {
            const K = KIND[s.kind] || KIND.recente;
            return (
              <li
                key={s.email}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => { e.preventDefault(); pick(s); }}
                onMouseEnter={() => setActive(i)}
                className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer ${i === active ? "bg-brand-50" : ""}`}
              >
                <K.icon className="w-4 h-4 text-zinc-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  {s.name && <p className="text-sm text-zinc-800 truncate">{s.name}</p>}
                  <p className={`truncate ${s.name ? "text-xs text-zinc-500" : "text-sm text-zinc-800"}`}>{s.email}</p>
                </div>
                <span className="text-[10px] uppercase tracking-wide text-zinc-500 shrink-0">{K.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
