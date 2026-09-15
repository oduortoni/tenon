/**
 * Entity definition — the framework's only view of an entity.
 *
 * The framework owns semantics that are universal across persistence layers:
 * the logical entity name, its fields, and the concept of a primary key (i.e an identity).
 *
 * Storage-specific concerns (table/collection naming, pluralization,
 * timestamps, soft delete) are NOT framework concerns. The adapter decides
 * how to represent an entity in its own storage engine. Timestamps and soft
 * delete are application conventions expressed as explicit fields.
 */
const entity = (name, fields, options = {}) => ({
    name,
    fields,
    primaryKey: options.primaryKey || 'id'
});

module.exports = { entity };
