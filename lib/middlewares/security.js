const security = (options = {}) => {
    const defaults = {
        csp: "default-src 'self'",
        hsts: 'max-age=31536000; includeSubDomains'
    };
    
    const config = { ...defaults, ...options };
    
    return (handler) => {
        return async (request) => {
            const response = await handler(request);
            
            return {
                ...response,
                headers: {
                    ...response.headers,
                    'X-Content-Type-Options': 'nosniff',
                    'X-Frame-Options': 'DENY',
                    'X-XSS-Protection': '1; mode=block',
                    'Content-Security-Policy': config.csp,
                    'Strict-Transport-Security': config.hsts
                }
            };
        };
    };
};

module.exports = { security };

