const cors = (options = {}) => {
    const defaults = {
        origin: '*',
        methods: 'GET, POST, PUT, DELETE, OPTIONS',
        headers: 'Content-Type, Authorization'
    };
    
    const config = { ...defaults, ...options };
    
    return (handler) => {
        return async (request) => {
            // Handle preflight requests
            if (request.method === 'OPTIONS') {
                return {
                    status: 204,
                    headers: {
                        'Access-Control-Allow-Origin': config.origin,
                        'Access-Control-Allow-Methods': config.methods,
                        'Access-Control-Allow-Headers': config.headers,
                        'Access-Control-Max-Age': '86400'
                    }
                };
            }
            
            const response = await handler(request);
            
            return {
                ...response,
                headers: {
                    ...response.headers,
                    'Access-Control-Allow-Origin': config.origin,
                    'Access-Control-Allow-Methods': config.methods,
                    'Access-Control-Allow-Headers': config.headers
                }
            };
        };
    };
};

module.exports = { cors };

