import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { PERMISSION_MODULES, HOST_ONLY_PATHS } from "@/lib/permissions";
import { setAccessContext } from "@/lib/accessScope";

export function useCollaborator(user) {
  const [collaborator, setCollaborator] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    base44.entities.Collaborator.filter(
      { collaborator_user_id: user.id, status: "active" },
      "-created_date",
      1
    )
      .then((results) => setCollaborator(results[0] || null))
      .catch(() => setCollaborator(null))
      .finally(() => setLoading(false));
  }, [user?.id]);

  const isHost = !collaborator;
  const accessLevel = collaborator?.access_level || "responsabile";
  const permissions = collaborator?.permissions || [];
  const employeeId = collaborator?.employee_id || null;

  // Sync access context into the db scoping layer
  useEffect(() => {
    setAccessContext({
      isHost,
      accessLevel: isHost ? null : accessLevel,
      employeeId,
    });
  }, [isHost, accessLevel, employeeId]);

  const hasPermission = (key) => {
    if (isHost) return true;
    if (accessLevel === "operaio") return false;
    return permissions.includes(key);
  };

  const canAccessPath = (path) => {
    if (isHost) return true;
    if (HOST_ONLY_PATHS.some((p) => path.startsWith(p))) return false;

    if (accessLevel === "operaio") {
      // Operaio: only personal pages
      if (path === "/") return true;
      if (path === "/giornaliere") return true;
      if (path === "/ore-mensili") return true;
      if (path.startsWith("/dipendenti/")) {
        const id = path.split("/")[2];
        return id === employeeId;
      }
      return false;
    }

    // Responsabile: check module permissions
    const mod = PERMISSION_MODULES.find((m) =>
      m.path === "/" ? path === "/" : path === m.path || path.startsWith(m.path)
    );
    if (!mod) return true;
    return permissions.includes(mod.key) || (mod.legacyPerms && mod.legacyPerms.some(p => permissions.includes(p)));
  };

  return {
    collaborator,
    isHost,
    accessLevel,
    permissions,
    employeeId,
    hasPermission,
    canAccessPath,
    loading,
  };
}