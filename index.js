const process = require("node:process");

const {createServer} = require("./lib/server.js");
const {createRouter} = require("./lib/router.js");
const { parseRequest, parseRequestBody } = require('./lib/request');
const {serialize} = require("./lib/response");
const { compose } = require('./lib/middleware');
const { logger, cors, security, rateLimit } = require('./lib/middlewares');
const {handleHome, handleStatic, handleJsonPayload, handleGetAllArticles, handleGetArticle, handlePostArticle} = require("./handlers");

let PORT = 9000;
let HOST = 'localhost';

const router = createRouter();

router.get("/", handleHome);
router.get("/persons/:id", handleHome);
router.get('/api/articles', handleGetAllArticles);
router.post('/api/articles', handlePostArticle);
router.get('/api/articles/:id', handleGetArticle);

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

