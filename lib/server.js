const http = require("node:http");

function createServer(handle) {
    const server = http.createServer(async (http_req, http_res) => {
	   // const request = httpParseRequest(http_req);
	    handle(http_req, http_res);
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
			    console.log("Attempting to shutdown server gracefully ...");
			    if(err) {
				    console.error("[shutdown] error on shutdown", err);
				    reject(err);
				    return;
			    }
			    console.log("[shutdown] successfully shutting down");
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

module.exports = {
	createServer,
};

