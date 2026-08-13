const {createServer} = require("./twos_server.js");
const {handleHome, handle404, handleStatic} = require("./twos_handlers.js");

let PORT = 9000;

const routes = {
	"/": {prefix: false, handler: handleHome},
	"/css": {prefix: true, handler: handleStatic},
	"/js": {prefix: true, handler: handleStatic},
	"/images": {prefix: true, handler: handleStatic},
	"/404": {prefix: false, handler: handle404},
};

const server = createServer(routes);
server.start(PORT, () => console.log(`Server listening on port: ${PORT}`));
