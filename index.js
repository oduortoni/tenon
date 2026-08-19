const process = require("node:process");

const {createServer} = require("./twos_server.js");
const {createRouter} = require("./router.js");
const {handleHome, handle404, handleStatic} = require("./twos_handlers.js");

let PORT = 9000;
let HOST = 'localhost';

const router = createRouter();

router.get("/", handleHome);
router.get("/persons/:id", handleHome);
router.get("/css/*", handleStatic);
router.get("/js/*",  handleStatic);
router.get("/images/*", handleStatic);

const requestHandler = async (req, res) => {
	const request = {
		method: req.method,
		url: req.url,
		headers: req.headers,
		params: {},
		body: null,
	};

	const response = await router.route(request);

	res.writeHead(response.status, response.headers || {});
	res.end(response.body || "");
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
