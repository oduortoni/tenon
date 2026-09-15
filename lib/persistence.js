/**
 * Persistence Contract — the adapter plug point.
 *
 * An adapter is an object that implements this contract. The framework
 * never imports the adapter; the user passes it in and composes it.
 *
 * Required interface:
 *
 *   translateSchema(schema)             -> string of DDL
 *   initializeSchema(schema)            -> Promise (creates tables)
 *   generateRepository(schema, entity)  -> repository object
 *   migrate(migration)                  -> Promise (single migration)
 *   migrator()                          -> { getCurrentVersion, setVersion, run }
 *
 *   adapter.database = {
 *       query(sql, params)              -> Promise<Row[]>
 *       execute(sql, params)            -> Promise<{ lastID, changes }>
 *       get(sql, params)                -> Promise<Row | null>
 *       transaction(operations)         -> Promise<results>
 *       close()                         -> Promise<void>
 *   }
 *
 * The framework never branches on adapter type. It calls through this
 * interface and nothing else. If the user wants to support a new
 * database, they write a new adapter that implements this contract —
 * the framework does not change.
 *
 * Example:
 *
 *   const adapter = createSQLiteAdapter({
 *       filename: './database/tonis.db',
 *       tables: { ArticleTag: 'article_tags' }
 *   });
 *
 *   adapter.initializeSchema(schema);
 *   const repo = schema.repository(adapter, 'User');
 */
const PersistenceContract = {
    translateSchema: 'function(schema) -> string of DDL',
    initializeSchema: 'function(schema) -> Promise',
    generateRepository: 'function(schema, entity) -> repository object',
    migrate: 'function(migration) -> Promise',
    migrator: 'function() -> { getCurrentVersion, setVersion, run }',
    database: {
        query: 'function(sql, params) -> Promise<Row[]>',
        execute: 'function(sql, params) -> Promise<{ lastID, changes }>',
        get: 'function(sql, params) -> Promise<Row | null>',
        transaction: 'function(operations) -> Promise<results>',
        close: 'function() -> Promise<void>'
    }
};

module.exports = { PersistenceContract };
