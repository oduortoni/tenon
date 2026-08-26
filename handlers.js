const path = require("node:path");
const stat = require("node:fs/promises").stat;

const { json, html, plain, ok, created, notFound, badRequest, internalError } = require('./lib/response.js');
const {readFile, isdir} = require("./lib/files.js");

async function handleHome (request) {		    
    const payload = await readFile("pages/index.html");
	if (!payload.error) {
	    return html(payload.data);
	}
	return internalError('Internal server error');
}

async function handleJsonPayload (request) {	
	return json(request.body);
}

async function handleStatic(request) {
	const filename = path.join(__dirname, "public", request.url.pathname);
	const prefix = request.url.pathname.split("/")[1];
		
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

let articles = [
    {
        id: 1,
        title: "Article one",
    },
];

function handleGetAllArticles(req) {
    return json({
        articles: articles || [],
        query: req.query,
        timestamp: Date.now()
    });
}

function handleGetArticle(req) {
    // Simulate finding an article
    let id = 1;
    const article = articles[req.params.id || id];
    
    if (!article) {
        return notFound(`Article ${req.params.id} not found`);
    }
    
    return json(article);
}

function handlePostArticle(req) {
    if (!req.body) {
        return badRequest('Missing article data');
    }
    
    const article = {
        id: Date.now(),
        ...req.body,
        createdAt: new Date().toISOString()
    };
    
    articles.push(article);
    console.log("Articles: ", articles);
    
    return created(article, {
        Location: `/api/articles/${article.id}`
    });
}

module.exports = {
	handleJsonPayload,
	handleStatic,
	
	handleHome,
	handleGetAllArticles,
	handleGetArticle,
	handlePostArticle,
};

