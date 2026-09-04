const createRepository = (db, table, schema) => {
    const { primaryKey = 'id', timestamps = true } = schema || {};
    
    return {
        // Find all records
        findAll: (options = {}) => {
            const { orderBy = `${primaryKey} DESC`, limit, offset } = options;
            let sql = `SELECT * FROM ${table}`;
            if (orderBy) sql += ` ORDER BY ${orderBy}`;
            if (limit) sql += ` LIMIT ${limit}`;
            if (offset) sql += ` OFFSET ${offset}`;
            return db.query(sql);
        },
        
        // Find record by primary key
        findById: (id) => db.query(
            `SELECT * FROM ${table} WHERE ${primaryKey} = ?`,
            [id]
        ).then(results => results[0] || null),
        
        // Find records matching criteria
        findBy: (criteria) => {
            const conditions = Object.entries(criteria)
                .map(([key]) => `${key} = ?`)
                .join(' AND ');
            const values = Object.values(criteria);
            return db.query(
                `SELECT * FROM ${table} WHERE ${conditions}`,
                values
            );
        },
        
        // Create a new record
        create: (data) => {
            const now = new Date().toISOString();
            const record = timestamps ? { ...data, created_at: now, updated_at: now } : data;
            const keys = Object.keys(record);
            const placeholders = keys.map(() => '?').join(', ');
            const values = Object.values(record);
            
            return db.query(
                `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`,
                values
            ).then(() => db.query(
                `SELECT * FROM ${table} WHERE ${primaryKey} = last_insert_rowid()`
            )).then(results => results[0]);
        },
        
        // Update a record
        update: (id, changes) => {
            const now = new Date().toISOString();
            const record = timestamps ? { ...changes, updated_at: now } : changes;
            const sets = Object.entries(record)
                .map(([key]) => `${key} = ?`)
                .join(', ');
            const values = [...Object.values(record), id];
            
            return db.execute(
                `UPDATE ${table} SET ${sets} WHERE ${primaryKey} = ?`,
                values
            ).then(() => db.query(
                `SELECT * FROM ${table} WHERE ${primaryKey} = ?`,
                [id]
            )).then(results => results[0] || null);
        },
        
        // Delete a record
        delete: (id) => db.execute(
            `DELETE FROM ${table} WHERE ${primaryKey} = ?`,
            [id]
        ),
        
        // Count records
        count: (criteria = {}) => {
            const conditions = Object.entries(criteria)
                .map(([key]) => `${key} = ?`)
                .join(' AND ');
            const values = Object.values(criteria);
            const whereClause = conditions ? `WHERE ${conditions}` : '';
            return db.query(
                `SELECT COUNT(*) as count FROM ${table} ${whereClause}`,
                values
            ).then(results => results[0].count);
        }
    };
};

module.exports = { createRepository };

