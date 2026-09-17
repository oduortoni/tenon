const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createSQLiteAdapter } = require('../app/adapters/sqlite');
const { Schema } = require('../lib/schema');
const models = require('../app/models');
const createDefaultSchema = () => Schema(models);
const { Types } = require('../lib/types');
const { field } = require('../lib/field');
const { entity } = require('../lib/entity');

const setup = async () => {
    const adapter = createSQLiteAdapter({ filename: ':memory:' });
    const schema = createDefaultSchema();
    await adapter.initializeSchema(schema);
    const users = schema.repository(adapter, 'User');
    const author = await users.create({
        email: 'author@x.com',
        password: 'p',
        name: 'Author'
    });
    return { adapter, schema, authorId: author.id };
};

const makeArticle = (overrides = {}) => ({
    title: 'T',
    slug: Math.random().toString(36).slice(2),
    content: 'c',
    ...overrides
});

test('repository.create inserts a row and returns it with an id', async () => {
    const { adapter, schema } = await setup();
    const repo = schema.repository(adapter, 'User');
    const user = await repo.create({
        email: 'a@b.com',
        password: 'hash',
        name: 'Alice'
    });
    assert.ok(user.id > 0);
    assert.equal(user.email, 'a@b.com');
});

test('repository.findById returns the row or null', async () => {
    const { adapter, schema } = await setup();
    const repo = schema.repository(adapter, 'User');
    const created = await repo.create({ email: 'x@y.com', password: 'p', name: 'X' });
    const found = await repo.findById(created.id);
    assert.equal(found.name, 'X');
    assert.equal(await repo.findById(999999), null);
});

test('repository.findAll returns all rows ordered by pk desc', async () => {
    const { adapter, schema } = await setup();
    const repo = schema.repository(adapter, 'User');
    await repo.create({ email: 'a@a.com', password: 'p', name: 'A' });
    await repo.create({ email: 'b@b.com', password: 'p', name: 'B' });
    const all = await repo.findAll();
    assert.equal(all.length, 3);
    assert.ok(all[0].id > all[1].id);
});

test('repository.findAll supports where, orderBy, limit', async () => {
    const { adapter, schema, authorId } = await setup();
    const repo = schema.repository(adapter, 'Article');
    for (let i = 1; i <= 3; i++) {
        await repo.create(makeArticle({ author_id: authorId }));
    }
    const limited = await repo.findAll({ limit: 2 });
    assert.equal(limited.length, 2);
    const filtered = await repo.findAll({ where: { status: 'draft' } });
    assert.equal(filtered.length, 3);
});

test('repository.findBy filters with criteria', async () => {
    const { adapter, schema, authorId } = await setup();
    const repo = schema.repository(adapter, 'Article');
    await repo.create(makeArticle({ slug: 'a', author_id: authorId }));
    const matches = await repo.findBy({ slug: 'a' });
    assert.equal(matches.length, 1);
    assert.equal(matches[0].title, 'T');
});

test('repository.update changes fields and refreshes row', async () => {
    const { adapter, schema } = await setup();
    const repo = schema.repository(adapter, 'User');
    const created = await repo.create({ email: 'u@u.com', password: 'p', name: 'U' });
    const updated = await repo.update(created.id, { name: 'Updated' });
    assert.equal(updated.name, 'Updated');
    assert.equal(updated.email, 'u@u.com');
});

test('repository.delete removes the row', async () => {
    const { adapter, schema } = await setup();
    const repo = schema.repository(adapter, 'User');
    const created = await repo.create({ email: 'd@d.com', password: 'p', name: 'D' });
    await repo.delete(created.id);
    assert.equal(await repo.findById(created.id), null);
});

test('repository.count tallies matching rows', async () => {
    const { adapter, schema, authorId } = await setup();
    const repo = schema.repository(adapter, 'Article');
    await repo.create(makeArticle({ slug: 'countme', author_id: authorId }));
    assert.equal(await repo.count(), 1);
    assert.equal(await repo.count({ slug: 'countme' }), 1);
    assert.equal(await repo.count({ slug: 'zzz' }), 0);
});

test('datetime types round-trip from stored text to Date', async () => {
    const { adapter, schema } = await setup();
    const repo = schema.repository(adapter, 'User');
    const created = await repo.create({ email: 'dt@dt.com', password: 'p', name: 'DT' });
    assert.ok(created.created_at instanceof Date);
    assert.ok(created.updated_at instanceof Date);
});

test('boolean field round-trips through 0/1 storage', async () => {
    const Flag = entity('Flag', {
        id: field(Types.id, { primaryKey: true }),
        active: field(Types.boolean, { required: true }),
        meta: field(Types.json)
    });
    const schema = Schema({ Flag });
    const adapter = createSQLiteAdapter({ filename: ':memory:' });
    await adapter.initializeSchema(schema);
    const repo = schema.repository(adapter, 'Flag');

    const created = await repo.create({
        active: true,
        meta: [{ a: 1 }, { b: 2 }]
    });
    assert.equal(created.active, true);
    assert.deepEqual(created.meta, [{ a: 1 }, { b: 2 }]);

    const raw = await adapter.database.query('SELECT active FROM flags WHERE id = ?', [created.id]);
    assert.equal(raw[0].active, 1);

    await repo.update(created.id, { active: false });
    assert.equal((await repo.findById(created.id)).active, false);
});

test('foreign key constraints are enforced', async () => {
    const { adapter, schema } = await setup();
    const repo = schema.repository(adapter, 'Article');
    await assert.rejects(
        repo.create({ title: 'T', slug: 't', content: 'c', author_id: 404 }),
        /FOREIGN KEY constraint failed/
    );
});

test('unique constraints are enforced', async () => {
    const { adapter, schema } = await setup();
    const repo = schema.repository(adapter, 'User');
    await repo.create({ email: 'same@same.com', password: 'p', name: 'A' });
    await assert.rejects(
        repo.create({ email: 'same@same.com', password: 'p', name: 'B' }),
        /UNIQUE constraint failed/
    );
});