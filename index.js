const {createServer} = require("./twos_server.js");
const {handleHome, handle404} = require("./twos_handlers.js");

let PORT = 9000;

const routes = {
	"/": {handler: handleHome},
	"/404": {handler: handle404},
};

const server = createServer(routes);
server.start(PORT, () => console.log(`Server listening on port: ${PORT}`));
