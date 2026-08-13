const process = require("node:process");

const {createServer} = require("./twos_server.js");
const {handleHome, handle404, handleStatic} = require("./twos_handlers.js");

let PORT = 9000;
let HOST = 'localhost';

const routes = {
	"/": {prefix: false, handler: handleHome},
	"/css": {prefix: true, handler: handleStatic},
	"/js": {prefix: true, handler: handleStatic},
	"/images": {prefix: true, handler: handleStatic},
	"/404": {prefix: false, handler: handle404},
};

const server = createServer(routes);
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
