# tenon

A functional, explicit, composable framework for Node.js. Named primitives you compose — no magic, no hidden state.

## Philosophy

tenon is **not** an application framework with a `createApp()` you configure. It is a library of small, named, functional primitives (composition over middlewares, routers, schema builders, a persistence adapter) that you wire together in your own code.

- **Composition over configuration** — you see every primitive and every choice in your own entry point.
- **Nothing hidden** — the only hidden ritual is converting a pure request → response handler into a Node server handler, and even that is a replaceable, documented function.
- **Storage-agnostic** — SQLite, in-memory, or your own database behind one documented persistence contract.

## Installation

The framework ships in this repository as an importable `lib/` directory:

```js
const {
    createHttpServer,
    createRouter,
    compose_middlewares,
    convertPureReqResHandlerToServerHandler,
    Schema,
    Types,
    field,
    entity,
    // Functional programming utilities
    Either,
    createModel,
    required,
    isEmail,
    minLength
} = require('tenon');   // in this repo: require('./lib')
```

## Quick start (single file)

A complete, runnable app in one file — schema, adapter, router, middleware, server. No scaffolding, no hidden magic:

```js
const {
    createHttpServer,
    createRouter,
    compose_middlewares,
    convertPureReqResHandlerToServerHandler,
    Schema, Types, field, entity
} = require('tenon');   // in this repo: require('./lib')

// --- Schema ---
const Todo = entity('Todo', {
    id: field(Types.id, { primaryKey: true }),
    text: field(Types.string, { required: true }),
    done: field(Types.boolean, { default: false })
});
const schema = Schema({ Todo });

// --- Adapter: a tiny in-memory persistence adapter ---
// Anything that implements the persistence contract works here —
// SQLite, Postgres, mocks, or this in-memory store.
const createMemoryAdapter = () => {
    const store = {};
    const rowsFor = (entity) => (store[entity.name] ||= []);
    const nextId = (entity) =>
        rowsFor(entity).reduce((max, r) => Math.max(max, r.id), 0) + 1;

    const generateRepository = (schema, entity) => {
        const rows = rowsFor(entity);
        return {
            findAll: async () => rows.map(r => ({ ...r })),
            findById: async (id) => rows.find(r => r.id === id) || null,
            findBy: async (criteria) => rows.filter(r =>
                Object.entries(criteria).every(([k, v]) => r[k] === v)),
            create: async (data) => {
                const row = { ...data, [entity.primaryKey]: nextId(entity) };
                rows.push(row);
                return { ...row };
            },
            update: async (id, changes) => {
                const row = rows.find(r => r.id === id);
                if (row) Object.assign(row, changes);
                return row ? { ...row } : null;
            },
            delete: async (id) => {
                const i = rows.findIndex(r => r.id === id);
                if (i !== -1) rows.splice(i, 1);
            },
            count: async (criteria = {}) =>
                Object.keys(criteria).length
                    ? rows.filter(r => Object.entries(criteria)
                        .every(([k, v]) => r[k] === v)).length
                    : rows.length
        };
    };

    return {
        database: {
            query: async () => [], execute: async () => ({}),
            get: async () => null,
            transaction: async (ops) => { for (const op of ops) await op(); },
            close: async () => {}
        },
        translateSchema: () => '',
        initializeSchema: async () => {},
        generateRepository,
        migrate: async () => {},
        migrator: () => ({
            getCurrentVersion: async () => 0,
            setVersion: async () => {},
            run: async () => ({ applied: [], currentVersion: 0 })
        })
    };
};

const adapter = createMemoryAdapter();
adapter.initializeSchema(schema);
const todos = schema.repository(adapter, 'Todo');

// --- Router (a pure request -> response function) ---
const router = createRouter();
router.get('/todos', async (req) => ({
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(await todos.findAll())
}));

router.post('/todos', async (req) => {
    const result = schema.validate('Todo', req.body);
    if (result.errors.length > 0)
        return { status: 422, body: JSON.stringify(result.errors) };
    return {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(await todos.create(result.data))
    };
});

// --- Compose, adapt, start ---
const log = (handler) => async (request) => {
    console.log(request.method, request.path);
    return handler(request);
};

const server = createHttpServer(
    convertPureReqResHandlerToServerHandler(
        compose_middlewares(log)(router)
    )
);
server.start(9000).then(() => console.log('listening on 9000'));
```

### Test the example

Run the file, then exercise it with curl (JSON POSTs need an explicit `Content-Type` — `curl -d` defaults to form encoding):

