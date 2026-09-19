const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createSQLiteAdapter } = require('../app/adapters/sqlite');
const { Schema } = require('../lib/schema');
const models = require('../app/models');
const createDefaultSchema = () => Schema(models);

// Table naming is the adapter's job — the ArticleTag→article_tags
// mapping comes from the adapter's config, not the entity.
const newAdapter = () => createSQLiteAdapter({
    filename: ':memory:',
    tables: { ArticleTag: 'article_tags' }
});

test('translateSchema emits CREATE TABLE statements for every entity', () => {
    const adapter = newAdapter();
    const schema = createDefaultSchema();
    const ddl = adapter.translateSchema(schema);

    assert.match(ddl, /CREATE TABLE IF NOT EXISTS users/);
    assert.match(ddl, /CREATE TABLE IF NOT EXISTS articles/);
    assert.match(ddl, /CREATE TABLE IF NOT EXISTS comments/);
    assert.match(ddl, /CREATE TABLE IF NOT EXISTS tags/);
    assert.match(ddl, /CREATE TABLE IF NOT EXISTS logs/);
    assert.ok((ddl.match(/CREATE TABLE/g) || []).length === 6);
});

test('translateSchema renders columns, constraints and foreign keys', () => {
    const adapter = newAdapter();
    const schema = createDefaultSchema();
    const ddl = adapter.translateSchema(schema);
    const usersDDL = ddl.match(/CREATE TABLE IF NOT EXISTS users \([\s\S]*?\);/)[0];

    assert.match(usersDDL, /id INTEGER PRIMARY KEY AUTOINCREMENT/);
    assert.match(usersDDL, /email TEXT NOT NULL UNIQUE/);
    assert.match(usersDDL, /password TEXT NOT NULL/);
    assert.match(usersDDL, /name TEXT NOT NULL/);
    assert.match(usersDDL, /role TEXT DEFAULT 'user'/);

    const articlesDDL = ddl.match(/CREATE TABLE IF NOT EXISTS articles \([\s\S]*?\);/)[0];
    assert.match(articlesDDL, /REFERENCES users\(id\)/);
});

test('translateSchema emits unique indexes for unique fields', () => {
    const adapter = newAdapter();
    const schema = createDefaultSchema();
    const ddl = adapter.translateSchema(schema);
    assert.match(ddl, /CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email/);
    assert.match(ddl, /CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_slug/);
});

test('initializeSchema creates tables that queries can use', async () => {
    const adapter = newAdapter();
    const schema = createDefaultSchema();
    await adapter.initializeSchema(schema);

    const tables = await adapter.database.query(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    );
    const names = tables.map(t => t.name);
    assert.ok(names.includes('users'));
    assert.ok(names.includes('articles'));
    assert.ok(names.includes('comments'));
    assert.ok(names.includes('tags'));
    assert.ok(names.includes('article_tags'));
});

test('initializeSchema is idempotent', async () => {
    const adapter = newAdapter();
    const schema = createDefaultSchema();
    await adapter.initializeSchema(schema);
    await adapter.initializeSchema(schema);
    const tables = await adapter.database.query(
        "SELECT name FROM sqlite_master WHERE type = 'table'"
    );
    // 6 entity tables + sqlite_sequence (AUTOINCREMENT bookkeeping)
    assert.equal(tables.length, 7);
});

test('adapter.migrate applies a raw SQL migration', async () => {
    const adapter = newAdapter();
    await adapter.migrate({ sql: 'CREATE TABLE widgets (id INTEGER PRIMARY KEY);' });

    const result = await adapter.database.query(
        "SELECT name FROM sqlite_master WHERE name = 'widgets'"
    );
    assert.equal(result.length, 1);
});

test('adapter.migrate supports function-style migrations', async () => {
    const adapter = newAdapter();
    await adapter.migrate({
        up: async ({ execute }) => {
            await execute('CREATE TABLE gadgets (id INTEGER PRIMARY KEY);');
        }
    });
    const result = await adapter.database.query(
        "SELECT name FROM sqlite_master WHERE name = 'gadgets'"
    );
    assert.equal(result.length, 1);
});

test('adapter.database exposes query, execute, get, transaction, close', () => {
    const adapter = newAdapter();
    for (const fn of ['query', 'execute', 'get', 'transaction', 'close']) {
        assert.equal(typeof adapter.database[fn], 'function', `${fn} missing`);
    }
});

test('transaction rolls back on failure', async () => {
    const adapter = newAdapter();
    const schema = createDefaultSchema();
    await adapter.initializeSchema(schema);

    /*
     * `transaction` is synchronous because SQLite's DatabaseSync is
     * synchronous. `assert.rejects` requires a function or a Promise,
     * so wrap the call in a thunk.
     */
    await assert.rejects(
        async () => adapter.database.transaction([
            () => adapter.database.execute(
                "INSERT INTO users (email, password, name) VALUES ('a@b.com', 'x', 'A')"
            ),
            () => { throw new Error('boom'); }
        ]),
        /boom/
    );

    const users = await adapter.database.query('SELECT * FROM users');
    assert.equal(users.length, 0);
});

test('adapter.migrator tracks applied versions in schema_version', async () => {
    const adapter = newAdapter();
    const m = adapter.migrator();
    const result = await m.run([
        { version: 1, sql: 'CREATE TABLE v1 (id INTEGER PRIMARY KEY);' },
        { version: 2, sql: 'CREATE TABLE v2 (id INTEGER PRIMARY KEY);' }
    ]);
    assert.equal(result.currentVersion, 2);
    assert.deepEqual(result.applied, [1, 2]);

    const rerun = await m.run([
        { version: 1, sql: 'BAD SQL;' },
        { version: 2, sql: 'BAD SQL;' }
    ]);
    assert.equal(rerun.applied.length, 0);
    assert.equal(rerun.currentVersion, 2);

    const partial = await m.run([
        { version: 1, sql: 'CREATE TABLE v3 (id INTEGER PRIMARY KEY);' },
        { version: 2, sql: 'CREATE TABLE v4 (id INTEGER PRIMARY KEY);' },
        { version: 3, sql: 'CREATE TABLE v5 (id INTEGER PRIMARY KEY);' }
    ], 3);
    assert.deepEqual(partial.applied, [3]);
    const table = await adapter.database.query(
        "SELECT name FROM sqlite_master WHERE name = 'v5'"
    );
    assert.equal(table.length, 1);
});

test('tableName computes default pluralization', () => {
    const adapter = newAdapter();
    assert.equal(adapter.tableName('User'), 'users');
    assert.equal(adapter.tableName('Tag'), 'tags');
    assert.equal(adapter.tableName('Person'), 'persons');
});

test('tableName uses config.tables override', () => {
    const adapter = newAdapter();
    assert.equal(adapter.tableName('ArticleTag'), 'article_tags');
});

