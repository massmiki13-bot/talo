import React, { useState, useEffect } from "react";
import { api, db } from "@/lib/db";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { PERMISSION_MODULES } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import InviteDialog from "@/components/collaborators/InviteDialog";
import EditCollaboratorDialog from "@/components/collaborators/EditCollaboratorDialog";
import { UserPlus, Mail, Pencil, Ban, ShieldCheck, HardHat } from "lucide-react";

export default function Collaborators() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [collaborators, setCollaborators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = () => {
    if (!user?.id) return;
    setLoading(true);
    api.entities.Collaborator.filter(
      { host_user_id: user.id, status: "active" },
      "-created_date"
    )
      .then((collabs) => setCollaborators(collabs))
      .catch(() =>
        toast({ title: "Errore caricamento", variant: "destructive" })
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [user?.id]);

  const handleRevoke = async (collab) => {
    if (!confirm(`Revocare l'accesso a ${collab.display_name || collab.email}?`))
      return;
    try {
      await api.entities.Collaborator.update(collab.id, { status: "revoked" });
      toast({ title: "Accesso revocato", className: "bg-green-600 text-white" });
      load();
    } catch (e) {
      toast({ title: "Errore durante la revoca", variant: "destructive" });
    }
  };

  const getPermissionLabels = (perms) =>
    PERMISSION_MODULES.filter((m) => perms?.includes(m.key)).map((m) => m.label);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        title="Collaboratori"
        subtitle="Gestisci livelli di accesso e permessi dei collaboratori"
        actionLabel="Aggiungi Collaboratore"
        actionIcon={UserPlus}
        onAction={() => setInviteOpen(true)}
      />

      {collaborators.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nessun collaboratore"
          description="Invita responsabili o operai per condividere l'accesso. Potrai definire cosa possono vedere e modificare."
          actionLabel="Aggiungi Collaboratore"
          onAction={() => setInviteOpen(true)}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collaborators.map((collab) => {
            const isOperaio = collab.access_level === "operaio";
            const permLabels = getPermissionLabels(collab.permissions);
            return (
              <Card key={collab.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isOperaio ? "bg-amber-100" : "bg-blue-100"
                    }`}>
                      {isOperaio ? (
                        <HardHat className="w-5 h-5 text-amber-600" />
                      ) : (
                        <ShieldCheck className="w-5 h-5 text-blue-600" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">
                        {collab.display_name || "Collaboratore"}
                      </p>
                      <p className="text-sm text-slate-500 flex items-center gap-1 truncate">
                        <Mail className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{collab.email}</span>
                      </p>
                    </div>
                  </div>

                  <div className="mb-2">
                    <Badge variant={isOperaio ? "default" : "secondary"} className="text-xs">
                      {isOperaio ? "Operaio / Dipendente" : "Responsabile"}
                    </Badge>
                  </div>

                  {!isOperaio && permLabels.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3 min-h-[24px]">
                      {permLabels.map((label) => (
                        <Badge key={label} variant="outline" className="text-xs">
                          {label}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {isOperaio && (
                    <p className="text-xs text-slate-400 mb-3">
                      Accesso limitato ai propri dati personali
                    </p>
                  )}

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing(collab)}
                      className="flex-1"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Modifica
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => handleRevoke(collab)}
                    >
                      <Ban className="w-3.5 h-3.5" /> Revoca
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onCreated={load}
        hostUserId={user?.id}
      />
      {editing && (
        <EditCollaboratorDialog
          collaborator={editing}
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
          onUpdated={load}
        />
      )}
    </div>
  );
}