```sh
node app.js                                  # in another terminal: listening on 9000

# create a todo
curl --json '{"text":"Hello world","done":true}' http://localhost:9000/todos
# -> {"id":1,"text":"Hello world","done":true}

# the same, spelled out with an explicit header
curl -X POST -H "Content-Type: application/json" \
     -d '{"text":"Ship v1","done":false}' http://localhost:9000/todos
# -> {"id":2,"text":"Ship v1","done":false}

# list them
curl http://localhost:9000/todos
# -> [{"id":1,"text":"Hello world","done":true},{"id":2,"text":"Ship v1","done":false}]

# validation: missing required "text"
curl --json '{"done":true}' http://localhost:9000/todos
# -> ["text is required"]
```

Every todo is stored in the in-memory adapter, so a server restart clears the list — switch to the SQLite adapter (see below) for persistence.

## Adapters

An adapter is the pluggable representation of your storage. It implements one documented **persistence contract**; the framework only ever calls through that contract and never branches on adapter type. That is what makes storage swappable without touching your app code.

An adapter must provide five methods — a storage-agnostic contract with no SQL, no query language, no storage-speak:

| Member | Purpose |
|---|---|
| `translateSchema(schema)` | render the schema to the adapter's native format (e.g. DDL for SQL) |
| `initializeSchema(schema)` | create the storage structure (tables/collections) |
| `generateRepository(schema, entity)` | build a CRUD repository for one entity |
| `migrate(migration)` | apply a single migration (adapter's dialect) |
| `migrator()` | `{ getCurrentVersion, setVersion, run }` migration tracking |

`generateRepository` returns the only surface your handlers touch — `findAll`, `findById`, `findBy`, `create`, `update`, `delete`, `count`. This shape is identical across all adapters.

(`adapter.database` is NOT part of the contract — it's the adapter's own escape hatch for your ad-hoc raw queries, and its shape varies per adapter. See `docs/persistence.txt`.)

The repo ships with a SQLite adapter:

```js
const { createSQLiteAdapter } = require('./app/adapters/sqlite');

const adapter = createSQLiteAdapter({
    filename: './database/tenon.db',
    tables: { ArticleTag: 'article_tags' }   // table-name overrides
});

adapter.initializeSchema(schema);
const users = schema.repository(adapter, 'User');
```

Write your own for anything else — Postgres, MongoDB, an in-memory store (see quick start), or a mock for tests. As long as it implements the five contract methods, `schema.repository(adapter, name)` works unchanged. A complete in-memory adapter example and the writing-your-own guide live in `docs/persistence.txt`.

## Structure

A loose, suggested layout keeps concerns visible:

```
├── index.js                <- your composition (entry point)
├── app/
│   ├── models/             <- entities
│   ├── adapters/           <- storage adapter implementation
│   ├── middlewares/        <- (handler) => handler pipelines
│   └── handlers/           <- route handlers
├── docs/                   <- full plain-text documentation
└── tests/                  <- test suite
```

No structure is imposed. Use all of it, some of it, or none — the framework only speaks through primitives.

## Middleware

A middleware is just `(handler) => handler`. Compose them in order:

```js
const logger = (handler) => async (request) => {
    console.log(request.method, request.path);
    return handler(request);
};

const pipeline = compose_middlewares(logger, cors(), rateLimit(100, 60000));
const app = pipeline(router);
```

## Testing

```sh
npm test
```

Runs the suite with `node --test` across `tests/*.test.js`:

- schema composition, JSON loading, validation
- repository CRUD, type round-trips, constraints
- adapter persistence contract (`translateSchema`, `initializeSchema`, `migrate`, `migrator`)

## Documentation

The full plain-text documentation lives in `docs/` — no viewer required, readable in vim, em, or ed:

| File | Contents |
|---|---|
| `docs/index.txt` | the whole framework: philosophy, primitives, two usage styles |
| `docs/schema.txt` | building and composing schemas |
| `docs/router.txt` | routes and patterns |
| `docs/handler.txt` | the pure → server handler adapter |
| `docs/middleware.txt` | the composition idiom |
| `docs/persistence.txt` | the adapter contract |

Every module in `lib/` has a matching doc file.

## The four rules

The framework stays honest by four rules:

1. **A** — the framework never `require()`s from your `app/`.
2. **B** — the framework never branches on adapter type; it only calls the persistence contract.
3. **C** — you see every primitive and every choice in your own code.
4. **D** — schema composition stays visible: `Schema(...)` / `.fromJSON()` is your link between models and the framework.

## Favicon and Images

The `public` directory expects two sub-directories: `favicon` and `images`. `/favicon.ico` resolves to `/public/favicon/`, and other favicon images need the `/favicon/` prefix. Images under `/public/images/` are served with the `/images/` prefix.

## License

ISC