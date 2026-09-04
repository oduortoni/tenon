const logger = (handler) => {
    return async (request) => {
        const startTime = Date.now();
        console.log(`[log] ${request.method} ${request.path}`);
        
        const response = await handler(request);
        
        const duration = Date.now() - startTime;
        console.log(`[log] ${request.method} ${request.path} → ${response.status} (${duration}ms)`);
        
        return response;
    };
};

module.exports = { logger };

