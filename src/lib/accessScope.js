// Access context module: holds the current user's access level and scoping info.
// db.js reads this to apply data-level filtering for responsabile and operaio users.

let currentAccess = {
  isHost: true,
  accessLevel: null,   // "responsabile" | "operaio" | null
  employeeId: null,    // for operaio: their Employee record id
};

export function setAccessContext(ctx) {
  currentAccess = { ...currentAccess, ...ctx };
}

export function getAccessContext() {
  return currentAccess;
}

export function applyAccessScope(filter, entityName) {
  const ctx = currentAccess;
  if (ctx.isHost) return filter || {};

  const f = { ...(filter || {}) };

  if (ctx.accessLevel === "operaio" && ctx.employeeId) {
    if (entityName === "EmployeeDocument") {
      f.dipendente_id = ctx.employeeId;
    } else if (entityName === "DailyAttendance") {
      f["presenze.dipendente_id"] = ctx.employeeId;
    } else if (entityName === "Employee") {
      f.id = ctx.employeeId;
    }
  }

  return f;
}