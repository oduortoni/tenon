/**
 * Database interface
 * Each database implementation must provide these functions
 */
const createDatabase = (implementation) => ({
    query: implementation.query,
    execute: implementation.execute,
    get: implementation.get,
    transaction: implementation.transaction,
    close: implementation.close
});

module.exports = { createDatabase };
