const {handle404} = require("./twos_handlers.js");

const patternToRegex = (pattern) => {
    const paramNames = [];
    
    // Convert pattern to regex string
    let regexPattern = pattern;
    
    // Replace * with .* (glob wildcard)
    regexPattern = regexPattern.replace(/\*/g, '.*');
    
    // Replace :param with capture groups
    const paramRegex = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
    regexPattern = regexPattern.replace(paramRegex, (_, paramName) => {
        paramNames.push(paramName);
        return '([^/]+)';
    });
    
    // Create regex with start and end anchors
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return { regex, paramNames };
};

class Route {
    constructor(method, pattern, handler) {
        const { regex, paramNames } = patternToRegex(pattern);
        this.method = method.toUpperCase();
        this.pattern = pattern;
        this.regex = regex;
        this.paramNames = paramNames;
        this.handler = handler;
    }

    matches(request) {
        if (this.method !== request.method.toUpperCase()) {
            return false;
        }

        const match = request.url.pathname.match(this.regex);
        if (!match) {
            return false;
        }

        // Extract parameters
        const params = {};
        for (let i = 0; i < this.paramNames.length; i++) {
            params[this.paramNames[i]] = match[i + 1];
        }

        request.params = { ...request.params, ...params };
        
        return true;
    }
}

const createRoute = (method, pattern, handler) => {
    return new Route(method, pattern, handler);
};

class Router {
    constructor() {
        this.routes = [];
    }
    
    route(request) {
        for (const route of this.routes) {
            if (route.matches(request)) {
                return route.handler(request);
            }
        }
        return handle404(request);
    }
    
    add(method, pattern, handler) {
        const route = createRoute(method, pattern, handler);
        this.routes.push(route);
        return this; // Fixed: return this instead of router
    }
    
    get(pattern, handler) { 
        return this.add('GET', pattern, handler); 
    }
    
    post(pattern, handler) { 
        return this.add('POST', pattern, handler); 
    }
    
    put(pattern, handler) { 
        return this.add('PUT', pattern, handler); 
    }
    
    delete(pattern, handler) { 
        return this.add('DELETE', pattern, handler); 
    }
    
    patch(pattern, handler) { 
        return this.add('PATCH', pattern, handler); 
    }
}

const createRouter = () => {
    return new Router();
};

module.exports = {
    createRouter,
};

