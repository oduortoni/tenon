const {readFile} = require("./twos_files.js");

async function handleHome (request) {	
		let response = {
		    status: 500,
		    headers: {
			    'Content-Type': "text/html",
		    },
		    body: "<h1>Internal server error</h1",
	    };
	    
    	const payload = await readFile("pages/index.html");
	
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

module.exports = {handleHome, handle404};
