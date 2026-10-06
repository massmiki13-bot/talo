// Regole di accesso del database (isolamento tra aziende, ruoli, permessi per modulo).
// Girano solo contro un Supabase di prova con le migrazioni applicate, mai in produzione:
//   TALO_TEST_SUPABASE_URL=http://127.0.0.1:54321 TALO_TEST_PUBLISHABLE_KEY=… TALO_TEST_SECRET_KEY=… npm test
// Senza queste variabili i test vengono saltati.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.TALO_TEST_SUPABASE_URL;
const KEY = process.env.TALO_TEST_PUBLISHABLE_KEY;
const SECRET = process.env.TALO_TEST_SECRET_KEY;
const enabled = !!(URL && KEY && SECRET) && /127\.0\.0\.1|localhost/.test(URL || "");

describe.skipIf(!enabled)("regole di accesso (database di prova)", () => {
  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  const tag = `t${Date.now()}`;
  const password = `Pw-${tag}-Aa1!`;
  let admin, host, resp, operaio, other, employeeId;
  const users = [];

  const newUser = async (name) => {
    const email = `${name}-${tag}@talo.test`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    users.push(data.user.id);
    const client = createClient(URL, KEY, opts);
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error) throw login.error;
    client.uid = data.user.id;
    return client;
  };
  const insert = async (entity, tenant, data) => {
    const { data: row, error } = await admin.from("entity_records").insert({ entity, tenant_id: tenant, created_by_id: tenant, data }).select("id").single();
    if (error) throw error;
    return row.id;
  };
  const list = (client, entity) => client.rpc("entity_list", { p_entity: entity });

  beforeAll(async () => {
    admin = createClient(URL, SECRET, opts);
    host = await newUser("titolare");
    resp = await newUser("responsabile");
    operaio = await newUser("operaio");
    other = await newUser("altra");
    await insert("CompanyProfile", host.uid, { ragione_sociale: "Prova Srl", iban: "IT00X0000000000000000000000", obiettivo_fatturato: 1 });
    await insert("Contact", host.uid, { nome: "Cliente" });
    await insert("Quote", host.uid, { numero: "1/2026", totale: 100 });
    await insert("Invoice", host.uid, { numero: "1/2026", anno: 2026 });
    await insert("Worksite", host.uid, { nome: "Cantiere" });
    employeeId = await insert("Employee", host.uid, { nome: "Mario", cognome: "Rossi", costo_orario: 30 });
    const collab = (uid, extra) => insert("Collaborator", host.uid, { host_user_id: host.uid, collaborator_user_id: uid, status: "active", ...extra });
    await collab(resp.uid, { access_level: "responsabile", permissions: ["fatture"] });
    await collab(operaio.uid, { access_level: "operaio", employee_id: employeeId, permissions: [] });
  }, 60_000);

  afterAll(async () => {
    for (const id of users) {
      await admin.from("entity_records").delete().eq("tenant_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }, 60_000);

  it("un'altra azienda e un anonimo non leggono nulla", async () => {
    expect((await list(other, "Quote")).data).toEqual([]);
    const anon = createClient(URL, KEY, opts);
    expect((await list(anon, "Quote")).error).toBeTruthy();
    expect((await other.from("entity_records").select("id").limit(1)).error).toBeTruthy();
  });

  it("nessuno può arruolare un altro utente come proprio collaboratore", async () => {
    const r = await other.rpc("entity_create", { p_entity: "Collaborator", p_data: { collaborator_user_id: host.uid, host_user_id: other.uid, access_level: "operaio", status: "active" } });
    expect(r.error).toBeTruthy();
    expect((await host.rpc("my_access")).data.access_level).toBe("host");
  });

  it("il titolare non può cambiare l'utente di un collaboratore", async () => {
    const { data } = await list(host, "Collaborator");
    const c = data.find((x) => x.collaborator_user_id === resp.uid);
    await host.rpc("entity_update", { p_entity: "Collaborator", p_id: c.id, p_patch: { collaborator_user_id: other.uid, display_name: "x" } });
    const after = (await list(host, "Collaborator")).data.find((x) => x.id === c.id);
    expect(after.collaborator_user_id).toBe(resp.uid);
    expect(after.display_name).toBe("x");
  });

  it("il responsabile vede e modifica solo i moduli a cui è abilitato", async () => {
    expect((await list(resp, "Invoice")).data.length).toBe(1);
    expect((await list(resp, "Employee")).data).toEqual([]);
    expect((await list(resp, "SafetyPlan")).data).toEqual([]);
    expect((await resp.rpc("entity_create", { p_entity: "Employee", p_data: { nome: "x" } })).error).toBeTruthy();
    expect((await resp.rpc("entity_create", { p_entity: "CompanyProfile", p_data: { ragione_sociale: "x" } })).error).toBeTruthy();
    const made = await resp.rpc("entity_create", { p_entity: "Reminder", p_data: { titolo: "ok" } });
    expect(made.error).toBeNull();
  });

  it("l'operaio non scrive, non vede importi né i dati riservati della ditta", async () => {
    expect((await operaio.rpc("entity_create", { p_entity: "Reminder", p_data: { titolo: "x" } })).error).toBeTruthy();
    expect((await list(operaio, "Quote")).data).toEqual([]);
    const me = (await list(operaio, "Employee")).data;
    expect(me.length).toBe(1);
    expect(me[0].costo_orario).toBeUndefined();
    const profile = (await list(operaio, "CompanyProfile")).data[0];
    expect(profile.ragione_sociale).toBe("Prova Srl");
    expect(profile.iban).toBeUndefined();
    expect(profile.obiettivo_fatturato).toBeUndefined();
  });

  it("l'operaio può allegare solo file dell'archivio della propria azienda", async () => {
    const site = (await list(operaio, "Worksite")).data[0];
    const bad = await operaio.rpc("operaio_submit", { p_kind: "ddt", p_data: { worksite_id: site.id, file_url: "javascript:alert(1)" } });
    expect(bad.error).toBeTruthy();
    const foreign = await operaio.rpc("operaio_submit", { p_kind: "ddt", p_data: { worksite_id: site.id, file_url: `https://x.supabase.co/storage/v1/object/public/uploads/${other.uid}/a.pdf` } });
    expect(foreign.error).toBeTruthy();
    const ok = await operaio.rpc("operaio_submit", { p_kind: "ddt", p_data: { worksite_id: site.id, file_url: `https://x.supabase.co/storage/v1/object/public/uploads/${host.uid}/a.pdf` } });
    expect(ok.error).toBeNull();
  });

  it("un record inesistente risponde 404", async () => {
    const r = await host.rpc("entity_get", { p_entity: "Contact", p_id: "00000000-0000-0000-0000-000000000000" });
    expect(r.status).toBe(404);
  });

  it("due fatture non possono avere lo stesso numero nello stesso anno", async () => {
    const dup = await host.rpc("entity_create", { p_entity: "Invoice", p_data: { numero: "1/2026", anno: 2026 } });
    expect(dup.error?.code).toBe("23505");
  });
});
