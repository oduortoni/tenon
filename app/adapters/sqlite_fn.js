/**
 * Functional SQLite Adapter — SQLite with Either monad support
 * 
 * Extends the standard SQLite adapter with functional patterns:
 * 1. Returns Either monad from all repository operations
 * 2. Provides functional query builder
 * 3. Maintains backward compatibility with standard adapter
 */

const { Either } = require('../../lib/either');
const { DatabaseSync } = require('node:sqlite');

/**
 * Create a functional SQLite adapter
 * @param {Object} config - Adapter configuration
 * @param {string} config.filename - SQLite database filename
 * @param {Object} config.tables - Optional table name overrides
 * @returns {Object} Functional SQLite adapter
 */
const createFunctionalSQLiteAdapter = (config) => {
  const db = new DatabaseSync(config.filename);
  const tableOverrides = config.tables || {};

  // Initialize database with best practices
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
  `);

  // --- Low-level database operations ---

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

  // --- Helper functions ---

  const tableName = (entityName) =>
    tableOverrides[entityName] || entityName.toLowerCase() + 's';

  // --- Functional repository factory ---

  /**
   * Create a functional repository for an entity
   */
  const createFunctionalRepository = (schema, entity) => {
    const table = tableName(entity.name);
    const pk = entity.primaryKey;

    // Convert between domain and DB types
    const toDB = (data) => {
      if (!data) return data;
      const result = { ...data };
      
      Object.entries(entity.fields || {}).forEach(([key, field]) => {
        if (field.type?.toDB && result[key] !== undefined) {
          result[key] = field.type.toDB(result[key]);
        }
      });
      
      return result;
    };

    const fromDB = (record) => {
      if (!record) return record;
      const result = { ...record };
      
      Object.entries(entity.fields || {}).forEach(([key, field]) => {
        if (field.type?.fromDB && result[key] !== undefined) {
          result[key] = field.type.fromDB(result[key]);
        }
      });
      
      return result;
    };

    // --- Standard repository (backward compatible) ---

    const standardRepo = {
      findAll: async (options = {}) => {
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

        const rows = await query(sql, values);
        return rows.map(fromDB);
      },

      findById: async (id) => {
        const rows = await query(`SELECT * FROM ${table} WHERE ${pk} = ?`, [id]);
        return rows[0] ? fromDB(rows[0]) : null;
      },

      findBy: async (criteria) => {
        const conditions = Object.keys(criteria)
          .map(key => `${key} = ?`)
          .join(' AND ');
        const values = Object.values(criteria);
        
        const sql = `SELECT * FROM ${table} WHERE ${conditions}`;
        const rows = await query(sql, values);
        return rows.map(fromDB);
      },

      create: async (data) => {
        const record = toDB(data);
        const keys = Object.keys(record);
        const placeholders = keys.map(() => '?').join(', ');
        const values = keys.map(key => record[key]);
        
        const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
        const result = await execute(sql, values);
        
        const id = result.lastID || data[pk];
        const rows = await query(`SELECT * FROM ${table} WHERE ${pk} = ?`, [id]);
        return rows[0] ? fromDB(rows[0]) : null;
      },

      update: async (id, changes) => {
        const record = toDB(changes);
        const sets = Object.keys(record)
          .map(key => `${key} = ?`)
          .join(', ');
        const values = Object.values(record);
        values.push(id);
        
        const sql = `UPDATE ${table} SET ${sets} WHERE ${pk} = ?`;
        await execute(sql, values);
        
        const rows = await query(`SELECT * FROM ${table} WHERE ${pk} = ?`, [id]);
        return rows[0] ? fromDB(rows[0]) : null;
      },

      delete: async (id) => {
        await execute(`DELETE FROM ${table} WHERE ${pk} = ?`, [id]);
      },

      count: async (criteria = {}) => {
        let sql = `SELECT COUNT(*) as count FROM ${table}`;
        const values = [];

        if (Object.keys(criteria).length > 0) {
          const conditions = Object.keys(criteria)
            .map(key => `${key} = ?`)
            .join(' AND ');
          sql += ` WHERE ${conditions}`;
          values.push(...Object.values(criteria));
        }

        const rows = await query(sql, values);
        return rows[0]?.count || 0;
      }
    };

    // --- Functional repository (Either monad) ---

    const functionalRepo = {
      // Standard methods wrapped with Either
      findAll: (options = {}) => {
        return Either.fromPromise(
          standardRepo.findAll(options),
          `Failed to find records in ${table}`
        );
      },

      findById: (id) => {
        return Either.fromPromise(
          standardRepo.findById(id),
          `Failed to find record with id ${id} in ${table}`
        ).flatMap(result => {
          if (!result) return Either.Left(`Record with id ${id} not found in ${table}`);
          return Either.Right(result);
        });
      },

      findBy: (criteria) => {
        return Either.fromPromise(
          standardRepo.findBy(criteria),
          `Failed to find records by criteria in ${table}`
        );
      },

      create: (data) => {
        return Either.fromPromise(
          standardRepo.create(data),
          `Failed to create record in ${table}`
        );
      },

      update: (id, changes) => {
        return functionalRepo.findById(id).flatMap(() => {
          return Either.fromPromise(
            standardRepo.update(id, changes),
            `Failed to update record with id ${id} in ${table}`
          );
        });
      },

      delete: (id) => {
        return functionalRepo.findById(id).flatMap(() => {
          return Either.fromPromise(
            standardRepo.delete(id),
            `Failed to delete record with id ${id} from ${table}`
          ).map(() => true);
        });
      },

      count: (criteria = {}) => {
        return Either.fromPromise(
          standardRepo.count(criteria),
          `Failed to count records in ${table}`
        );
      },

      // Functional query builder
      query: () => {
        let conditions = [];
        let orderBy = null;
        let orderDir = 'ASC';
        let limit = null;
        let offset = null;

        const queryBuilder = {
          where: (field, value) => {
            conditions.push({ field, value, op: '=' });
            return queryBuilder;
          },

          whereNot: (field, value) => {
            conditions.push({ field, value, op: '!=' });
            return queryBuilder;
          },

          whereLike: (field, value) => {
            conditions.push({ field, value, op: 'LIKE' });
            return queryBuilder;
          },

          orderBy: (field, direction = 'ASC') => {
            orderBy = field;
            orderDir = direction.toUpperCase();
            return queryBuilder;
          },

          limit: (n) => {
            limit = n;
            return queryBuilder;
          },

          offset: (n) => {
            offset = n;
            return queryBuilder;
          },

          execute: () => {
            let sql = `SELECT * FROM ${table}`;
            const values = [];

            if (conditions.length > 0) {
              const whereClauses = conditions.map(({ field, value, op }) => {
                values.push(op === 'LIKE' ? `%${value}%` : value);
                return `${field} ${op} ?`;
              });
              sql += ` WHERE ${whereClauses.join(' AND ')}`;
            }

            if (orderBy) {
              sql += ` ORDER BY ${orderBy} ${orderDir}`;
            }

            if (limit !== null) {
              sql += ` LIMIT ${limit}`;
              if (offset !== null) {
                sql += ` OFFSET ${offset}`;
              }
            }

            return Either.fromPromise(
              query(sql, values).then(rows => rows.map(fromDB)),
              `Query execution failed on ${table}`
            );
          },

          first: () => {
            return queryBuilder.limit(1).execute().flatMap(results => {
              if (results.length === 0) {
                return Either.Left(`No records found in ${table}`);
              }
              return Either.Right(results[0]);
            });
          },

          count: () => {
            let sql = `SELECT COUNT(*) as count FROM ${table}`;
            const values = [];

            if (conditions.length > 0) {
              const whereClauses = conditions.map(({ field, value, op }) => {
                values.push(op === 'LIKE' ? `%${value}%` : value);
                return `${field} ${op} ?`;
              });
              sql += ` WHERE ${whereClauses.join(' AND ')}`;
            }

            return Either.fromPromise(
              query(sql, values).then(rows => rows[0]?.count || 0),
              `Count query failed on ${table}`
            );
          }
        };

        return queryBuilder;
      },

      // Transaction support
      transaction: (operations) => {
        return Either.fromPromise(
          transaction(operations.map(op => () => op())),
          `Transaction failed on ${table}`
        );
      }
    };

    // Return both repositories
    return {
      standard: standardRepo,
      functional: functionalRepo
    };
  };

  // --- Persistence contract implementation ---

  const translateSchema = (schema) => {
    const sql = [];

    for (const entity of Object.values(schema.entities)) {
      const table = tableName(entity.name);
      let tableSQL = `CREATE TABLE IF NOT EXISTS ${table} (\n`;
      const columns = [];

      for (const [name, field] of Object.entries(entity.fields)) {
        if (!field.type || !field.type.name) {
          console.error('Field error:', { name, field });
          throw new Error(`Field ${name} has invalid type structure`);
        }
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

  const initializeSchema = async (schema) => {
    const ddl = translateSchema(schema);
    db.exec(ddl);
    return ddl;
  };

  const migrate = async (migration) => {
    if (migration.sql) {
      db.exec(migration.sql);
    } else if (typeof migration.up === 'function') {
      await migration.up({ query, execute, get, transaction });
    }
  };

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

  // Standard repository generation (backward compatible)
  const generateRepository = (schema, entity) => {
    const repos = createFunctionalRepository(schema, entity);
    return repos.standard;
  };

  // Functional repository generation (optional extension)
  const generateFunctionalRepository = (schema, entity) => {
    const repos = createFunctionalRepository(schema, entity);
    return repos.functional;
  };

  // Return adapter
  return {
    // Database handle (adapter-specific escape hatch)
    database: { query, execute, get, transaction, close },
    
    // Required persistence contract methods
    translateSchema,
    initializeSchema,
    generateRepository,
    migrate,
    migrator,
    
    // Optional functional extension
    generateFunctionalRepository,
    
    // Helper to get both repositories
    createFunctionalRepository
  };
};

module.exports = { createFunctionalSQLiteAdapter };