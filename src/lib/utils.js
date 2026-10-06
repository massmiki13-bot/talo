import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
} 


export const isIframe = window.self !== window.top;

// Per righe e schede cliccabili: Invio da tastiera fa quello che fa il clic (solo se il focus è sulla riga).
export const onEnter = (fn) => (e) => { if (e.key === "Enter" && e.target === e.currentTarget) fn(); };
