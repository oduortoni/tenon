const { DatabaseSync } = require('node:sqlite');

/**
 * Creates a SQLite database adapter.
 *
 * @param {string} filename — Path to SQLite database file
 * @returns {Object} Database interface
 */
const createSQLiteAdapter = (config) => {
    // Create or open database connection
    const db = new DatabaseSync(config.filename);

    // SQLite configuration
    db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA foreign_keys = ON;
    `);

    // Query multiple rows
    const query = async (sql, params = []) => {
        try {
            const stmt = db.prepare(sql);
            return stmt.all(...params);
        } catch (err) {
            console.error('SQLite query error:', err);
            throw err;
        }
    };

    // Execute INSERT / UPDATE / DELETE
    const execute = async (sql, params = []) => {
        try {
            const stmt = db.prepare(sql);
            const result = stmt.run(...params);

            return {
                lastID: result.lastInsertRowid,
                changes: result.changes
            };
        } catch (err) {
            console.error('SQLite execute error:', err);
            throw err;
        }
    };

    // Get a single row
    const get = async (sql, params = []) => {
        try {
            const stmt = db.prepare(sql);
            return stmt.get(...params);
        } catch (err) {
            console.error('SQLite get error:', err);
            throw err;
        }
    };

    // Execute a group of operations atomically
    const transaction = async (operations) => {
        await execute('BEGIN TRANSACTION');

        try {
            const results = [];

            for (const operation of operations) {
                results.push(await operation());
            }

            await execute('COMMIT');

            return results;
        } catch (error) {
            try {
                await execute('ROLLBACK');
            } catch (rollbackError) {
                console.error('SQLite rollback error:', rollbackError);
            }

            throw error;
        }
    };

    // Close database connection
    const close = async () => {
        try {
            db.close();
        } catch (err) {
            console.error('SQLite close error:', err);
            throw err;
        }
    };

    // Initialize database schema
    const initSchema = async (schemaSQL) => {
        try {
            db.exec(schemaSQL);
        } catch (err) {
            console.error('SQLite schema initialization error:', err);
            throw err;
        }
    };

    return {
        // required functions by the Database interface
        database: {
            query,
            execute,
            get,
            transaction,
            close,
        },
        
        // optional for developer ergonomics
        initSchema,

        // Escape hatch for SQLite-specific functionality
        _driver: db
    };
};

module.exports = {
    createSQLiteAdapter
};

