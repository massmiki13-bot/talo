import { api } from "@/api/client";
import { applyAccessScope } from "./accessScope";

export { api };

const UNSCOPED_ENTITIES = ["CompanyProfile", "User", "Collaborator", "CollaboratorInvite", "Branch"];

function wrapEntity(entity, entityName) {
  if (!entity) return entity;
  const isScoped = !UNSCOPED_ENTITIES.includes(entityName);
  const sf = (filter) => isScoped ? applyAccessScope(filter, entityName) : (filter || {});
  return {
    list: (sort, limit, skip) => entity.filter(sf(), sort, limit, skip),
    filter: (filter, sort, limit, skip) => entity.filter(sf(filter || {}), sort, limit, skip),
    fields: (fields, opts = {}) => entity.fields(fields, { ...opts, filter: sf(opts.filter || {}) }),
    create: (data) => entity.create(data),
    bulkCreate: (data) => entity.bulkCreate(data),
    get: (id) => entity.get(id),
    update: (id, data) => entity.update(id, data),
    delete: (id) => entity.delete(id),
    deleteMany: (filter) => entity.deleteMany(sf(filter || {})),
    updateMany: (filter, update) => entity.updateMany(sf(filter || {}), update),
    bulkUpdate: (data) => entity.bulkUpdate(data),
    subscribe: (cb) => entity.subscribe(cb),
    schema: () => entity.schema(),
  };
}

const cache = {};

export const db = /** @type {Record<string, any>} */ (new Proxy({}, {
  get(_, /** @type {string} */ name) {
    if (!cache[name]) {
      cache[name] = wrapEntity(api.entities[name], name);
    }
    return cache[name];
  }
}));
