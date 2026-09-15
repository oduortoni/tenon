const { test } = require('node:test');
const assert = require('node:assert/strict');

const { Types } = require('../lib/types');
const { field } = require('../lib/field');
const { entity } = require('../lib/entity');
const { validate } = require('../lib/validation');
const { Schema } = require('../lib/schema');
const models = require('../app/models');
const createDefaultSchema = () => Schema(models);

test('schema composes all registered entities', () => {
    const schema = createDefaultSchema();
    assert.deepEqual(
        schema.list(),
        ['User', 'Article', 'Comment', 'Tag', 'ArticleTag']
    );
    assert.ok(schema.get('User'));
    assert.ok(schema.get('Article'));
});

test('schema.get returns undefined for unknown entity', () => {
    const schema = createDefaultSchema();
    assert.equal(schema.get('Nope'), undefined);
});

test('entity produces only name, fields, primaryKey — no storage props', () => {
    const e = entity('Thing', {
        id: field(Types.id, { primaryKey: true }),
        label: field(Types.string)
    });
    assert.equal(e.name, 'Thing');
    assert.equal(e.primaryKey, 'id');
    assert.deepEqual(Object.keys(e), ['name', 'fields', 'primaryKey']);
    assert.ok(!('table' in e));
    assert.ok(!('timestamps' in e));
    assert.ok(!('softDelete' in e));
});

test('Schema.fromJSON entities are also minimal', () => {
    const schema = Schema.fromJSON({
        entities: { Foo: { fields: { id: { type: 'id', primaryKey: true } } } }
    });
    const foo = schema.get('Foo');
    assert.deepEqual(Object.keys(foo), ['name', 'fields', 'primaryKey']);
});

test('validation accepts valid user data', () => {
    const schema = createDefaultSchema();
    const { errors, data } = schema.validate('User', {
        email: 'toni@test.com',
        password: 'hunter2',
        name: 'Toni'
    });
    assert.deepEqual(errors, []);
    assert.equal(data.email, 'toni@test.com');
    assert.equal(data.role, 'user');
});

test('validation rejects an invalid email', () => {
    const schema = createDefaultSchema();
    const { errors } = schema.validate('User', {
        email: 'not-an-email',
        password: 'x',
        name: 'Toni'
    });
    assert.ok(errors.some(e => e.includes('email')));
});

test('validation reports missing required fields', () => {
    const schema = createDefaultSchema();
    const { errors } = schema.validate('User', {});
    assert.ok(errors.some(e => e.includes('password is required')));
    assert.ok(errors.some(e => e.includes('name is required')));
});

test('validation applies function defaults', () => {
    const schema = createDefaultSchema();
    const before = Date.now();
    const { data } = schema.validate('Article', {
        title: 'T',
        slug: 't',
        content: 'C',
        author_id: 1
    });
    assert.equal(data.status, 'draft');
    assert.ok(data.created_at instanceof Date);
    assert.ok(data.created_at.getTime() >= before);
});

test('validation respects custom field validators', () => {
    const Even = entity('Even', {
        id: field(Types.id, { primaryKey: true }),
        value: field(Types.integer, {
            validate: (v) => (v % 2 === 0 ? null : 'must be even')
        })
    });
    const e1 = validate(Even, { value: 4 });
    assert.deepEqual(e1.errors, []);
    const e2 = validate(Even, { value: 5 });
    assert.ok(e2.errors.some(err => err.includes('must be even')));
});

test('schema.validate throws for unknown entity', () => {
    const schema = createDefaultSchema();
    assert.throws(() => schema.validate('Ghost', {}), /Entity Ghost not found/);
});

test('schema.register composes schemas immutably', () => {
    const base = createDefaultSchema();
    const extra = entity('Extra', { id: field(Types.id, { primaryKey: true }) });
    const extended = base.register(extra);
    assert.equal(base.get('Extra'), undefined);
    assert.ok(extended.get('Extra'));
    assert.ok(base.get('User'));
    assert.ok(extended.get('User'));
});

