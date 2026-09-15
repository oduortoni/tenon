const compose_middlewares = (...middlewares) => {
    return (handler) => {
        return middlewares.reduceRight((acc, middleware) => {
            return middleware(acc);
        }, handler);
    };
};

const identity_middleware = (handler) => handler;

const concat_middlewares = (...middlewareArrays) => {
    return middlewareArrays.flat();
};

module.exports = { compose_middlewares, identity_middleware, concat_middlewares };