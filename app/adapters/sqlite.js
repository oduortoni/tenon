const { DatabaseSync } = require('node:sqlite');
const { Either } = require('../../lib/either');

/**
 * SQLite persistence adapter.
 *
 * Public contract:
 *
 *   translateSchema(schema)
 *   initializeSchema(schema)
 *   generateRepository(schema, entity)
 *   migrate(migration)
 *   migrator()
 *
 * Optional SQLite-specific extensions:
 *
 *   generateFunctionalRepository(schema, entity)
 *   createFunctionalRepository(schema, entity)
 *
 * The framework only sees the persistence contract.
 * Everything else in this file is an SQLite implementation detail.
 */

const createSQLiteAdapter = (config) => {
    if (!config || !config.filename) {
        throw new Error(
            'SQLite adapter requires a filename'
        );
    }

    const db = new DatabaseSync(config.filename);

    const tableOverrides = {
        ...(config.tables || {})
    };

    const enableFunctional =
        config.functional !== false;


    /* ---------------------------------------------------------------------- */
    /* SQLite setup                                                           */
    /* ---------------------------------------------------------------------- */

    /*
     * These settings are connection-local except for journal_mode.
     *
     * WAL improves concurrent read/write behavior.
     * NORMAL provides a reasonable durability/performance trade-off.
     * Foreign keys must be explicitly enabled in SQLite.
     */
    db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA foreign_keys = ON;
    `);


    /* ---------------------------------------------------------------------- */
    /* Low-level database operations                                          */
    /* ---------------------------------------------------------------------- */

    /*
     * DatabaseSync is synchronous, so these functions deliberately remain
     * small wrappers around SQLite. The promise-based repository contract
     * is added at the repository boundary rather than pretending that
     * SQLite itself is asynchronous.
     */

    const query = (sql, params = []) => {
        const statement = db.prepare(sql);
        return statement.all(...params);
    };


    const execute = (sql, params = []) => {
        const statement = db.prepare(sql);
        const result = statement.run(...params);

        return {
            lastID: result.lastInsertRowid,
            changes: result.changes
        };
    };


    const get = (sql, params = []) => {
        const statement = db.prepare(sql);
        return statement.get(...params);
    };


    /*
     * Execute a sequence of operations atomically.
     *
     * If an operation throws, the transaction is rolled back.
     *
     * The functional repository additionally converts Either.Left into
     * an exception before reaching this layer, so a functional failure
     * cannot accidentally result in COMMIT.
     */
    const transaction = (operations) => {
        execute('BEGIN TRANSACTION');

        try {
            const results = [];

            for (const operation of operations) {
                results.push(operation());
            }

            execute('COMMIT');

            return results;
        } catch (error) {
            try {
                execute('ROLLBACK');
            } catch (_) {
                // Preserve the original error.
            }

            throw error;
        }
    };


    const close = () => {
        db.close();
    };


    /* ---------------------------------------------------------------------- */
    /* SQL identifier helpers                                                 */
    /* ---------------------------------------------------------------------- */

    /*
     * SQL values can be parameterized:
     *
     *     WHERE name = ?
     *
     * SQL identifiers cannot:
     *
     *     SELECT * FROM ?
     *
     * Therefore table and column names must come from trusted schema data
     * or be validated before interpolation.
     */

    const assertIdentifier = (identifier, label = 'identifier') => {
        if (
            typeof identifier !== 'string' ||
            !/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)
        ) {
            throw new Error(
                `Invalid SQL ${label}: ${identifier}`
            );
        }

        return identifier;
    };


    const tableName = (entityName) => {
        const name =
            tableOverrides[entityName] ||
            `${entityName.toLowerCase()}s`;

        return assertIdentifier(name, 'table name');
    };


    const columnName = (name) => {
        return assertIdentifier(name, 'column name');
    };


    const normalizeDirection = (direction) => {
        const value =
            String(direction).toUpperCase();

        if (value !== 'ASC' && value !== 'DESC') {
            throw new Error(
                `Invalid order direction: ${direction}`
            );
        }

        return value;
    };


    const normalizeInteger = (
        value,
        name,
        { min = 0 } = {}
    ) => {
        const number =
            Number(value);

        if (
            !Number.isInteger(number) ||
            number < min
        ) {
            throw new Error(
                `${name} must be an integer >= ${min}`
            );
        }

        return number;
    };


    /* ---------------------------------------------------------------------- */
    /* Value conversion                                                       */
    /* ---------------------------------------------------------------------- */

    /*
     * Entity field types may define storage conversions.
     *
     * Example:
     *
     *     boolean -> 0/1
     *     Date    -> ISO string
     *
     * The adapter owns this translation because SQLite only understands
     * SQLite-compatible storage values.
     */

    const createValueConverters = (entity) => {

        const toDB = (data) => {
            if (!data) {
                return data;
            }

            const result = {
                ...data
            };

            for (const [key, field] of Object.entries(
                entity.fields || {}
            )) {
                if (
                    result[key] !== undefined &&
                    field.type?.toDB
                ) {
                    result[key] =
                        field.type.toDB(result[key]);
                }
            }

            return result;
        };


        const fromDB = (record) => {
            if (!record) {
                return record;
            }

            const result = {
                ...record
            };

            for (const [key, field] of Object.entries(
                entity.fields || {}
            )) {
                if (
                    result[key] !== undefined &&
                    field.type?.fromDB
                ) {
                    result[key] =
                        field.type.fromDB(result[key]);
                }
            }

            return result;
        };


        return {
            toDB,
            fromDB
        };
    };


    /* ---------------------------------------------------------------------- */
    /* WHERE clause builder                                                   */
    /* ---------------------------------------------------------------------- */

    /*
     * Converts the simple repository criteria:
     *
     *     {
     *         done: false,
     *         priority: [1, 2]
     *     }
     *
     * into:
     *
     *     WHERE done = ? AND priority IN (?, ?)
     *
     * Values remain parameters rather than being interpolated into SQL.
     */

    const buildWhereClause = (criteria = {}) => {
        const conditions = [];
        const values = [];

        for (const [rawKey, value] of Object.entries(criteria)) {
            const key = columnName(rawKey);

            /*
             * An array represents IN.
             *
             * An empty IN set has no possible matches.
             *
             * SQLite does not give us a useful portable representation
             * of IN (), so we represent it as an always-false predicate.
             */
            if (Array.isArray(value)) {

                if (value.length === 0) {
                    conditions.push('1 = 0');
                    continue;
                }

                const placeholders =
                    value.map(() => '?').join(', ');

                conditions.push(
                    `${key} IN (${placeholders})`
                );

                values.push(...value);

                continue;
            }


            /*
             * null means SQL NULL.
             *
             * undefined is not silently converted to NULL. Usually it
             * indicates that the caller forgot to supply a value.
             */
            if (value === null) {
                conditions.push(
                    `${key} IS NULL`
                );

                continue;
            }


            if (value === undefined) {
                throw new Error(
                    `Undefined value for criteria field: ${key}`
                );
            }


            conditions.push(
                `${key} = ?`
            );

            values.push(value);
        }


        return {
            sql: conditions.length
                ? `WHERE ${conditions.join(' AND ')}`
                : '',

            values
        };
    };


    /* ---------------------------------------------------------------------- */
    /* Repository core                                                        */
    /* ---------------------------------------------------------------------- */

    /*
     * Everything common to standard and functional repositories lives here.
     *
     * This prevents the two repository implementations from independently
     * rediscovering table names, primary keys, conversions, and predicates.
     */
    const createRepositoryCore = (entity) => {
        const table =
            tableName(entity.name);

        const pk =
            columnName(entity.primaryKey);

        const {
            toDB,
            fromDB
        } = createValueConverters(entity);


        return {
            table,
            pk,
            toDB,
            fromDB,
            buildWhereClause
        };
    };


    /* ---------------------------------------------------------------------- */
    /* Standard repository                                                    */
    /* ---------------------------------------------------------------------- */

    const generateStandardRepository = (schema, entity) => {
        const {
            table,
            pk,
            toDB,
            fromDB,
            buildWhereClause
        } = createRepositoryCore(entity);


        const findAll = async (options = {}) => {
            let sql =
                `SELECT * FROM ${table}`;

            const values = [];


            if (options.where) {
                const where =
                    buildWhereClause(options.where);

                if (where.sql) {
                    sql += ` ${where.sql}`;
                    values.push(...where.values);
                }
            }


            if (options.orderBy) {
                const orderColumn =
                    columnName(options.orderBy);

                const direction =
                    normalizeDirection(
                        options.direction || 'ASC'
                    );

                sql +=
                    ` ORDER BY ${orderColumn} ${direction}`;

            } else {
                sql += ` ORDER BY ${pk} DESC`;
            }


            if (options.limit !== undefined) {
                const limit =
                    normalizeInteger(
                        options.limit,
                        'limit'
                    );

                sql += ` LIMIT ${limit}`;


                if (options.offset !== undefined) {
                    const offset =
                        normalizeInteger(
                            options.offset,
                            'offset'
                        );

                    sql += ` OFFSET ${offset}`;
                }
            }


            const rows =
                query(sql, values);

            return rows.map(fromDB);
        };


        const findById = async (id) => {
            const rows = query(
                `SELECT * FROM ${table} WHERE ${pk} = ?`,
                [id]
            );

            return rows.length
                ? fromDB(rows[0])
                : null;
        };


        const findBy = async (criteria) => {
            const where =
                buildWhereClause(criteria);

            const sql =
                `SELECT * FROM ${table} ${where.sql}`;

            const rows =
                query(sql, where.values);

            return rows.map(fromDB);
        };


        const create = async (data) => {
            const record =
                toDB(data);

            const keys =
                Object.keys(record);

            if (keys.length === 0) {
                throw new Error(
                    `Cannot create an empty ${entity.name}`
                );
            }


            const columns =
                keys.map(columnName);

            const placeholders =
                columns.map(() => '?').join(', ');

            const values =
                columns.map(
                    key => record[key]
                );


            const sql =
                `INSERT INTO ${table} ` +
                `(${columns.join(', ')}) ` +
                `VALUES (${placeholders})`;


            const result =
                execute(sql, values);


            const id =
                result.lastID ??
                data[pk];


            return findById(id);
        };


        const update = async (
            id,
            changes
        ) => {
            const record =
                toDB(changes);

            const keys =
                Object.keys(record);

            if (keys.length === 0) {
                throw new Error(
                    `Cannot update ${entity.name} with no changes`
                );
            }


            const sets =
                keys.map(
                    key => `${columnName(key)} = ?`
                );


            const values =
                keys.map(
                    key => record[key]
                );


            values.push(id);


            const sql =
                `UPDATE ${table} ` +
                `SET ${sets.join(', ')} ` +
                `WHERE ${pk} = ?`;


            execute(sql, values);

            return findById(id);
        };


        const remove = async (id) => {
            execute(
                `DELETE FROM ${table} WHERE ${pk} = ?`,
                [id]
            );
        };


        const count = async (
            criteria = {}
        ) => {
            const where =
                buildWhereClause(criteria);

            const sql =
                `SELECT COUNT(*) AS count ` +
                `FROM ${table} ${where.sql}`;


            const row =
                get(sql, where.values);

            return Number(row?.count || 0);
        };


        return {
            findAll,
            findById,
            findBy,
            create,
            update,
            delete: remove,
            count
        };
    };


    /* ---------------------------------------------------------------------- */
    /* Functional query builder                                               */
    /* ---------------------------------------------------------------------- */

    /*
     * The functional query builder is intentionally immutable.
     *
     * Instead of:
     *
     *     query.where(...)
     *     // modifies query
     *
     * each operation produces a new query value.
     *
     *     const base = repo.query();
     *     const active = base.where(...);
     *     const completed = base.where(...);
     *
     * `active` and `completed` cannot interfere with one another.
     */

    const createQueryBuilder = (
        table,
        fromDB,
        state = {}
    ) => {

        const conditions =
            state.conditions || [];

        const order =
            state.order || null;

        const limit =
            state.limit ?? null;

        const offset =
            state.offset ?? null;


        const withState = (changes) => {
            return createQueryBuilder(
                table,
                fromDB,
                {
                    conditions,
                    order,
                    limit,
                    offset,
                    ...changes
                }
            );
        };


        const compileConditions = () => {
            const values = [];

            const clauses =
                conditions.map(condition => {

                    const field =
                        columnName(
                            condition.field
                        );


                    if (condition.op === 'LIKE') {
                        values.push(
                            `%${condition.value}%`
                        );

                        return `${field} LIKE ?`;
                    }


                    if (condition.op === 'IN') {
                        const items =
                            condition.values;

                        if (items.length === 0) {
                            return '1 = 0';
                        }

                        const placeholders =
                            items
                                .map(() => '?')
                                .join(', ');

                        values.push(...items);

                        return (
                            `${field} IN ` +
                            `(${placeholders})`
                        );
                    }


                    values.push(
                        condition.value
                    );

                    return `${field} = ?`;
                });


            return {
                sql: clauses.length
                    ? `WHERE ${clauses.join(' AND ')}`
                    : '',

                values
            };
        };


        const compileSelect = () => {
            const values = [];

            let sql =
                `SELECT * FROM ${table}`;


            const where =
                compileConditions();

            if (where.sql) {
                sql += ` ${where.sql}`;
                values.push(...where.values);
            }


            if (order) {
                sql +=
                    ` ORDER BY ${order.field} ${order.direction}`;
            }


            if (limit !== null) {
                sql += ` LIMIT ${limit}`;
            }


            if (offset !== null) {
                sql += ` OFFSET ${offset}`;
            }


            return {
                sql,
                values
            };
        };


        const executeQuery = async () => {
            try {
                const compiled =
                    compileSelect();

                const rows =
                    query(
                        compiled.sql,
                        compiled.values
                    );

                return Either.Right(
                    rows.map(fromDB)
                );

            } catch (error) {
                return Either.Left(
                    `Query execution failed on ${table}: ${error.message}`
                );
            }
        };


        const executeCount = async () => {
            try {
                const where =
                    compileConditions();

                let sql =
                    `SELECT COUNT(*) AS count ` +
                    `FROM ${table}`;

                if (where.sql) {
                    sql += ` ${where.sql}`;
                }


                const row =
                    get(
                        sql,
                        where.values
                    );


                return Either.Right(
                    Number(row?.count || 0)
                );

            } catch (error) {
                return Either.Left(
                    `Count query failed on ${table}: ${error.message}`
                );
            }
        };


        return {

            where: (field, value) => {
                return withState({
                    conditions: [
                        ...conditions,
                        {
                            field,
                            value,
                            op: '='
                        }
                    ]
                });
            },


            whereLike: (field, value) => {
                return withState({
                    conditions: [
                        ...conditions,
                        {
                            field,
                            value,
                            op: 'LIKE'
                        }
                    ]
                });
            },


            whereContains: (field, value) => {
                return withState({
                    conditions: [
                        ...conditions,
                        {
                            field,
                            value,
                            op: 'LIKE'
                        }
                    ]
                });
            },


            whereIn: (field, values) => {
                const normalized =
                    Array.isArray(values)
                        ? [...values]
                        : [values];

                return withState({
                    conditions: [
                        ...conditions,
                        {
                            field,
                            values: normalized,
                            op: 'IN'
                        }
                    ]
                });
            },


            orderBy: (
                field,
                direction = 'ASC'
            ) => {

                return withState({
                    order: {
                        field:
                            columnName(field),

                        direction:
                            normalizeDirection(
                                direction
                            )
                    }
                });
            },


            limit: (value) => {
                return withState({
                    limit:
                        normalizeInteger(
                            value,
                            'limit'
                        )
                });
            },


            offset: (value) => {
                return withState({
                    offset:
                        normalizeInteger(
                            value,
                            'offset'
                        )
                });
            },


            execute: executeQuery,


            first: async () => {
                const result =
                    await withState({
                        limit: 1
                    }).execute();

                return result.flatMap(rows => {

                    if (rows.length === 0) {
                        return Either.Left(
                            `No records found in ${table}`
                        );
                    }

                    return Either.Right(
                        rows[0]
                    );
                });
            },


            count: executeCount
        };
    };


    /* ---------------------------------------------------------------------- */
    /* Functional repository                                                  */
    /* ---------------------------------------------------------------------- */

    /*
     * The functional repository wraps the standard repository and lifts
     * every operation into the Either monad.
     *
     * Every method is async and returns a resolved Either. Callers can
     * await the method and then chain .map/.flatMap/.fold safely.
     *
     * The lift helper awaits the underlying operation so that chained
     * Either operations act on the resolved value, not on a pending
     * Promise. This is the difference between:
     *
     *     Either.fromPromise(op)          -> Promise<Either>
     *     await Either.fromPromise(op)    -> Either
     */
    const generateFunctionalRepository = (
        schema,
        entity
    ) => {

        const standardRepository =
            generateStandardRepository(
                schema,
                entity
            );


        const {
            table,
            fromDB
        } = createRepositoryCore(entity);


        /*
         * Lift a Promise-producing operation into Either.
         *
         * Always await the operation so that the returned value is a
         * resolved Either, not a pending Promise.
         */
        const lift = async (
            operation,
            errorMessage
        ) => {
            try {
                const value = await operation();
                return Either.Right(value);
            } catch (error) {
                return Either.Left(
                    errorMessage || error.message
                );
            }
        };


        const findById = async (id) => {
            const result = await lift(
                () => standardRepository.findById(id),
                `Failed to find record with id ${id} in ${table}`
            );

            if (result.isLeft) {
                return result;
            }

            if (result.value === null) {
                return Either.Left(
                    `Record with id ${id} not found in ${table}`
                );
            }

            return Either.Right(result.value);
        };


        const findAll = async (options = {}) => {
            return lift(
                () => standardRepository.findAll(options),
                `Failed to find records in ${table}`
            );
        };


        const findBy = async (criteria) => {
            return lift(
                () => standardRepository.findBy(criteria),
                `Failed to find records by criteria in ${table}`
            );
        };


        const create = async (data) => {
            return lift(
                () => standardRepository.create(data),
                `Failed to create record in ${table}`
            );
        };


        const update = async (id, changes) => {
            const found = await findById(id);
            if (found.isLeft) {
                return found;
            }

            return lift(
                () => standardRepository.update(id, changes),
                `Failed to update record with id ${id} in ${table}`
            );
        };


        const remove = async (id) => {
            const found = await findById(id);
            if (found.isLeft) {
                return found;
            }

            const deleted = await lift(
                () => standardRepository.delete(id),
                `Failed to delete record with id ${id} from ${table}`
            );

            return deleted.map(() => true);
        };


        const count = async (criteria = {}) => {
            return lift(
                () => standardRepository.count(criteria),
                `Failed to count records in ${table}`
            );
        };


        /*
         * Transactions
         *
         * The low-level transaction rolls back on exceptions.
         *
         * A functional Left must be converted into an exception before
         * reaching it. Otherwise SQLite would see a normal return and
         * COMMIT the transaction.
         *
         * Each operation is awaited so that resolved Either values are
         * inspected, not pending Promises.
         */
        const transactionFunctional = async (operations) => {
            try {
                const wrapped = operations.map(operation => {
                    return () => {
                        const result = operation();

                        /*
                         * Support both sync and async operations.
                         * If the operation returns a Promise, we cannot
                         * inspect its isLeft flag synchronously, so we
                         * let the low-level transaction await it via a
                         * wrapper that throws on Left.
                         */
                        if (result && typeof result.then === 'function') {
                            throw new Error(
                                'Async operations inside transactions ' +
                                'must be awaited by the caller; ' +
                                'pass sync operations instead.'
                            );
                        }

                        if (result && result.isLeft) {
                            throw new Error(
                                String(result.value)
                            );
                        }

                        return result;
                    };
                });

                const results = transaction(wrapped);

                return Either.Right(results);
            } catch (error) {
                return Either.Left(
                    `Transaction failed on ${table}: ${error.message}`
                );
            }
        };


        return {
            findAll,
            findById,
            findBy,
            create,
            update,
            delete: remove,
            count,
            query: () => createQueryBuilder(table, fromDB),
            transaction: transactionFunctional
        };
    };


    /* ---------------------------------------------------------------------- */
    /* Schema translation                                                     */
    /* ---------------------------------------------------------------------- */

    /*
     * Converts the schema representation into SQLite DDL.
     *
     * This is intentionally adapter-local. The framework does not need to
     * know whether another adapter represents a schema as SQL, JSON,
     * documents, or something else.
     */

    const escapeDefault = (value) => {

        if (value === null) {
            return 'NULL';
        }


        if (typeof value === 'boolean') {
            return value ? '1' : '0';
        }


        if (typeof value === 'number') {
            if (!Number.isFinite(value)) {
                throw new Error(
                    `Invalid numeric default: ${value}`
                );
            }

            return String(value);
        }


        const string =
            value instanceof Date
                ? value.toISOString()
                : String(value);


        return `'${string.replaceAll("'", "''")}'`;
    };


    const translateSchema = (schema) => {
        const statements = [];


        for (const entity of Object.values(
            schema.entities
        )) {

            const table =
                tableName(entity.name);


            const columns = [];


            for (const [name, field] of Object.entries(
                entity.fields
            )) {

                const column =
                    columnName(name);


                if (
                    !field.type ||
                    !field.type.name
                ) {
                    throw new Error(
                        `Field ${name} has invalid type ` +
                        `structure in entity ${entity.name}`
                    );
                }


                let definition =
                    `    ${column} ${field.type.name}`;


                if (field.primaryKey) {

                    /*
                     * This preserves the adapter's current convention.
                     *
                     * If the schema system later distinguishes UUID,
                     * INTEGER PRIMARY KEY, generated IDs, etc., this is
                     * the place where those semantics should be translated.
                     */
                    definition +=
                        ' PRIMARY KEY AUTOINCREMENT';
                }


                if (field.required) {
                    definition += ' NOT NULL';
                }


                if (field.unique) {
                    definition += ' UNIQUE';
                }


                if (
                    field.default !== undefined &&
                    field.default !== null
                ) {

                    const value =
                        typeof field.default === 'function'
                            ? field.default()
                            : field.default;

                    definition +=
                        ` DEFAULT ${escapeDefault(value)}`;
                }


                if (field.foreignKey) {

                    const referenced =
                        schema.entities[
                            field.foreignKey
                        ];


                    if (!referenced) {
                        throw new Error(
                            `Unknown foreign key entity ` +
                            `${field.foreignKey} ` +
                            `for ${entity.name}.${name}`
                        );
                    }


                    definition +=
                        ` REFERENCES ` +
                        `${tableName(referenced.name)}` +
                        `(${columnName(referenced.primaryKey)})`;
                }


                columns.push(definition);
            }


            statements.push(
                [
                    `CREATE TABLE IF NOT EXISTS ${table} (`,
                    columns.join(',\n'),
                    ');'
                ].join('\n')
            );


            /*
             * Keep unique indexes explicit for non-primary-key fields.
             *
             * The column's UNIQUE constraint already provides uniqueness,
             * so this follows the existing adapter's behavior only where
             * the schema expects an additional unique index.
             */
            for (const [name, field] of Object.entries(
                entity.fields
            )) {

                if (
                    field.unique &&
                    !field.primaryKey
                ) {

                    const column =
                        columnName(name);

                    statements.push(
                        `CREATE UNIQUE INDEX IF NOT EXISTS ` +
                        `idx_${table}_${column} ` +
                        `ON ${table}(${column});`
                    );
                }
            }
        }


        return statements.join('\n\n');
    };


    const initializeSchema = async (schema) => {
        const ddl =
            translateSchema(schema);

        db.exec(ddl);

        return ddl;
    };


    /* ---------------------------------------------------------------------- */
    /* Migrations                                                             */
    /* ---------------------------------------------------------------------- */

    const migrate = async (migration) => {

        if (migration.sql) {
            db.exec(migration.sql);
            return;
        }


        if (typeof migration.up === 'function') {

            await migration.up({
                query,
                execute,
                get,
                transaction
            });

            return;
        }


        throw new Error(
            'Migration must provide either sql or up()'
        );
    };


    const ensureVersionTable = async () => {

        execute(`
            CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    };


    const migrator = () => {

        const getCurrentVersion = async () => {

            await ensureVersionTable();

            const row =
                get(
                    'SELECT MAX(version) AS version ' +
                    'FROM schema_version'
                );

            return Number(
                row?.version || 0
            );
        };


        const setVersion = async (version) => {

            const normalized =
                normalizeInteger(
                    version,
                    'migration version'
                );

            execute(
                'INSERT INTO schema_version (version) ' +
                'VALUES (?)',

                [normalized]
            );
        };


        const run = async (
            migrations,
            targetVersion
        ) => {

            const currentVersion =
                await getCurrentVersion();


            const pending =
                migrations
                    .filter(
                        migration =>
                            migration.version >
                            currentVersion
                    )
                    .sort(
                        (a, b) =>
                            a.version -
                            b.version
                    );


            const selected =
                targetVersion === undefined
                    ? pending
                    : pending.filter(
                        migration =>
                            migration.version <=
                            targetVersion
                    );


            for (const migration of selected) {

                await migrate(migration);

                await setVersion(
                    migration.version
                );
            }


            return {
                applied:
                    selected.map(
                        migration =>
                            migration.version
                    ),

                currentVersion:
                    await getCurrentVersion()
            };
        };


        return {
            getCurrentVersion,
            setVersion,
            run
        };
    };


    /* ---------------------------------------------------------------------- */
    /* Persistence contract                                                   */
    /* ---------------------------------------------------------------------- */

    /*
     * This is the important boundary.
     *
     * The framework gets these five capabilities and nothing SQLite-specific.
     */
    const generateRepository = (
        schema,
        entity
    ) => {
        return generateStandardRepository(
            schema,
            entity
        );
    };


    const adapter = {

        /*
         * Adapter-specific escape hatch.
         *
         * The framework never depends on this object.
         */
        database: {
            query,
            execute,
            get,
            transaction,
            close
        },
        tableName,

        /* Persistence contract */
        translateSchema,
        initializeSchema,
        generateRepository,
        migrate,
        migrator
    };


    /* ---------------------------------------------------------------------- */
    /* Optional functional extensions                                         */
    /* ---------------------------------------------------------------------- */

    if (enableFunctional) {

        adapter.generateFunctionalRepository = (
            schema,
            entity
        ) => {
            return generateFunctionalRepository(
                schema,
                entity
            );
        };


        adapter.createFunctionalRepository = (
            schema,
            entity
        ) => {

            return {
                standard:
                    generateStandardRepository(
                        schema,
                        entity
                    ),

                functional:
                    generateFunctionalRepository(
                        schema,
                        entity
                    )
            };
        };
    }


    return adapter;
};


module.exports = {
    createSQLiteAdapter
};

