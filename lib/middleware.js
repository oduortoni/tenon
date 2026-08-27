// Middleware pipeline
const compose = (...middlewares) => {
    return (handler) => {
        return middlewares.reduceRight((acc, middleware) => {
            return middleware(acc);
        }, handler);
    };
};

// Middleware that does nothing (identity)
const noop = (handler) => handler;

// Combine middleware arrays
const combine = (...middlewareArrays) => {
    return middlewareArrays.flat();
};

module.exports = { compose, noop, combine };

