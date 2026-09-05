const process = require("node:process");

const {createServer} = require("./lib/server.js");
const {createRouter} = require("./lib/router.js");
const { parseRequest, parseRequestBody } = require('./lib/request');
const {serialize} = require("./lib/response");
const { compose } = require('./lib/middleware');
const { logger, cors, security, rateLimit } = require('./app/middlewares');
const {handleHome, handleStatic, handleJsonPayload, handleGetAllArticles, handleGetArticle, handleGetArticleBySlug, handleCreateArticlesComments, handlePostArticle} = require("./handlers");

let PORT = 9000;
let HOST = 'localhost';

/**
*
* Generate a test user and a few articlesCreated
*/
const { createArticleRepository } = require('./app/repositories/articles');
const { createUserRepository } = require("./app/repositories/users");
const { createArticleCommentsRepository } = require("./app/repositories/comments");
const { createTestUserAndArticles, handleCreateUser, handleGetUserById } = require("./handlers");


const {createDatabase} = require("./lib/database");
const { createSQLiteAdapter } = require('./app/adapters/sqlite');
const sqliteConfig = {
    filename: './database/tonis.db',
};
const sqliteImpl = createSQLiteAdapter(sqliteConfig);
const database = createDatabase(sqliteImpl.database);

const usersRepository = createUserRepository(database);
const articlesRepository = createArticleRepository(database);
const articleCommentsRepository = createArticleCommentsRepository(database);

//createTestUserAndArticles(usersRepository, articlesRepository);

const router = createRouter();

router.get("/", handleHome);
router.get("/persons/:id", handleHome);

// User routes
router.post('/api/users', handleCreateUser(usersRepository));
router.get('/api/users/:id', handleGetUserById(usersRepository));

// Article routes
router.get('/api/articles', handleGetAllArticles(articlesRepository));
router.get('/api/articles/:id', handleGetArticle(articlesRepository));
router.post('/api/articles', handlePostArticle(articlesRepository));
router.get('/api/articles/:slug', handleGetArticleBySlug(articlesRepository));

// Article Comments routes
router.post('/api/articles/:articleId/comments', handleCreateArticlesComments(articleCommentsRepository));


// try json payload for example:
// curl -X POST -d '{"name":"toni","babe":"Rij"}' -H "Content-Type: application/json" http://localhost:9000/json
router.post("/json", handleJsonPayload);

router.get("/css/*", handleStatic);
router.get("/js/*",  handleStatic);
router.get("/favicon/*", handleStatic);
router.get("/favicon.ico", handleStatic);
router.get("/images/*", handleStatic);

// Build middleware pipeline
const pipeline = compose(
    logger,                    // Log all requests
    cors(),                    // Enable CORS
    security(),                // Add security headers
    rateLimit(100, 60000)      // 100 requests per minute
);

// Apply middleware to router
const middlewareWrappedRouter = pipeline(router);

const requestHandler = async (req, res) => {
    try {
        // parse the headers synchronously so we can begin working with them immediately
	    const request = parseRequest(req);
	    
	    // parse the body asynchronously since it may be too big
	    await parseRequestBody(req, request);

	    const response = await middlewareWrappedRouter(request);
	    
	    // Serialize and send the response
        serialize(response, res);
	} catch(error) {
	    console.error('Request error:', error);
        serialize(
            { status: 500, headers: { 'Content-Type': 'text/plain' }, body: 'Internal Server Error' },
            res
        );
	}
};

const server = createServer(requestHandler);
server.start(PORT, HOST)
	.then(() => console.log(`Server listening on port: ${PORT}`))
	.catch(err => {
		console.error("[server] failed to start server: ", err);
		process.exit(1);
	});


process.on('SIGTERM', () => {
	server.stop()
		.then(() => process.exit(0))
		.catch(err => {
			console.error("[server_exit] ", err);
			process.exit(1);
		});
});

