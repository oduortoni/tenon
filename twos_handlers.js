const path = require("node:path");
const stat = require("node:fs/promises").stat;

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

async function isdir(filename) {
	try {
		const fileStat = await stat(filename);
		return fileStat.isDirectory();
	} catch(err) {
		if(err.code == 'ENOENT') { // no such file entry
			console.error("[isdir] no file entry: ", err);
			return false;
		}
		console.error("[isdir] ", err);
		return false;
	}
}

async function handleStatic(request) {
	const filename = path.join(__dirname, "public", request.url);
	const prefix = request.url.split("/")[1];
		
	let response = {
	    status: 500,
	    headers: {
		    'Content-Type': "text/html",
	    },
	    body: "<h1>Internal server error</h1",
	};

	let isDir = await isdir(filename);
	if(isDir) {
		// least information possible to the client
		// we simply do not server directories
		response.status = 404;
		response.body = "<html><h1>404 page not found</h1></html>";
		return response;
	}
	    
    	const payload = await readFile(filename);
	
	if (!payload.error) {
	    response.status = 200;
	    response.headers["Content-Length"] = payload.data.length;
	    switch(prefix) {
		    case "css":
			    response.headers["Content-Type"] = "text/css";
			break;
		    case "js":
			    response.headers["Content-Type"] = "text/javascript";
			break;
		    default:
			    response.headers["Content-Type"] = "application/glob";
			break;

	    }
	    response.body = payload.data;
	}

	return response;
}



module.exports = {
	handleHome,
	handle404,
	handleStatic
};

