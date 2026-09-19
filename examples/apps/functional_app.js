#!/usr/bin/env node

/**
 * Functional Todo Application
 *
 * Architecture:
 *
 *   Schema
 *      |
 *      v
 *   SQLite adapter
 *      |
 *      v
 *   Repository
 *      |
 *      v
 *   Service
 *      |
 *      v
 *   Handler
 *      |
 *      v
 *   Router
 *
 * Dependencies are passed explicitly. There is no container or
 * hidden dependency injection.
 */

const {
    createHttpServer,
    createRouter,
    compose_middlewares,
    convertPureReqResHandlerToServerHandler,
    Schema,
    Types,
    field,
    entity,
    Either,
    createModel,
    required,
    isEmail,
    minLength
} = require('./lib');

const {
    createSQLiteAdapter
} = require('./app/adapters/sqlite.js');


/* -------------------------------------------------------------------------- */
/* Schema                                                                     */
/* -------------------------------------------------------------------------- */

const Todo = entity('Todo', {
    id: field(Types.id, {
        primaryKey: true
    }),

    text: field(Types.string, {
        required: true
    }),

    done: field(Types.boolean, {
        default: false
    }),

    priority: field(Types.integer, {
        default: 1
    }),

    created_at: field(Types.datetime, {
        default: () => new Date().toISOString()
    }),

    updated_at: field(Types.datetime, {
        default: () => new Date().toISOString()
    })
});


const User = entity('User', {
    id: field(Types.id, {
        primaryKey: true
    }),

    name: field(Types.string, {
        required: true
    }),

    email: field(Types.string, {
        required: true,
        unique: true
    }),

    created_at: field(Types.datetime, {
        default: () => new Date().toISOString()
    })
});


const schema = Schema({
    Todo,
    User
});


/* -------------------------------------------------------------------------- */
/* Models                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Models contain business rules.
 *
 * They do not know about SQLite, HTTP, repositories, or requests.
 */

const TodoModel = createModel({
    validate: (data) => {
        return required(
            'text',
            'Todo text is required'
        )(data).flatMap(
            minLength(
                'text',
                3,
                'Todo must be at least 3 characters'
            )
        );
    },

    transforms: [
        data => {
            if (data.priority === undefined) {
                return Either.Right({
                    ...data,
                    priority: 1
                });
            }

            return Either.Right(data);
        },

        data => {
            if (data.done === undefined) {
                return Either.Right({
                    ...data,
                    done: false
                });
            }

            return Either.Right(data);
        },

        data => {
            const now = new Date().toISOString();

            return Either.Right({
                ...data,
                created_at: data.created_at || now,
                updated_at: now
            });
        }
    ]
});


const UserModel = createModel({
    validate: (data) => {
        return required(
            'email',
            'Email is required'
        )(data)
            .flatMap(
                isEmail(
                    'email',
                    'Valid email required'
                )
            )
            .flatMap(
                minLength(
                    'password',
                    8,
                    'Password must be at least 8 characters'
                )
            )
            .flatMap(
                required(
                    'name',
                    'Name is required'
                )
            );
    },

    transforms: [
        data => {
            if (!data.email) {
                return Either.Right(data);
            }

            return Either.Right({
                ...data,
                email: data.email.toLowerCase().trim()
            });
        },

        data => {
            if (data.username || !data.email) {
                return Either.Right(data);
            }

            const username = data.email.split('@')[0];

            return Either.Right({
                ...data,
                username
            });
        }
    ],

    defaults: {
        role: 'user',
        created_at: () => new Date().toISOString()
    }
});


/* -------------------------------------------------------------------------- */
/* Todo service                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Services coordinate business operations.
 *
 * The service knows that a repository exists, but does not know whether
 * the repository is backed by SQLite, PostgreSQL, memory, etc.
 */
