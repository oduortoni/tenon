const rateLimit = (limit, windowMs) => {
    const store = new Map();
    
    return (handler) => {
        return async (request) => {
            const key = request.client.ip;
            const now = Date.now();
            const windowStart = now - windowMs;
            
            // Clean old entries
            const entries = store.get(key) || [];
            const recent = entries.filter(t => t > windowStart);
            
            if (recent.length >= limit) {
                return {
                    status: 429,
                    headers: { 
                        'Content-Type': 'text/plain',
                        'Retry-After': Math.ceil(windowMs / 1000)
                    },
                    body: 'Rate limit exceeded. Please try again later.'
                };
            }
            
            recent.push(now);
            store.set(key, recent);
            
            return await handler(request);
        };
    };
};

module.exports = { rateLimit };

