/**
 * Persistence Contract — the adapter plug point.
 *
 * tenon speaks to storage through a single contract: the persistence
 * interface. The framework never imports an adapter, never branches
 * on adapter type, and never reaches beyond this surface.
 *
 * ---
 *
 * THE FRAMEWORK CONTRACT (storage-agnostic — no SQL anywhere):
 *
 *   translateSchema(schema)             -> string | object | any
 *       Renders a schema to the adapter's native format. For SQL
 *       adapters this is DDL; for MongoDB it might be collection
 *       specs; for an in-memory adapter it may return nothing at
 *       all. Pure: no side effects.
 *
 *   initializeSchema(schema)            -> Promise
 *       Applies translateSchema's output to the live store
 *       (create tables, collections, etc.).
 *
 *   generateRepository(schema, entity)  -> repository object
 *       Builds a CRUD repository for ONE entity. This is the
 *       primary thing tenon calls — see repository shape below.
 *
 *   migrate(migration)                  -> Promise
 *       Applies a single migration. Migrations are expressed in
 *       the adapter's own dialect (SQL strings, function hooks,
 *       whatever the adapter understands). The framework just calls
 *       it and trusts the adapter.
 *
 *   migrator()                          -> { getCurrentVersion, setVersion, run }
 *       Versioned migration tracking. Again, adapter-owned.
 *
 * ---
 *
 * THE REPOSITORY SHAPE (what your handlers compose against):
 *
 *   The object returned by generateRepository must implement at
 *   least:
 *
 *     findAll(options?)               -> Promise<Row[]>
 *     findById(id)                    -> Promise<Row | null>
 *     findBy(criteria)                -> Promise<Row[]>
 *     create(data)                    -> Promise<Row>
 *     update(id, changes)             -> Promise<Row | null>
 *     delete(id)                      -> Promise<void>
 *     count(criteria?)                -> Promise<number>
 *
 *   This is the only surface your route handlers ever touch.
 *   It contains zero references to SQL, collections, documents,
 *   or any storage-specific concept. That is what makes adapters
 *   genuinely swappable.
 *
 * ---
 *
 * ADAPTER-LOCAL HANDLE (escape hatch — NOT part of tenon's contract):
 *
 *   adapter.database is whatever the adapter needs to expose for
 *   the user's own ad-hoc queries. tenon never calls it. Its shape
 *   is entirely up to the adapter:
 *
 *     The SQLite adapter exposes:   { query, execute, get, transaction, close }
 *     A PostgreSQL adapter might:   { query(text, params), done() }
 *     A MongoDB adapter might:      { collection(name) }
 *     An in-memory adapter might:   { all(), run(), get() }
 *
 *   You write ad-hoc queries against adapter.database — it's your
 *   escape hatch. But your route handlers should close over a
 *   repository, not over database, so storage access stays composable
 *   and testable.
 *
 * ---
 *
 * WHAT TENON GUARANTEES:
 *
 *   - It never require()s from your app.
 *   - It never checks adapter.type / adapter.kind / instanceof.
 *   - It calls exactly the five contract methods and nothing else.
 *
 *   That is what makes adapters plug-compatible. Swap the SQLite
 *   adapter for an in-memory adapter (or PostgreSQL, or anything
 *   else) and schema.repository(adapter, name) works unchanged.
 *
 * Example:
 *
 *   const adapter = createSQLiteAdapter({
 *       filename: './database/tenon.db',
 *       tables: { ArticleTag: 'article_tags' }
 *   });
 *   await adapter.initializeSchema(schema);
 *   const repo = schema.repository(adapter, 'User');
 */
const PersistenceContract = {
    translateSchema:       'function(schema) -> adapter-native format',
    initializeSchema:      'function(schema) -> Promise',
    generateRepository:    'function(schema, entity) -> repository object',
    migrate:               'function(migration) -> Promise',
    migrator:              'function() -> { getCurrentVersion, setVersion, run }',
    // adapter.database is adapter-own (see above) — intentionally not
    // part of tenon's contract; its shape varies across adapters.
    repository: {
        findAll:           'function(options?) -> Promise<Row[]>',
        findById:          'function(id)      -> Promise<Row | null>',
        findBy:            'function(criteria) -> Promise<Row[]>',
        create:            'function(data)    -> Promise<Row>',
        update:            'function(id, changes) -> Promise<Row | null>',
        delete:            'function(id)      -> Promise<void>',
        count:             'function(criteria?) -> Promise<number>'
    }
};

module.exports = { PersistenceContract };

