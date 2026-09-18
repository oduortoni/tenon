/**
 * Either Monad — Explicit error handling as data.
 * 
 * Either represents a value that is either Right (success) or Left (error).
 * This allows us to handle errors explicitly in the type system,
 * avoiding try/catch spaghetti and making error handling composable.
 * 
 * Rule: NO implicit environments. Every dependency is explicit.
 */

const Either = {
  /**
   * Success constructor — wraps a successful value
   */
  Right: (value) => ({
    isRight: true,
    isLeft: false,
    value,
    
    /**
     * Functor map — transform the value if we're Right
     */
    map: (fn) => {
      try {
        return Either.Right(fn(value));
      } catch (error) {
        return Either.Left(error.message);
      }
    },
    
    /**
     * Monad flatMap — chain operations that return Either
     */
    flatMap: (fn) => {
      try {
        return fn(value);
      } catch (error) {
        return Either.Left(error.message);
      }
    },
    
    /**
     * Fold — handle both cases explicitly
     * @param {Function} leftFn - called with error value if Left
     * @param {Function} rightFn - called with success value if Right
     */
    fold: (leftFn, rightFn) => rightFn(value),
    
    /**
     * Get the value or a default if this is Left (never happens for Right)
     */
    getOrElse: () => value,
    
    /**
     * Convert to Promise (always resolves for Right)
     */
    toPromise: () => Promise.resolve(value),
    
    /**
     * Chain — alias for flatMap
     */
    chain: function(fn) { return this.flatMap(fn); }
  }),
  
  /**
   * Error constructor — wraps an error value
   */
  Left: (error) => ({
    isRight: false,
    isLeft: true,
    value: error,
    
    /**
     * Functor map — does nothing for Left
     */
    map: () => Either.Left(error),
    
    /**
     * Monad flatMap — does nothing for Left
     */
    flatMap: () => Either.Left(error),
    
    /**
     * Fold — handle both cases explicitly
     */
    fold: (leftFn) => leftFn(error),
    
    /**
     * Get the value or a default
     */
    getOrElse: (defaultValue) => defaultValue,
    
    /**
     * Convert to Promise (always rejects for Left)
     */
    toPromise: () => Promise.reject(error),
    
    /**
     * Chain — alias for flatMap
     */
    chain: function() { return this; }
  }),
  
  /**
   * Convenience constructors and utilities
   */
  
  /**
   * of — create a Right from a value (alias for Right)
   */
  of: (value) => Either.Right(value),
  
  /**
   * fromNullable — convert nullable value to Either
   * @param {any} value - value that might be null/undefined
   * @param {string} error - error message if value is null/undefined
   */
  fromNullable: (value, error = 'Value is null or undefined') => {
    if (value === null || value === undefined) {
      return Either.Left(error);
    }
    return Either.Right(value);
  },
  
  /**
   * fromPromise — convert Promise to Promise<Either>
   * @param {Promise} promise - promise to convert
   * @param {string} errorMessage - optional custom error message
   */
  fromPromise: (promise, errorMessage = 'Promise failed') => {
    return promise
      .then(value => Either.Right(value))
      .catch(error => Either.Left(error.message || errorMessage));
  },
  
  /**
   * tryCatch — safely execute a function that might throw
   * @param {Function} fn - function to execute
   * @param {Function} errorFn - function to transform thrown error
   */
  tryCatch: (fn, errorFn = (e) => e.message) => {
    try {
      return Either.Right(fn());
    } catch (error) {
      return Either.Left(errorFn(error));
    }
  },
  
  /**
   * sequence — convert array of Eithers to Either of array
   * Fails if any element is Left
   */
  sequence: (eithers) => {
    const results = [];
    for (const either of eithers) {
      if (either.isLeft) {
        return Either.Left(either.value);
      }
      results.push(either.value);
    }
    return Either.Right(results);
  },
  
  /**
   * traverse — map array values through a function that returns Either
   */
  traverse: (array, fn) => {
    const results = [];
    for (const item of array) {
      const result = fn(item);
      if (result.isLeft) {
        return Either.Left(result.value);
      }
      results.push(result.value);
    }
    return Either.Right(results);
  },
  
  /**
   * lift — convert regular function to return Either
   */
  lift: (fn) => (...args) => {
    try {
      return Either.Right(fn(...args));
    } catch (error) {
      return Either.Left(error.message);
    }
  },
  
  /**
   * compose — compose functions that return Either
   */
  compose: (...fns) => (initialValue) => {
    return fns.reduce(
      (either, fn) => either.flatMap(fn),
      Either.Right(initialValue)
    );
  },
  
  /**
   * pipe — compose functions left-to-right
   */
  pipe: (...fns) => (initialValue) => {
    return fns.reduce(
      (either, fn) => either.flatMap(fn),
      Either.Right(initialValue)
    );
  }
};

/**
 * Functional composition utilities
 */

/**
 * compose — standard function composition (right-to-left)
 */
const compose = (...fns) => (x) => fns.reduceRight((acc, fn) => fn(acc), x);

/**
 * pipe — standard function composition (left-to-right)
 */
const pipe = (...fns) => (x) => fns.reduce((acc, fn) => fn(acc), x);

/**
 * curry — create curried version of function
 */
const curry = (fn) => {
  const curried = (...args) => {
    if (args.length >= fn.length) {
      return fn(...args);
    }
    return (...moreArgs) => curried(...args, ...moreArgs);
  };
  return curried;
};

module.exports = { Either, compose, pipe, curry };