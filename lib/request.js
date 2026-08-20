const { parseQuery, parseBody, parseCookies, parseHeaders } = require('./parsers');

/**
 * Parses an HTTP request into a structured object
 * @param {IncomingMessage} req — Node.js request object
 * @returns {Object} Parsed request
 */
const parseRequest = (req) => {
    // Parse URL
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    
    // Parse headers (case-insensitive)
    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
        headers[key.toLowerCase()] = value;
    }
    
    // Parse cookies
    const cookies = parseCookies(headers.cookie);
    
    // Parse query parameters
    const query = Object.fromEntries(url.searchParams);
    
    // Parse client information
    const client = {
        ip: req.socket.remoteAddress,
        port: req.socket.remotePort,
        userAgent: headers['user-agent'],
        accept: headers['accept'],
        acceptLanguage: headers['accept-language']
    };
    
    return {
        method: req.method.toUpperCase(),
        url: url,
        path: url.pathname,
        query: query,
        headers: headers,
        cookies: cookies,
        client: client,
        body: null,  // Will be parsed asynchronously
        params: {}   // Will be filled by router
    };
};

/**
 * Asynchronously parses the request body
 * @param {IncomingMessage} req — Node.js request object
 * @param {Object} parsedRequest — The parsed request object
 * @returns {Promise‹Object›} Request with parsed body
 */
const parseRequestBody = (req, parsedRequest) => {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const contentType = parsedRequest.headers['content-type'];
            if (contentType) {
                const parsedBody = parseBody(contentType, body);
                parsedRequest.body = parsedBody.found ? parsedBody.value : null;
                parsedRequest.bodyError = parsedBody.found ? null : parsedBody.error;
            }
            resolve(parsedRequest);
        });
        req.on('error', reject);
    });
};

module.exports = { parseRequest, parseRequestBody };
