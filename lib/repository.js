/**
 * Repository factory — a simple, schema-agnostic helper.
 *
 * The caller provides the storage name directly (e.g. a table name) and the
 * primary key field name. Timestamp management and any other application
 * conventions are handled by the caller, not by this helper.
 *
 * For schema-aware repositories, use adapter.generateRepository() or
 * schema.repository(adapter, name) instead.
 */
const createRepository = (db, table, config = {}) => {
    const { primaryKey = 'id' } = config;

    return {
        findAll: (options = {}) => {
            const { orderBy = `${primaryKey} DESC`, limit, offset } = options;
            let sql = `SELECT * FROM ${table}`;
            if (orderBy) sql += ` ORDER BY ${orderBy}`;
            if (limit) sql += ` LIMIT ${limit}`;
            if (offset) sql += ` OFFSET ${offset}`;
            return db.query(sql);
        },

        findById: (id) => db.query(
            `SELECT * FROM ${table} WHERE ${primaryKey} = ?`,
            [id]
        ).then(results => results[0] || null),

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

        create: (data) => {
            const entries = Object.entries(data).filter(([, v]) => v !== undefined);
            const keys = entries.map(([k]) => k);
            const placeholders = keys.map(() => '?').join(', ');
            const values = entries.map(([, v]) => v);

            return db.execute(
                `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`,
                values
            ).then(() => db.query(
                `SELECT * FROM ${table} WHERE ${primaryKey} = last_insert_rowid()`
            )).then(results => results[0]);
        },

        update: (id, changes) => {
            const entries = Object.entries(changes).filter(([, v]) => v !== undefined);
            const keys = entries.map(([k]) => k);
            const sets = keys.map(key => `${key} = ?`).join(', ');
            const values = entries.map(([, v]) => v);

            return db.execute(
                `UPDATE ${table} SET ${sets} WHERE ${primaryKey} = ?`,
                [...values, id]
            ).then(() => db.query(
                `SELECT * FROM ${table} WHERE ${primaryKey} = ?`,
                [id]
            )).then(results => results[0] || null);
        },

        delete: (id) => db.execute(
            `DELETE FROM ${table} WHERE ${primaryKey} = ?`,
            [id]
        ),

        count: (criteria = {}) => {
            const conditions = Object.entries(criteria)
                .map(([key]) => `${key} = ?`)
                .join(' AND ');
            const values = Object.values(criteria);
            const whereClause = conditions ? ` WHERE ${conditions}` : '';
            return db.query(
                `SELECT COUNT(*) as count FROM ${table} ${whereClause}`,
                values
            ).then(results => results[0].count);
        }
    };
};

module.exports = { createRepository };