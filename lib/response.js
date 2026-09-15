
/**
*
* Response factory
*/

const response = (status, body, headers = {}) => ({
    status,
    headers: { ...headers },
    body
});

// Convenience constructors
const ok = (body, headers = {}) => response(200, body, headers);
const created = (body, headers = {}) => response(201, body, headers);
const noContent = (headers = {}) => response(204, null, headers);
const moved = (location, permanent = true) => ({
    status: permanent ? 301 : 302,
    headers: { Location: location },
    body: null
});
const badRequest = (body, headers = {}) => response(400, body, headers);
const unauthorized = (body, headers = {}) => response(401, body, headers);
const forbidden = (body, headers = {}) => response(403, body, headers);
const notFound = (body, headers = {}) => response(404, body, headers);
const internalError = (body, headers = {}) => response(500, body, headers);

/**
*
* Response transformers
*/

const json = (body) => ({
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
});

const html = (body) => {
    return {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
        body
    };
}

const plain = (body) => ({
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
    body
});

// Transform an existing response
const transform = (response, transformations) => {
    return transformations.reduce((acc, fn) => fn(acc), response);
};

// Response combinators
const withHeaders = (response, headers) => ({
    ...response,
    headers: { ...response.headers, ...headers }
});

const withStatus = (response, status) => ({
    ...response,
    status
});

const withBody = (response, body) => ({
    ...response,
    body
});

const cache = (response, maxAge) => 
    withHeaders(response, { 'Cache-Control': `max-age=${maxAge}` });

const cors = (response) => withHeaders(response, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
});

const compress = (response) => 
    withHeaders(response, { 'Content-Encoding': 'gzip' });


/**
*
* HTTP serializer — writes a pure Response to a Node ServerResponse
*/

const serializeResponseToHttp = (response, res) => {
    let body;
    if (response.body === null) {
        body = '';
    } else if (Buffer.isBuffer(response.body)) {
        body = response.body; // pass through untouched
    } else if (typeof response.body === 'string') {
        body = response.body;
    } else {
        body = JSON.stringify(response.body);
    }

    res.writeHead(response.status, response.headers || {});

    if (body && body.length) {
        res.end(body);
    } else {
        res.end();
    }
};

// Streaming serializer
const serializeStream = (response, res) => {
    res.writeHead(response.status, response.headers || {});
    
    if (response.body && typeof response.body[Symbol.iterator] === 'function') {
        // Generator-based streaming
        for (const chunk of response.body) {
            res.write(chunk);
        }
        res.end();
    } else if (response.body && typeof response.body.pipe === 'function') {
        // Stream-based streaming (e.g., file streams)
        response.body.pipe(res);
    } else {
        // Fallback to regular serialization
        serializeResponseToHttp(response, res);
    }
};

module.exports = { 
    /* factory and convenience constructors */
    response,
    ok,
    created,
    noContent,
    moved,
    badRequest,
    unauthorized,
    forbidden,
    notFound,
    internalError,
    
    /* transformers */
    json,
    html,
    plain,
    transform,
    withHeaders,
    withStatus,
    withBody,
    cache,
    cors,
    compress,
    
    /* serializers */
    serializeResponseToHttp,
    serializeStream,
};



