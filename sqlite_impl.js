// SQLite implementation of the database interface

const { DatabaseSync } = require('node:sqlite');
const { createDatabase } = require('./lib/database');
// Create or open the database file
// Note: Ensure the "./database" folder already exists in your project directories!
const db = new DatabaseSync('./database/tonis.db');

/**
* A function that creates a database interface
*/
function getSqliteImplementationDatabase() {
    const database = createDatabase(
        {
            query: async (sql, params = []) => {
                try {
                    const stmt = db.prepare(sql);
                    // .all(params) executes the statement and returns rows as an array
                    return stmt.all(...params);
                } catch (err) {
                    throw err;
                }
            },
            execute: async (sql, params = []) => {
                try {
                    const stmt = db.prepare(sql);
                    // .run(params) executes write operations (INSERT/UPDATE/DELETE)
                    const result = stmt.run(...params);
                    
                    // To mimic the sqlite3 library's `this` object context:
                    return {
                        lastInsertRowid: result.lastInsertRowid,
                        changes: result.changes
                    };
                } catch (err) {
                    throw err;
                }
            },
            transaction: async (operations) => {
                // node:sqlite has a built-in fast transaction wrapper
                // However, to keep it drop-in compatible with your existing layout:
                await database.execute('BEGIN TRANSACTION');
                try {
                    const results = [];
                    for (const op of operations) {
                        results.push(await op());
                    }
                    await database.execute('COMMIT');
                    return results;
                } catch (error) {
                    await database.execute('ROLLBACK');
                    throw error;
                }
            },
            close: async () => {
                // node:sqlite closes synchronously, we wrap it in a resolved Promise
                db.close();
                return;
            }
        }
    );
    return database;
}


module.exports = {
    getSqliteImplementationDatabase
};

