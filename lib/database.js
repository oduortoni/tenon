/**
 * Database interface
 * Each database implementation must provide these functions
 */
const DatabaseInterface = {
    // Execute a query and return results
    query: async (sql, params = []) => {
        throw new Error('Not implemented');
    },
    
    // Execute a query without returning results
    execute: async (sql, params = []) => {
        throw new Error('Not implemented');
    },
    
    // Execute multiple operations in a transaction
    transaction: async (operations) => {
        throw new Error('Not implemented');
    },
    
    // Close the database connection
    close: async () => {
        throw new Error('Not implemented');
    }
};

// Create a database instance
const createDatabase = (implementation) => ({
    query: implementation.query,
    execute: implementation.execute,
    transaction: implementation.transaction,
    close: implementation.close
});

module.exports = { createDatabase };

