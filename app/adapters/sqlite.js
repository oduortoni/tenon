const { DatabaseSync } = require('node:sqlite');

/**
 * SQLite adapter — implements the persistence interface.
 *
 * Table naming is the adapter's responsibility: the framework owns semantics,
 * but this adapter owns how entity names are represented as SQL table names.
 *
 * config.tables  — optional map of entity-name → table-name overrides
 *                  e.g. { ArticleTag: 'article_tags' }
 *                  Unknown entities default to entityName.toLowerCase() + 's'.
 */
const createSQLiteAdapter = (config) => {
    const db = new DatabaseSync(config.filename);
    const tableOverrides = config.tables || {};

    db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA foreign_keys = ON;
    `);

    // --- Low-level database operations (side effects live here) ---

    const query = async (sql, params = []) => {
        const stmt = db.prepare(sql);
        return stmt.all(...params);
    };

    const execute = async (sql, params = []) => {
        const stmt = db.prepare(sql);
        const result = stmt.run(...params);
        return {
            lastID: result.lastInsertRowid,
            changes: result.changes
        };
    };

    const get = async (sql, params = []) => {
        const stmt = db.prepare(sql);
        return stmt.get(...params);
    };

    const transaction = async (operations) => {
        await execute('BEGIN TRANSACTION');
        try {
            const results = [];
            for (const op of operations) {
                results.push(await op());
            }
            await execute('COMMIT');
            return results;
        } catch (error) {
            try { await execute('ROLLBACK'); } catch (_) {}
            throw error;
        }
    };

    const close = async () => {
        db.close();
    };

    // --- Representation: the adapter decides how entity names become table names ---

    const tableName = (entityName) =>
        tableOverrides[entityName] || entityName.toLowerCase() + 's';

    // --- Persistence interface: translate schema to SQL DDL ---
    const translateSchema = (schema) => {
        const sql = [];

        for (const entity of Object.values(schema.entities)) {
            const table = tableName(entity.name);
            let tableSQL = `CREATE TABLE IF NOT EXISTS ${table} (\n`;
            const columns = [];

            for (const [name, field] of Object.entries(entity.fields)) {
                let col = `    ${name} ${field.type.name}`;

                if (field.primaryKey) col += ' PRIMARY KEY AUTOINCREMENT';
                if (field.required) col += ' NOT NULL';
                if (field.unique) col += ' UNIQUE';

                if (field.default !== null && field.default !== undefined) {
                    const raw = typeof field.default === 'function'
                        ? field.default()
                        : field.default;
                    const defaultValue = raw instanceof Date ? raw.toISOString() : raw;
                    col += ` DEFAULT ${typeof defaultValue === 'string' ? `'${defaultValue}'` : defaultValue}`;
                }

                if (field.foreignKey) {
                    const ref = schema.entities[field.foreignKey];
                    if (ref) {
                        col += ` REFERENCES ${tableName(ref.name)}(${ref.primaryKey})`;
                    }
                }

                columns.push(col);
            }

            tableSQL += columns.join(',\n');
            tableSQL += '\n);';
            sql.push(tableSQL);

            // Unique indexes for non-PK unique fields
            for (const [name, field] of Object.entries(entity.fields)) {
                if (field.unique && !field.primaryKey) {
                    sql.push(
                        `CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_${name} ON ${table}(${name});`
                    );
                }
            }
        }

        return sql.join('\n\n');
    };

    // --- Persistence interface: initialize schema in database ---

    const initializeSchema = async (schema) => {
        const ddl = translateSchema(schema);
        db.exec(ddl);
        return ddl;
    };

    // --- Persistence interface: run a single migration ---

    const migrate = async (migration) => {
        if (migration.sql) {
            db.exec(migration.sql);
        } else if (typeof migration.up === 'function') {
            await migration.up({ query, execute, get, transaction });
        }
    };

    // --- Persistence interface: versioned migration tracking ---
    //
    // Tracks applied migrations in a schema_version table.
    // This is a SQLite-specific persistence concern.

    const ensureVersionTable = async () => {
        await execute(`
            CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    };

    const migrator = () => {
        const getCurrentVersion = async () => {
            await ensureVersionTable();
            const result = await query('SELECT MAX(version) as version FROM schema_version');
            return result[0]?.version || 0;
        };

        const setVersion = async (version) => {
            await execute(
                'INSERT INTO schema_version (version) VALUES (?)',
                [version]
            );
        };

        const run = async (migrations, targetVersion) => {
            const currentVersion = await getCurrentVersion();
            const toApply = migrations
                .filter(m => m.version > currentVersion)
                .sort((a, b) => a.version - b.version);
            const filtered = targetVersion
                ? toApply.filter(m => m.version <= targetVersion)
                : toApply;

            for (const migration of filtered) {
                await migrate(migration);
                await setVersion(migration.version);
            }

            return {
                applied: filtered.map(m => m.version),
                currentVersion: await getCurrentVersion()
            };
        };

        return { getCurrentVersion, setVersion, run };
    };

    // --- Persistence interface: generate repository for an entity ---

    const generateRepository = (schema, entity) => {
        const table = tableName(entity.name);
        const pk = entity.primaryKey;

        // Convert value to DB representation using type's toDB
        const toDB = (fieldName, value) => {
            const field = entity.fields[fieldName];
            if (field && field.type && field.type.toDB) {
                return field.type.toDB(value);
            }
            return value;
        };

        // Convert value from DB representation using type's fromDB
        const fromDB = (record) => {
            if (!record) return record;
            return Object.fromEntries(
                Object.entries(record).map(([key, value]) => {
                    const field = entity.fields[key];
                    if (field && field.type && field.type.fromDB) {
                        return [key, field.type.fromDB(value)];
                    }
                    return [key, value];
                })
            );
        };

        return {
            findAll: (options = {}) => {
                let sql = `SELECT * FROM ${table}`;
                const values = [];

                if (options.where) {
                    const conditions = Object.entries(options.where)
                        .map(([key]) => `${key} = ?`)
                        .join(' AND ');
                    sql += ` WHERE ${conditions}`;
                    values.push(...Object.values(options.where));
                }

                if (options.orderBy) {
                    sql += ` ORDER BY ${options.orderBy}`;
                } else {
                    sql += ` ORDER BY ${pk} DESC`;
                }

                if (options.limit) {
                    sql += ` LIMIT ${options.limit}`;
                    if (options.offset) {
                        sql += ` OFFSET ${options.offset}`;
                    }
                }

                return query(sql, values).then(rows => rows.map(fromDB));
            },

            findById: (id) => {
                return query(`SELECT * FROM ${table} WHERE ${pk} = ?`, [id])
                    .then(results => fromDB(results[0] || null));
            },

            findBy: (criteria) => {
                const conditions = Object.entries(criteria)
                    .map(([key]) => `${key} = ?`)
                    .join(' AND ');
                const values = Object.values(criteria);
                return query(`SELECT * FROM ${table} WHERE ${conditions}`, values)
                    .then(rows => rows.map(fromDB));
            },

            create: (data) => {
                const entries = Object.entries(data).filter(([k, v]) => k !== pk && v !== undefined);
                const keys = entries.map(([k]) => k);
                const placeholders = keys.map(() => '?').join(', ');
                const values = entries.map(([k, v]) => toDB(k, v));

                return execute(
                    `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`,
                    values
                ).then(() => query(`SELECT * FROM ${table} WHERE ${pk} = last_insert_rowid()`))
                .then(results => fromDB(results[0]));
            },

            update: (id, changes) => {
                const entries = Object.entries(changes).filter(([, v]) => v !== undefined);
                const keys = entries.map(([k]) => k);
                const sets = keys.map(key => `${key} = ?`).join(', ');
                const values = entries.map(([k, v]) => toDB(k, v));

                return execute(
                    `UPDATE ${table} SET ${sets} WHERE ${pk} = ?`,
                    [...values, id]
                ).then(() => query(`SELECT * FROM ${table} WHERE ${pk} = ?`, [id]))
                .then(results => fromDB(results[0] || null));
            },

            delete: (id) => {
                return execute(`DELETE FROM ${table} WHERE ${pk} = ?`, [id]);
            },

            count: (criteria = {}) => {
                const conditions = Object.entries(criteria)
                    .map(([key]) => `${key} = ?`)
                    .join(' AND ');
                const values = Object.values(criteria);
                const whereClause = conditions ? ` WHERE ${conditions}` : '';
                return query(
                    `SELECT COUNT(*) as count FROM ${table}${whereClause}`,
                    values
                ).then(results => results[0].count);
            }
        };
    };

    return {
        database: { query, execute, get, transaction, close },
        translateSchema,
        initializeSchema,
        migrate,
        migrator,
        generateRepository,
        tableName,
        close,
        _driver: db
    };
};

module.exports = { createSQLiteAdapter };

