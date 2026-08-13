const http = require("node:http");
const fspromises = require("node:fs").promises;

const readFile = async (filename) => {
    let payload = {
        error: true,
        data: "",
    };

    try {
        payload.data = await fspromises.readFile(filename, "utf8");
        payload.error = false;        
    } catch (err) {
        console.error(err);
    }

    return payload;
};

const routes = {
	"/": {handler: handleHome},
	"/404": {handler: handle404},
};

function findRoute(routes, request) {
	const routesMap = new Map(Object.entries(routes));
	return routes[request.url] ?? routes["/404"];
}

function createServer(routes) {
    return http.createServer(async (http_req, http_res) => {
	   	 const request = httpParseRequest(http_req);

	    const route = findRoute(routes, request);

		const response = await route.handler(request);

		httpSendResponse(http_res, response);
    });
}

async function handleHome (request) {	
		let response = {
		    status: 500,
		    headers: {
			    'Content-Type': "text/html",
		    },
		    body: "<h1>Internal server error</h1",
	    };
	    
    	const payload = await readFile("index.html");
	
	    if (!payload.error) {
		    response.status = 200;
		    response.headers["Content-Length"] = payload.data.length;
		    response.body = payload.data;
	    }
	    return response;
}

function handle404(request) {
	return {
		status: 404,
		headers: {'Content-Type': "text/html"},
		body: "<html><h1>Page not found!</h1></html>",
	};
}

function httpSendResponse(http_res, response) {
	http_res.writeHead(response.status, response.headers);
	http_res.end(response.body);
}

function httpParseRequest(http_req) {
	return {
		method: http_req.method,
		url: http_req.url,
		headers: http_req.headers,
		body: null,
	};
}


let PORT = 9000;
const server = createServer(routes);
server.listen(PORT, () => console.log(`Server listening on port: ${PORT}`));
