const Types = {
    integer: { name: 'INTEGER', validate: (v) => Number.isInteger(v) },
    string: { name: 'TEXT', validate: (v) => typeof v === 'string' },
    text: { name: 'TEXT', validate: (v) => typeof v === 'string' },
    boolean: {
        name: 'INTEGER',
        validate: (v) => typeof v === 'boolean',
        toDB: (v) => v ? 1 : 0,
        fromDB: (v) => v === 1
    },
    datetime: {
        name: 'DATETIME',
        validate: (v) => v instanceof Date || typeof v === 'string',
        toDB: (v) => v instanceof Date ? v.toISOString() : v,
        fromDB: (v) => new Date(v)
    },
    json: {
        name: 'TEXT',
        validate: (v) => typeof v === 'object' || Array.isArray(v),
        toDB: (v) => JSON.stringify(v),
        fromDB: (v) => JSON.parse(v)
    },
    id: { name: 'INTEGER', validate: (v) => Number.isInteger(v) && v > 0 },
    slug: { name: 'TEXT', validate: (v) => typeof v === 'string' && v.length > 0 },
    email: { name: 'TEXT', validate: (v) => typeof v === 'string' && v.includes('@') }
};

module.exports = { Types };
