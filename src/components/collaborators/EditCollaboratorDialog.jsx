import React, { useState, useEffect } from "react";
import { base44, db } from "@/lib/db";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import AccessConfigSection from "./AccessConfigSection";

export default function EditCollaboratorDialog({
  collaborator,
  open,
  onOpenChange,
  onUpdated,
}) {
  const { toast } = useToast();
  const [accessLevel, setAccessLevel] = useState(collaborator?.access_level || "responsabile");
  const [employeeId, setEmployeeId] = useState(collaborator?.employee_id || "");
  const [permissions, setPermissions] = useState(collaborator?.permissions || []);
  const [employees, setEmployees] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      db.Employee.list("-created_date", 200).then(setEmployees).catch(() => {});
    }
  }, [open]);

  const handleSave = async () => {
    if (accessLevel === "operaio" && !employeeId) {
      toast({ title: "Seleziona il dipendente da collegare", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await base44.entities.Collaborator.update(collaborator.id, {
        access_level: accessLevel,
        employee_id: accessLevel === "operaio" ? employeeId : null,
        permissions: accessLevel === "responsabile" ? permissions : [],
      });
      toast({
        title: "Permessi aggiornati",
        className: "bg-green-600 text-white",
      });
      onOpenChange(false);
      onUpdated?.();
    } catch (e) {
      toast({ title: "Errore durante il salvataggio", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Modifica Accesso -{" "}
            {collaborator?.display_name || collaborator?.email}
          </DialogTitle>
        </DialogHeader>
        <AccessConfigSection
          accessLevel={accessLevel}
          setAccessLevel={setAccessLevel}
          employeeId={employeeId}
          setEmployeeId={setEmployeeId}
          permissions={permissions}
          setPermissions={setPermissions}
          employees={employees}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvataggio..." : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}