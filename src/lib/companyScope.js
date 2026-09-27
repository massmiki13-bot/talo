// Single-company app: no scoping needed.
// These are kept as no-ops for backward compatibility with db.js.

export function scoped(filter = {}) {
  return filter;
}

export function withCompany(data = {}) {
  return data;
}