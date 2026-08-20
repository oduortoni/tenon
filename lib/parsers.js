const parseHeaders = (rawHeaders) => {
    const headers = {};
    for (const [key, value] of Object.entries(rawHeaders)) {
        headers[key.toLowerCase()] = value;
    }
    return headers;
};

const parseCookies = (cookieHeader) => {
    if (!cookieHeader) return {};
    return cookieHeader.split(';')
        .map(c => c.trim())
        .reduce((acc, cookie) => {
            const [key, value] = cookie.split('=');
            if (key && value) {
                acc[key.trim()] = decodeURIComponent(value.trim());
            }
            return acc;
        }, {});
};

const parseQuery = (url) => {
    return Object.fromEntries(url.searchParams);
};

const parseBody = (contentType, body) => {
    if (!contentType) {
        return { found: true, value: body };
    }
    
    const parsers = {
        'application/json': (b) => {
            try { return { found: true, value: JSON.parse(b) }; }
            catch (e) { return { found: false, error: 'Invalid JSON' }; }
        },
        'application/x-www-form-urlencoded': (b) => {
            try {
                const params = new URLSearchParams(b);
                return { found: true, value: Object.fromEntries(params) };
            } catch (e) {
                return { found: false, error: 'Invalid form data' };
            }
        },
        'text/plain': (b) => {
            return { found: true, value: b };
        }
    };
    
    const parser = parsers[contentType];
    if (!parser) {
        return { found: false, error: `Unsupported content type: ${contentType}` };
    }
    return parser(body);
};

module.exports = { parseHeaders, parseCookies, parseQuery, parseBody };

