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
    if(request.url.pathname == "/favicon.ico") {
        request.url.pathname = `/favicon${request.url.pathname}`;
    }
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
	    
	    
	    const path = require("path");
        const ext = path.extname(filename).slice(1).toLowerCase(); // ".ico" -> "ico"
        switch (ext) {
            case "css":
                response.headers["Content-Type"] = "text/css";
                break;
            case "js":
                response.headers["Content-Type"] = "text/javascript";
                break;
            case "png":
                response.headers["Content-Type"] = "image/png";
                break;
            case "jpg":
            case "jpeg":
                response.headers["Content-Type"] = "image/jpeg";
                break;
            case "ico":
                response.headers["Content-Type"] = "image/x-icon";
                break;
            case "webmanifest":
                response.headers["Content-Type"] = "application/manifest+json";
                break;
            default:
                response.headers["Content-Type"] = "application/octet-stream";
                break;
        }
	    response.body = payload.data;
	    
        return response;
	}

	return response;
}

//let articles = [
//    {
//        id: 1,
//        title: "Article one",
//    },
//];

/**
*
* Transitioning to repositories
*/

async function createTestUserAndArticles(usersRepository, articlesRepository) {
    try {
        // 1. Create the 'root' seed user
        const user = await usersRepository.create({
            name: 'Root Administrator',
            email: 'root@example.com',
            // Note: In production, remember to hash passwords (e.g., using bcrypt)
            password: 'root1234' 
        });

        console.log(`[Seed] Created test user: ${user.name} (ID: ${user.id})`);

        // 2. Define the content for the 3 distinct articles
        const testArticlesData = [
            {
                title: "The Ship of Theseus and Identity",
                content: "If an object has all of its components replaced one by one over time, does it fundamentally remain the same object? This deep philosophical paradox challenges our structural understanding of persistence, essence, and what it truly means for an entity to maintain its identity across time and change.",
                status: "published",
                author_id: user.id
            },
            {
                title: "Understanding Functors in Functional Programming",
                content: "Essentially, a functor is any data structure or type that can be mapped over. It acts as a container holding a value that implements a 'map' function, allowing you to apply a transformation safely to the inner value without breaking or modifying the structure of the container itself.",
                status: "published",
                author_id: user.id
            },
            {
                title: "The Core Definition of an Agent in Political Science",
                content: "In political theory, an agent is an individual, collective group, or institution that possesses the capacity and autonomy to make decisions and exert power. The study of agency explores how these political actors operate within structural constraints to influence policies, power dynamics, and historical shifts.",
                status: "draft",
                author_id: user.id
            }
        ];

        // 3. Insert the articles sequentially into the database
        const createdArticles = [];
        for (const data of testArticlesData) {
            const article = await articlesRepository.create(data);
            createdArticles.push(article);
            console.log(`[Seed] Created article: "${article.title}" (ID: ${article.id})`);
        }

        return {
            status: 201,
            message: "Seed data successfully populated!",
            userId: user.id,
            articlesCreated: createdArticles.length
        };

    } catch (error) {
        console.error("[Seed Error] Failed to generate test data:", error);
        throw error;
    }
}

//async function handleGetAllArticles(req) {
//    return json({
//        articles: articles || [],
//        query: req.query,
//        timestamp: Date.now()
//    });
//}

function handleGetAllArticles(articlesRepository) {
    return async (req) => {
        const allArticles = await articlesRepository.findAll();
        return {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(allArticles)
        };
    };
}

//function handleGetArticle(req) {
//    // Simulate finding an article
//    let id = 1;
//    const article = articles[req.params.id || id];
//    
//    if (!article) {
//        return notFound(`Article ${req.params.id} not found`);
//    }
//    
//    return json(article);
//}

function handleGetArticle(articlesRepository) {
    return async (req) => {
        const article = await articlesRepository.findById(req.params.id);
        if (!article) {
            return { status: 404, body: 'Article not found' };
        }
        return {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(article)
        };
    };
}

//function handlePostArticle(req) {
//    if (!req.body) {
//        return badRequest('Missing article data');
//    }
//    
//    const article = {
//        id: Date.now(),
//        ...req.body,
//        createdAt: new Date().toISOString()
//    };
//    
//    articles.push(article);
//    console.log("Articles: ", articles);
//    
//    return created(article, {
//        Location: `/api/articles/${article.id}`
//    });
//}

function handlePostArticle(articlesRepository) {
    return async (req) => {
        if (!req.body) {
            return { status: 400, body: 'Missing article data' };
        }
        const article = await articlesRepository.create(req.body);
        return {
            status: 201,
            headers: { 
                'Content-Type': 'application/json',
                'Location': `/api/articles/${article.id}`
            },
            body: JSON.stringify(article)
        };
    };
}

module.exports = {
	handleJsonPayload,
	handleStatic,
	
	handleHome,
	handleGetAllArticles,
	handleGetArticle,
	handlePostArticle,
	createTestUserAndArticles
};

