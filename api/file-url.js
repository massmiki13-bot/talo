// Link firmato (valido pochi minuti) per aprire o scaricare un documento dell'archivio privato.
import { handler, requireUser, admin, HttpError, rateLimit } from "./_lib/server.js";
import { privatePath, signPrivateUrl } from "./_lib/files.js";

export default handler(async (req, body) => {
  const { user, tenantId, accessLevel } = await requireUser(req);
  rateLimit(`file-url:${user.id}`, 120, 60_000);

  const urls = Array.isArray(body.urls) ? body.urls.slice(0, 50) : [body.url];
  const out = {};
  for (const url of urls) {
    const path = privatePath(url);
    if (!path) continue;
    if (path.split("/")[0] !== String(tenantId)) throw new HttpError(403, "File non accessibile");
    if (accessLevel === "operaio") {
      // L'operaio apre solo i documenti della propria scheda.
      const { data: me } = await admin().from("entity_records").select("data").eq("entity", "Collaborator").eq("tenant_id", tenantId)
        .eq("data->>collaborator_user_id", user.id).limit(1).maybeSingle();
      const employeeId = me?.data?.employee_id;
      const { data: doc } = await admin().from("entity_records").select("id").eq("entity", "EmployeeDocument").eq("tenant_id", tenantId)
        .eq("data->>dipendente_id", employeeId || "-").eq("data->>file_url", url).limit(1).maybeSingle();
      if (!doc) throw new HttpError(403, "File non accessibile");
    }
    out[url] = await signPrivateUrl(path, 600, body.download ? String(body.download).slice(0, 120) : null);
  }
  return { urls: out };
});
