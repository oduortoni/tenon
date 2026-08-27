
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

function createRouter() {
  const routes = [];

   // for chaining, return the router: router.get(...).post(...)
  function add(method, pattern, handler) {
    const route = createRoute(method, pattern, handler);
    routes.push(route);
    return router;
  }

  const router = (request) => {
    for (const route of routes) {
      if (route.matches(request)) {
        return route.handler(request);
      }
    }
    return {
      status: 404,
      headers: { 'Content-Type': 'text/html' },
      body: '<html><h1>Page not found!</h1></html>',
    };
  };

  router.add = add;
  router.get    = (pattern, handler) => add('GET', pattern, handler);
  router.post   = (pattern, handler) => add('POST', pattern, handler);
  router.put    = (pattern, handler) => add('PUT', pattern, handler);
  router.delete = (pattern, handler) => add('DELETE', pattern, handler);
  router.patch  = (pattern, handler) => add('PATCH', pattern, handler);
  
  router.routes = routes;

  return router;
}

module.exports = {
    createRouter,
};