const createTodoService = (todoRepository) => {

    const createTodo = async (todoData) => {
        const modelResult = TodoModel.create(todoData);

        if (modelResult.isLeft) {
            return Either.Left(modelResult.value);
        }

        const saveResult = await todoRepository.create(
            modelResult.value
        );

        return saveResult.map(todo => ({
            ...todo,
            url: `/todos/${todo.id}`
        }));
    };


    const getTodo = async (id) => {
        const result = await todoRepository.findById(id);

        return result.map(todo => ({
            ...todo,
            url: `/todos/${todo.id}`
        }));
    };


    const updateTodo = async (id, changes) => {
        const existingResult = await todoRepository.findById(id);

        if (existingResult.isLeft) {
            return existingResult;
        }

        if (existingResult.value === null) {
            return Either.Left(`Todo ${id} not found`);
        }

        const modelResult = TodoModel.update(
            existingResult.value,
            changes
        );

        if (modelResult.isLeft) {
            return modelResult;
        }

        return todoRepository
            .update(id, modelResult.value)
            .then(result =>
                result.map(todo => ({
                    ...todo,
                    url: `/todos/${todo.id}`
                }))
            );
    };


    const deleteTodo = async (id) => {
        const existingResult = await todoRepository.findById(id);

        if (existingResult.isLeft) {
            return existingResult;
        }

        if (existingResult.value === null) {
            return Either.Left(`Todo ${id} not found`);
        }

        const deleteResult = await todoRepository.delete(id);

        return deleteResult.map(() => ({
            message: `Todo ${id} deleted`,
            id
        }));
    };


    const listTodos = async (options = {}) => {
        /*
         * The query builder is deliberately treated as a value.
         *
         * Every operation returns a new builder rather than modifying
         * the previous one. This means queries can safely be branched:
         *
         *     const base = repo.query();
         *     const a = base.where(...);
         *     const b = base.where(...);
         *
         * `a` cannot accidentally modify `b`.
         */

        let query = todoRepository.query();

        if (options.done !== undefined) {
            query = query.where(
                'done',
                options.done === 'true'
            );
        }

        query = query
            .orderBy(
                options.orderBy || 'priority',
                options.direction || 'DESC'
            )
            .limit(
                options.limit
                    ? parseInt(options.limit, 10)
                    : 100
            )
            .offset(
                options.offset
                    ? parseInt(options.offset, 10)
                    : 0
            );

        const result = await query.execute();

        return result.map(todos => ({
            todos: todos.map(todo => ({
                ...todo,
                url: `/todos/${todo.id}`
            })),

            total: todos.length,

            limit: options.limit
                ? parseInt(options.limit, 10)
                : 100,

            offset: options.offset
                ? parseInt(options.offset, 10)
                : 0
        }));
    };


    const searchTodos = async (queryText) => {
        const result = await todoRepository
            .query()
            .whereContains('text', queryText)
            .orderBy('priority', 'DESC')
            .execute();

        return result.map(todos => ({
            todos: todos.map(todo => ({
                ...todo,
                url: `/todos/${todo.id}`
            })),

            count: todos.length,

            query: queryText
        }));
    };


    return {
        createTodo,
        getTodo,
        updateTodo,
        deleteTodo,
        listTodos,
        searchTodos
    };
};


/* -------------------------------------------------------------------------- */
/* HTTP response helpers                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Keeping response construction in one place prevents handlers from
 * repeating the same headers everywhere.
 */

const jsonResponse = (status, body) => ({
    status,

    headers: {
        'Content-Type': 'application/json'
    },

    body: JSON.stringify(body)
});


const eitherResponse = (
    result,
    onLeft,
    onRight
) => {
    return result.fold(
        onLeft,
        onRight
    );
};


/* -------------------------------------------------------------------------- */
/* Todo handlers                                                              */
/* -------------------------------------------------------------------------- */

