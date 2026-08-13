const http = require("node:http");

function createServer(routes) {
    const server = http.createServer(async (http_req, http_res) => {
	    const request = httpParseRequest(http_req);
	    const route = findRoute(routes, request);
	    try {
		    const response = await route.handler(request);
		    httpSendResponse(http_res, response);
	    } catch (err) {
		    // should be an internal server error but will find a better way to do so
		    console.error("[handler] failed to handle request", err);
		    return;
	    }
    });

    server.start = (port = 9000, host = 'localhost') => {
	    return new Promise((resolve, rejact) => {
		    server.listen(port, host,  (err) => {
			    if(err) {
				    reject(err);
				    return;
			    }
			    resolve();
		    });
	    });
    };

    server.stop = (() => {
	    return new Promise((resolve, reject) => {
		    server.close((err) => {
			    if(err) {
				    reject(err);
				    return;
			    }
			    resolve();
		    });
	    });
    });

    return server;
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

function findRoute(routes, request) {
	const routesMap = new Map(Object.entries(routes));

	const uri = `/${request.url.split("/")[1]}`;

	return routes[uri] ?? routes["/404"];
}

module.exports = {
	createServer,
};

