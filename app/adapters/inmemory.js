/**
 * Functional In-Memory Adapter — Pure memory storage with Either monad
 * 
 * A complete in-memory adapter that implements the persistence contract
 * with functional patterns. Perfect for testing and development.
 * 
 * Features:
 * 1. Pure in-memory storage (no side effects to disk)
 * 2. Returns Either monad from all operations
 * 3. Functional query builder
 * 4. Transaction support (in-memory)
 */

const { Either } = require('../../lib/either');

/**
 * Create a functional in-memory adapter
 * @param {Object} config - Adapter configuration (optional)
 * @param {Object} config.initialData - Optional initial data for testing
 * @returns {Object} Functional in-memory adapter
 */
const createInMemoryAdapter = (config = {}) => {
  // Store data in memory
  const stores = new Map();
  const initialData = config.initialData || {};
  
  // Track next IDs per entity
  const nextIds = new Map();

  // --- Low-level store operations ---

  const getStore = (entityName) => {
    if (!stores.has(entityName)) {
      stores.set(entityName, []);
      nextIds.set(entityName, 1);
      
      // Initialize with test data if provided
      if (initialData[entityName]) {
        const store = stores.get(entityName);
        initialData[entityName].forEach(item => {
          const id = nextIds.get(entityName);
          store.push({ ...item, id });
          nextIds.set(entityName, id + 1);
        });
      }
    }
    return stores.get(entityName);
  };

  const getNextId = (entityName) => {
    const id = nextIds.get(entityName) || 1;
    nextIds.set(entityName, id + 1);
    return id;
  };

  // --- Functional repository factory ---

  /**
   * Create a functional repository for an entity
   */
  const createFunctionalRepository = (schema, entity) => {
    const storeName = entity.name;
    const pk = entity.primaryKey || 'id';
    
    const store = getStore(storeName);

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
        let results = [...store].map(fromDB);

        // Apply WHERE clause
        if (options.where) {
          results = results.filter(item => {
            return Object.entries(options.where).every(([key, value]) => {
              return item[key] === value;
            });
          });
        }

        // Apply ORDER BY
        if (options.orderBy) {
          const direction = options.direction === 'DESC' ? -1 : 1;
          results.sort((a, b) => {
            if (a[options.orderBy] < b[options.orderBy]) return -1 * direction;
            if (a[options.orderBy] > b[options.orderBy]) return 1 * direction;
            return 0;
          });
        } else {
          // Default order by primary key descending
          results.sort((a, b) => b[pk] - a[pk]);
        }

        // Apply LIMIT and OFFSET
        if (options.limit !== undefined) {
          const start = options.offset || 0;
          const end = start + options.limit;
          results = results.slice(start, end);
        }

        return results;
      },

      findById: async (id) => {
        const item = store.find(item => item[pk] === id);
        return item ? fromDB(item) : null;
      },

      findBy: async (criteria) => {
        const results = store.filter(item => {
          return Object.entries(criteria).every(([key, value]) => {
            return item[key] === value;
          });
        });
        return results.map(fromDB);
      },

      create: async (data) => {
        const record = toDB(data);
        const id = record[pk] || getNextId(storeName);
        const newItem = { ...record, [pk]: id };
        store.push(newItem);
        return fromDB(newItem);
      },

      update: async (id, changes) => {
        const index = store.findIndex(item => item[pk] === id);
        if (index === -1) return null;
        
        const record = toDB(changes);
        const updatedItem = { ...store[index], ...record };
        store[index] = updatedItem;
        return fromDB(updatedItem);
      },

      delete: async (id) => {
        const index = store.findIndex(item => item[pk] === id);
        if (index === -1) return;
        store.splice(index, 1);
      },

      count: async (criteria = {}) => {
        if (Object.keys(criteria).length === 0) {
          return store.length;
        }
        
        const results = store.filter(item => {
          return Object.entries(criteria).every(([key, value]) => {
            return item[key] === value;
          });
        });
        
        return results.length;
      }
    };

    // --- Functional repository (Either monad) ---

    const functionalRepo = {
      // Standard methods wrapped with Either
      findAll: (options = {}) => {
        return Either.tryCatch(
          () => standardRepo.findAll(options),
          error => `Failed to find records in ${storeName}: ${error.message}`
        );
      },

      findById: (id) => {
        return Either.tryCatch(
          () => standardRepo.findById(id),
          error => `Failed to find record with id ${id} in ${storeName}: ${error.message}`
        ).flatMap(result => {
          if (!result) return Either.Left(`Record with id ${id} not found in ${storeName}`);
          return Either.Right(result);
        });
      },

      findBy: (criteria) => {
        return Either.tryCatch(
          () => standardRepo.findBy(criteria),
          error => `Failed to find records by criteria in ${storeName}: ${error.message}`
        );
      },

      create: (data) => {
        return Either.tryCatch(
          () => standardRepo.create(data),
          error => `Failed to create record in ${storeName}: ${error.message}`
        );
      },

      update: (id, changes) => {
        return functionalRepo.findById(id).flatMap(() => {
          return Either.tryCatch(
            () => standardRepo.update(id, changes),
            error => `Failed to update record with id ${id} in ${storeName}: ${error.message}`
          );
        });
      },

      delete: (id) => {
        return functionalRepo.findById(id).flatMap(() => {
          return Either.tryCatch(
            () => standardRepo.delete(id),
            error => `Failed to delete record with id ${id} from ${storeName}: ${error.message}`
          ).map(() => true);
        });
      },

      count: (criteria = {}) => {
        return Either.tryCatch(
          () => standardRepo.count(criteria),
          error => `Failed to count records in ${storeName}: ${error.message}`
        );
      },

      // Functional query builder
      query: () => {
        const conditions = [];
        let orderBy = null;
        let orderDir = 'ASC';
        let limit = null;
        let offset = null;

        const queryBuilder = {
          where: (field, value) => {
            conditions.push({ field, value, op: 'equals' });
            return queryBuilder;
          },

          whereNot: (field, value) => {
            conditions.push({ field, value, op: 'notEquals' });
            return queryBuilder;
          },

          whereContains: (field, value) => {
            conditions.push({ field, value, op: 'contains' });
            return queryBuilder;
          },

          whereGreaterThan: (field, value) => {
            conditions.push({ field, value, op: 'greaterThan' });
            return queryBuilder;
          },

          whereLessThan: (field, value) => {
            conditions.push({ field, value, op: 'lessThan' });
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
            return Either.tryCatch(() => {
              let results = [...store].map(fromDB);

              // Apply conditions
              conditions.forEach(({ field, value, op }) => {
                results = results.filter(item => {
                  switch (op) {
                    case 'equals':
                      return item[field] === value;
                    case 'notEquals':
                      return item[field] !== value;
                    case 'contains':
                      return String(item[field]).includes(value);
                    case 'greaterThan':
                      return item[field] > value;
                    case 'lessThan':
                      return item[field] < value;
                    default:
                      return true;
                  }
                });
              });

              // Apply ordering
              if (orderBy) {
                const direction = orderDir === 'DESC' ? -1 : 1;
                results.sort((a, b) => {
                  if (a[orderBy] < b[orderBy]) return -1 * direction;
                  if (a[orderBy] > b[orderBy]) return 1 * direction;
                  return 0;
                });
              }

              // Apply limit and offset
              if (limit !== null) {
                const start = offset || 0;
                const end = start + limit;
                results = results.slice(start, end);
              }

              return results;
            }, error => `Query execution failed on ${storeName}: ${error.message}`);
          },

          first: () => {
            return queryBuilder.limit(1).execute().flatMap(results => {
              if (results.length === 0) {
                return Either.Left(`No records found in ${storeName}`);
              }
              return Either.Right(results[0]);
            });
          },

          count: () => {
            return Either.tryCatch(() => {
              let results = [...store].map(fromDB);

              conditions.forEach(({ field, value, op }) => {
                results = results.filter(item => {
                  switch (op) {
                    case 'equals':
                      return item[field] === value;
                    case 'notEquals':
                      return item[field] !== value;
                    case 'contains':
                      return String(item[field]).includes(value);
                    case 'greaterThan':
                      return item[field] > value;
                    case 'lessThan':
                      return item[field] < value;
                    default:
                      return true;
                  }
                });
              });

              return results.length;
            }, error => `Count query failed on ${storeName}: ${error.message}`);
          }
        };

        return queryBuilder;
      },

      // Clear store (useful for testing)
      clear: () => {
        return Either.tryCatch(() => {
          store.length = 0;
          nextIds.set(storeName, 1);
          return true;
        }, error => `Failed to clear ${storeName}: ${error.message}`);
      },

      // Get all data (useful for debugging)
      getAll: () => {
        return Either.Right([...store].map(fromDB));
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
    // In-memory adapter doesn't need to translate schema
    // Return metadata about the schema
    return {
      type: 'in-memory',
      entities: Object.keys(schema.entities),
      timestamp: new Date().toISOString()
    };
  };

  const initializeSchema = async (schema) => {
    // Initialize stores for all entities
    Object.values(schema.entities).forEach(entity => {
      getStore(entity.name);
    });
    return translateSchema(schema);
  };

  const migrate = async (migration) => {
    // In-memory migration support
    if (typeof migration.up === 'function') {
      await migration.up({
        // Provide migration context
        stores,
        nextIds,
        createFunctionalRepository: (schema, entity) => {
          const repos = createFunctionalRepository(schema, entity);
          return repos.standard;
        }
      });
    }
  };

  const migrator = () => {
    const migrations = [];

    const getCurrentVersion = async () => {
      return migrations.length;
    };

    const setVersion = async (version) => {
      // Track applied migrations
      migrations[version - 1] = { applied_at: new Date().toISOString() };
    };

    const run = async (migrationList, targetVersion) => {
      const currentVersion = await getCurrentVersion();
      const toApply = migrationList
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
    // Database handle (in-memory operations)
    database: {
      // Get raw store for debugging
      getStore: (entityName) => getStore(entityName),
      // Clear all stores
      clearAll: () => {
        stores.clear();
        nextIds.clear();
      },
      // Get statistics
      stats: () => ({
        entityCount: stores.size,
        totalRecords: Array.from(stores.values()).reduce((sum, store) => sum + store.length, 0)
      })
    },
    
    // Required persistence contract methods
    translateSchema,
    initializeSchema,
    generateRepository,
    migrate,
    migrator,
    
    // Optional functional extension
    generateFunctionalRepository,
    
    // Helper to get both repositories
    createFunctionalRepository,
    
    // Test utilities
    _stores: stores, // For testing only
    _nextIds: nextIds // For testing only
  };
};

module.exports = { createInMemoryAdapter };