const createTodoHandlers = (todoService) => {

    const createTodo = async (req) => {
        if (!req.body || Object.keys(req.body).length === 0) {
            return jsonResponse(400, {
                error: 'Request body is required'
            });
        }

        const result = await todoService.createTodo(req.body);

        return eitherResponse(
            result,

            error => jsonResponse(422, {
                error
            }),

            todo => ({
                status: 201,

                headers: {
                    'Content-Type': 'application/json',
                    'Location': `/todos/${todo.id}`
                },

                body: JSON.stringify(todo)
            })
        );
    };


    const getTodo = async (req) => {
        const id = Number.parseInt(
            req.params.id,
            10
        );

        if (Number.isNaN(id)) {
            return jsonResponse(400, {
                error: 'Invalid todo ID'
            });
        }

        const result = await todoService.getTodo(id);

        return eitherResponse(
            result,
            error => jsonResponse(404, {
                error
            }),
            todo => {
                if (todo === null) {
                    return jsonResponse(404, {
                        error: `Todo ${id} not found`
                    });
                }

                return jsonResponse(200, todo);
            }
        );
    };


    const updateTodo = async (req) => {
        const id = Number.parseInt(
            req.params.id,
            10
        );

        if (Number.isNaN(id)) {
            return jsonResponse(400, {
                error: 'Invalid todo ID'
            });
        }

        if (!req.body || Object.keys(req.body).length === 0) {
            return jsonResponse(400, {
                error: 'Request body is required'
            });
        }

        const result = await todoService.updateTodo(
            id,
            req.body
        );

        return eitherResponse(
            result,

            error => {
                const status =
                    String(error).includes('not found')
                        ? 404
                        : 422;

                return jsonResponse(status, {
                    error
                });
            },

            todo => {
                if (todo === null) {
                    return jsonResponse(404, {
                        error: `Todo ${id} not found`
                    });
                }

                return jsonResponse(200, todo);
            }
        );
    };


    const deleteTodo = async (req) => {
        const id = Number.parseInt(
            req.params.id,
            10
        );

        if (Number.isNaN(id)) {
            return jsonResponse(400, {
                error: 'Invalid todo ID'
            });
        }

        const result = await todoService.deleteTodo(id);

        return eitherResponse(
            result,

            error => jsonResponse(404, {
                error
            }),

            message => jsonResponse(200, message)
        );
    };


    const listTodos = async (req) => {
        const options = {
            done: req.query.done,

            orderBy:
                req.query.orderBy ||
                'priority',

            direction:
                req.query.direction ||
                'DESC',

            limit: req.query.limit,

            offset: req.query.offset
        };

        const result = await todoService.listTodos(
            options
        );

        return eitherResponse(
            result,

            error => jsonResponse(500, {
                error
            }),

            response => jsonResponse(200, response)
        );
    };


    const searchTodos = async (req) => {
        const query = req.query.q;

        if (!query) {
            return jsonResponse(400, {
                error: 'Search query (q) is required'
            });
        }

        const result = await todoService.searchTodos(
            query
        );

        return eitherResponse(
            result,

            error => jsonResponse(500, {
                error
            }),

            response => jsonResponse(200, response)
        );
    };


    const getHomePage = async () => {
        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Functional Todo App</title>

    <style>
        body {
            font-family: system-ui, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }

        h1 {
            color: #333;
        }

        .todo {
            background: #f5f5f5;
            padding: 15px;
            margin: 10px 0;
            border-radius: 5px;
        }

        .todo.done {
            background: #e8f5e8;
        }

        .priority {
            display: inline-block;
            padding: 2px 8px;
            background: #ddd;
            border-radius: 4px;
            margin-right: 10px;
        }

        .priority.high {
            background: #ff6b6b;
            color: white;
        }

        .priority.medium {
            background: #ffd166;
        }

        .priority.low {
            background: #06d6a0;
            color: white;
        }

        form {
            margin: 20px 0;
        }

        input,
        textarea,
        select,
        button {
            display: block;
            margin: 10px 0;
            padding: 10px;
            width: 100%;
            box-sizing: border-box;
        }

        button {
            cursor: pointer;
        }

        .error {
            color: #d32f2f;
            background: #ffebee;
            padding: 10px;
            border-radius: 5px;
        }

        .success {
            color: #388e3c;
            background: #e8f5e8;
            padding: 10px;
            border-radius: 5px;
        }
    </style>
</head>

<body>

    <h1>Functional Todo App</h1>

    <div id="messages"></div>

    <h2>Create New Todo</h2>

    <form id="createForm">

        <textarea
            name="text"
            placeholder="What needs to be done?"
            rows="3"
            required
        ></textarea>

        <select name="priority">
            <option value="1">Low Priority</option>
            <option value="2" selected>Medium Priority</option>
            <option value="3">High Priority</option>
        </select>

        <button type="submit">
            Create Todo
        </button>

    </form>

    <h2>Todos</h2>

    <div id="todos">
        <p>Loading todos...</p>
    </div>


    <script>

        async function loadTodos() {
            const response = await fetch('/todos');
            const data = await response.json();

            const todosDiv =
                document.getElementById('todos');

            if (!data.todos || data.todos.length === 0) {
                todosDiv.innerHTML =
                    '<p>No todos yet. Create one above!</p>';

                return;
            }

            todosDiv.innerHTML = data.todos.map(todo => \`
                <div class="todo \${todo.done ? 'done' : ''}">

                    <span class="priority \${
                        todo.priority === 3
                            ? 'high'
                            : todo.priority === 2
                                ? 'medium'
                                : 'low'
                    }">
                        Priority \${todo.priority}
                    </span>

                    <strong>\${todo.text}</strong>

                    <p>

                        <button
                            onclick="toggleTodo(\${todo.id})"
                        >
                            \${todo.done
                                ? 'Mark Not Done'
                                : 'Mark Done'}
                        </button>

                        <button
                            onclick="deleteTodo(\${todo.id})"
                        >
                            Delete
                        </button>

                    </p>
                </div>
            \`).join('');
        }


        document
            .getElementById('createForm')
            .addEventListener('submit', async event => {

                event.preventDefault();

                const formData =
                    new FormData(event.target);

                const todo = {
                    text: formData.get('text'),
                    priority: Number.parseInt(
                        formData.get('priority'),
                        10
                    )
                };

                const response = await fetch('/todos', {
                    method: 'POST',

                    headers: {
                        'Content-Type': 'application/json'
                    },

                    body: JSON.stringify(todo)
                });

                const result =
                    await response.json();

                const messages =
                    document.getElementById('messages');

                if (response.status === 201) {
                    messages.innerHTML =
                        '<div class="success">' +
                        'Todo created successfully!' +
                        '</div>';

                    await loadTodos();

                } else {
                    messages.innerHTML =
                        '<div class="error">' +
                        'Error: ' +
                        result.error +
                        '</div>';
                }

                setTimeout(() => {
                    messages.innerHTML = '';
                }, 3000);
            });


        async function toggleTodo(id) {
            const response = await fetch(
                \`/todos/\${id}\`,
                {
                    method: 'PUT',

                    headers: {
                        'Content-Type': 'application/json'
                    },

                    body: JSON.stringify({
                        done: true
                    })
                }
            );

            if (response.ok) {
                await loadTodos();
            }
        }


        async function deleteTodo(id) {
            if (!confirm('Delete this todo?')) {
                return;
            }

            const response = await fetch(
                \`/todos/\${id}\`,
                {
                    method: 'DELETE'
                }
            );

            if (response.ok) {
                await loadTodos();
            }
        }


        loadTodos();

    </script>

</body>
</html>
`;

        return {
            status: 200,

            headers: {
                'Content-Type': 'text/html'
            },

            body: html
        };
    };


    return {
        createTodo,
        getTodo,
        updateTodo,
        deleteTodo,
        listTodos,
        searchTodos,
        getHomePage
    };
};


/* -------------------------------------------------------------------------- */
/* Application composition                                                    */
/* -------------------------------------------------------------------------- */

/**
 * This is the composition root.
 *
 * Everything is constructed here and dependencies are passed explicitly.
 *
 * No service reaches into global state.
 * No handler creates a repository.
 * No framework code needs to know about SQLite.
 */
async function setupApplication() {

    console.log(
        'Setting up functional todo application...'
    );

    try {

        /* ----------------------------- Adapter ---------------------------- */

        const adapter = createSQLiteAdapter({
            filename: './functional_todos.db',
            tables: {},
            functional: true
        });

        console.log(
            'Created SQLite adapter'
        );


        /* ----------------------------- Schema ----------------------------- */

        await adapter.initializeSchema(schema);

        console.log(
            'Database schema initialized'
        );


        /* --------------------------- Repository -------------------------- */

        const todoEntity =
            schema.entities.Todo;

        const todoRepository =
            adapter.generateFunctionalRepository(
                schema,
                todoEntity
            );

        console.log(
            'Created functional todo repository'
        );


        /* ------------------------------ Service -------------------------- */

        const todoService =
            createTodoService(todoRepository);

        console.log(
            'Created todo service'
        );


        /* ------------------------------ Handlers ------------------------- */

        const handlers =
            createTodoHandlers(todoService);

        console.log(
            'Created route handlers'
        );


        /* -------------------------------- Router -------------------------- */

        const router =
            createRouter();

        router.get(
            '/',
            handlers.getHomePage
        );

        router.get(
            '/todos',
            handlers.listTodos
        );

        router.post(
            '/todos',
            handlers.createTodo
        );

        router.get(
            '/todos/search',
            handlers.searchTodos
        );

        router.get(
            '/todos/:id',
            handlers.getTodo
        );

        router.put(
            '/todos/:id',
            handlers.updateTodo
        );

        router.delete(
            '/todos/:id',
            handlers.deleteTodo
        );


        /* ----------------------------- Middleware ------------------------ */

        const logger = handler => async request => {

            console.log(
                `${request.method} ${request.path}`
            );

            return handler(request);
        };


        const cors = () => handler => async request => {

            const response =
                await handler(request);

            return {
                ...response,

                headers: {
                    ...response.headers,

                    'Access-Control-Allow-Origin': '*',

                    'Access-Control-Allow-Methods':
                        'GET, POST, PUT, DELETE, OPTIONS',

                    'Access-Control-Allow-Headers':
                        'Content-Type'
                }
            };
        };


        const pipeline =
            compose_middlewares(
                logger,
                cors()
            );

        const wrappedRouter =
            pipeline(router);


        /* ------------------------------- Server -------------------------- */

        const server =
            createHttpServer(
                convertPureReqResHandlerToServerHandler(
                    wrappedRouter
                )
            );

        const port = 3000;

        await server.start(port);

        console.log(
            `Functional Todo App running on http://localhost:${port}`
        );


        /* --------------------------- Sample data ------------------------- */

        const sampleTodos = [
            {
                text: 'Learn functional programming',
                priority: 3
            },

            {
                text: 'Write tests for the framework',
                priority: 2
            },

            {
                text: 'Document the functional patterns',
                priority: 1
            }
        ];


        console.log(
            'Adding sample todos...'
        );


        for (const todo of sampleTodos) {

            const result =
                await todoService.createTodo(todo);

            result.fold(
                error => {
                    console.log(
                        `Failed: ${error}`
                    );
                },

                created => {
                    console.log(
                        `Added: ${created.text}`
                    );
                }
            );
        }


        console.log(
            'Application ready.'
        );

    } catch (error) {

        console.error(
            'Failed to start application:',
            error
        );

        process.exit(1);
    }
}


/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

if (require.main === module) {
    setupApplication();
}


module.exports = {
    setupApplication
};

