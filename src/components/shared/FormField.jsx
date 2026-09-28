import React, { useId } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SelectTrigger } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import AutoTextarea from "@/components/shared/AutoTextarea";

// Campi a cui collegare l'etichetta (accessibilità: clic sull'etichetta e lettori di schermo).
const CONTROLS = new Set([Input, Textarea, SelectTrigger, Switch, Checkbox, AutoTextarea, "input", "textarea", "select"]);

/** Aggiunge id (e attributi di errore) al primo campo trovato tra i figli, se non ne ha già uno. */
export function linkControl(children, id, aria = {}) {
  let done = false;
  const walk = (node) => React.Children.map(node, (child) => {
    if (done || !React.isValidElement(child)) return child;
    if (CONTROLS.has(child.type)) {
      done = true;
      return React.cloneElement(child, { id: child.props.id || id, ...aria });
    }
    if (child.props?.children) return React.cloneElement(child, undefined, walk(child.props.children));
    return child;
  });
  const out = walk(children);
  return Array.isArray(out) && out.length === 1 ? out[0] : out;
}

export default function FormField({ label, error, hint, className = "", children }) {
  const id = useId();
  const msgId = `${id}-msg`;
  const aria = error ? { "aria-invalid": true, "aria-describedby": msgId } : hint ? { "aria-describedby": msgId } : {};
  return (
    <div className={className}>
      <Label htmlFor={id} className="text-sm">{label}</Label>
      <div className="mt-1">{linkControl(children, id, aria)}</div>
      {error ? <p id={msgId} role="alert" className="text-xs text-red-600 mt-1">{error}</p> : hint ? <p id={msgId} className="text-xs text-slate-500 mt-1">{hint}</p> : null}
    </div>
  );
}
