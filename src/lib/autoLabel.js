// Collega in automatico un campo alla sua etichetta visibile quando nel codice non sono stati legati
// con htmlFor/id o aria-label: così lettori di schermo e comandi vocali annunciano il nome del campo.
import { useEffect, useRef, useCallback } from "react";

let counter = 0;
const CONTROLS = "input:not([type=hidden]), select, textarea, button[role=combobox]";

function findLabel(el) {
  let node = el;
  for (let depth = 0; depth < 3 && node?.parentElement; depth++) {
    // L'etichetta vale solo se il contenitore a questo livello ha un unico campo: mai indovinare tra più campi.
    if (depth > 0 && node.querySelectorAll(CONTROLS).length > 1) return null;
    for (let sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) {
      const label = sib.matches("label") ? sib : sib.querySelectorAll(CONTROLS).length === 0 ? sib.querySelector("label") : null;
      if (label && !label.htmlFor && label.textContent.trim()) return label;
      if (sib.querySelector(CONTROLS) || sib.matches(CONTROLS)) return null;
    }
    node = node.parentElement;
  }
  return null;
}

/** Restituisce un ref da passare al campo (compatibile con un eventuale ref ricevuto dall'esterno). */
export function useAutoLabel(forwardedRef) {
  const local = useRef(null);
  useEffect(() => {
    const el = local.current;
    if (!el || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.closest("label")) return;
    if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return;
    const label = findLabel(el);
    if (!label) return;
    if (!label.id) label.id = `etichetta-${++counter}`;
    el.setAttribute("aria-labelledby", label.id);
  }, []);
  return useCallback((node) => {
    local.current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }, [forwardedRef]);
}
