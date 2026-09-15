const { validate } = require('./validation');
const { Types } = require('./types');

/**
 * Turns a declarative (JSON) source into an entities map.
 *
 * Only universal semantics are captured: fields, types, constraints and the
 * primary key concept. Storage-specific properties (table names, timestamps,
 * soft delete) are NOT read here — the adapter decides representation and
 * the application decides conventions.
 */
const jsonEntities = (json) => {
    const entities = {};
    for (const [name, def] of Object.entries(json.entities || {})) {
        entities[name] = {
            name,
            fields: Object.fromEntries(
                Object.entries(def.fields || {}).map(([key, f]) => [
                    key,
                    {
                        type: Types[f.type] || Types.string,
                        required: f.required || false,
                        unique: f.unique || false,
                        default: f.default || null,
                        primaryKey: f.primaryKey || false,
                        foreignKey: f.foreignKey || null,
                        validate: null
                    }
                ])
            ),
            primaryKey: def.primaryKey || 'id'
        };
    }
    return entities;
};

const Schema = (entities = {}) => ({
    entities,

    // Compose another schema (or entity map) into this one, immutably.
    // Returns a NEW schema; this one is untouched.
    merge: function (other) {
        const incoming = other && other.entities ? other.entities : (other || {});
        return Schema({
            ...this.entities,
            ...incoming
        });
    },

    register: function (entity) {
        return this.merge({ [entity.name]: entity });
    },

    registerAll: function (entitiesMap) {
        return this.merge(entitiesMap);
    },

    /**
     * Composes entities from a declarative (JSON) source into this schema,
     * returning a NEW schema. Chainable:
     *
     *     Schema(models).fromJSON(json)          — declared + json
     *     Schema.fromJSON(a).fromJSON(b)         — two json sources
     */
    fromJSON: function (json) {
        return this.merge(jsonEntities(json));
    },

    get: function (name) {
        return this.entities[name];
    },

    list: function () {
        return Object.keys(this.entities);
    },

    validate: function (entityName, data) {
        const entity = this.entities[entityName];
        if (!entity) {
            throw new Error(`Entity ${entityName} not found`);
        }
        return validate(entity, data);
    },

    repository: function (adapter, name) {
        const entity = this.entities[name];
        if (!entity) {
            throw new Error(`Entity ${name} not found`);
        }
        return adapter.generateRepository(this, entity);
    },
});

/**
 * Standalone constructor: build a schema purely from JSON.
 *
 *     const schema = Schema.fromJSON(json);
 *
 * To compose with other schemas once built, use merge/register/fromJSON.
 */
Schema.fromJSON = function(json) {
    return Schema(jsonEntities(json));
};

module.exports = { Schema };