test('types validate their domain sets', () => {
    assert.equal(Types.id.validate(5), true);
    assert.equal(Types.id.validate(0), false);
    assert.equal(Types.id.validate(-1), false);
    assert.equal(Types.slug.validate('hello-world'), true);
    assert.equal(Types.slug.validate(''), false);
    assert.equal(Types.email.validate('a@b.com'), true);
    assert.equal(Types.boolean.validate(true), true);
    assert.equal(Types.boolean.validate('true'), false);
    assert.equal(Types.datetime.validate(new Date()), true);
    assert.equal(Types.json.validate({ a: 1 }), true);
});

const jsonSchema = {
    entities: {
        Widget: {
            fields: {
                id: { type: 'id', primaryKey: true },
                label: { type: 'string', required: true },
                color: { type: 'string', default: 'blue' },
                size: { type: 'integer' }
            }
        }
    }
};

test('loadSchemaFromJSON builds entities we can query and validate', () => {
    const schema = Schema.fromJSON(jsonSchema);
    assert.deepEqual(schema.list(), ['Widget']);

    const { errors, data } = schema.validate('Widget', { label: 'gear' });
    assert.deepEqual(errors, []);
    assert.equal(data.label, 'gear');
    assert.equal(data.color, 'blue');
    assert.equal(data.size, undefined);
});

test('loadSchemaFromJSON flags missing required fields', () => {
    const schema = Schema.fromJSON(jsonSchema);
    const { errors } = schema.validate('Widget', { color: 'red' });
    assert.ok(errors.includes('label is required'));
});

test('loadSchemaFromJSON validates types', () => {
    const schema = Schema.fromJSON(jsonSchema);
    const { errors } = schema.validate('Widget', { label: 'x', size: 'not-a-number' });
    assert.ok(errors.some(e => e.includes('size')));
});

test('loadSchemaFromJSON defaults unknown types to string', () => {
    const schema = Schema.fromJSON({
        entities: {
            Thing: { fields: { name: { type: 'made-up-type' } } }
        }
    });
    const { data } = schema.validate('Thing', { name: 'ok' });
    assert.equal(data.name, 'ok');
    const { errors } = schema.validate('Thing', { name: 42 });
    assert.ok(errors.some(e => e.includes('name')));
});

test('fromJSON composes onto an existing schema immutably', () => {
    const base = Schema(models);
    const extended = base.fromJSON(jsonSchema);
    assert.equal(base.get('Widget'), undefined);
    assert.ok(extended.get('Widget'));
    assert.ok(extended.get('User'));
});

test('schema.merge composes two schemas into one', () => {
    const declared = Schema(models);
    const fromJson = Schema.fromJSON(jsonSchema);
    const combined = declared.merge(fromJson);
    assert.deepEqual(
        combined.list().sort(),
        ['User', 'Article', 'Comment', 'Tag', 'ArticleTag', 'Widget'].sort()
    );
});

test('Schema.fromJSON and instance .fromJSON are chainable', () => {
    const combined = Schema.fromJSON(jsonSchema).fromJSON({
        entities: {
            Gadget: { fields: { id: { type: 'id', primaryKey: true } } }
        }
    });
    assert.deepEqual(combined.list().sort(), ['Widget', 'Gadget'].sort());
});

test('loaded entities contain only universal semantics, no storage props', () => {
    const schema = Schema.fromJSON({
        entities: {
            Custom: {
                primaryKey: 'uuid',
                fields: {
                    uuid: { type: 'string', primaryKey: true }
                }
            }
        }
    });
    const entity = schema.get('Custom');
    assert.equal(entity.primaryKey, 'uuid');
    assert.deepEqual(Object.keys(entity), ['name', 'fields', 'primaryKey']);
    assert.ok(!('table' in entity));
    assert.ok(!('timestamps' in entity));
    assert.ok(!('softDelete' in entity));
});
