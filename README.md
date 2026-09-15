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
    entity
} = require('tenon');   // in this repo: require('./lib')
```

## Quick start (single file)

A complete, runnable app in one file:

```js
const {
    createHttpServer,
    createRouter,
    compose_middlewares,
    convertPureReqResHandlerToServerHandler,
    Schema, Types, field, entity
} = require('tenon');

// --- Schema ---
const Todo = entity('Todo', {
    id: field(Types.id, { primaryKey: true }),
    text: field(Types.string, { required: true }),
    done: field(Types.boolean, { default: false })
});
const schema = Schema({ Todo });

// --- Adapter (implements the persistence contract) ---
const { createMemoryAdapter } = require('./app/adapters/memory');
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