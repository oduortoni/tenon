/**
 * Functional Model Base — Business Logic as Pure Functions
 * 
 * Models are pure functions that encapsulate business logic.
 * Each model function takes explicit inputs and returns Either monad results.
 * 
 * Key principles:
 * 1. Pure functions — same inputs, same outputs, no side effects
 * 2. Explicit dependencies — all dependencies passed as arguments
 * 3. Either monad — error handling as data
 * 4. Composable — functions chain and compose naturally
 */

const { Either, compose, pipe, curry } = require('./either');

/**
 * Create a functional model
 * @param {Object} spec - Model specification
 * @returns {Object} Model instance
 */
const createModel = (spec = {}) => {
  const {
    validate = (data) => Either.Right(data),
    transforms = [],
    rules = [],
    defaults = {},
    sanitizers = []
  } = spec;
  
  /**
   * Model instance
   */
  const model = {
    /**
     * Validate data
     */
    validate: curry((data) => {
      return validate(data);
    }),
    
    /**
     * Apply all transformations
     */
    transform: curry((data) => {
      return transforms.reduce(
        (result, transform) => result.flatMap(transform),
        Either.Right(data)
      );
    }),
    
    /**
     * Apply all business rules
     */
    applyRules: curry((data) => {
      return rules.reduce(
        (result, rule) => result.flatMap(rule),
        Either.Right(data)
      );
    }),
    
    /**
     * Apply all sanitizers
     */
    sanitize: curry((data) => {
      return sanitizers.reduce(
        (result, sanitizer) => result.flatMap(sanitizer),
        Either.Right(data)
      );
    }),
    
    /**
     * Apply default values
     */
    applyDefaults: curry((data) => {
      const withDefaults = { ...defaults, ...data };
      return Either.Right(withDefaults);
    }),
    
    /**
     * Process data through entire model pipeline
     */
    process: curry((data) => {
      return model.validate(data)
        .flatMap(model.sanitize)
        .flatMap(model.applyDefaults)
        .flatMap(model.transform)
        .flatMap(model.applyRules);
    }),
    
    /**
     * Create a new instance (alias for process)
     */
    create: curry((data) => {
      return model.process(data);
    }),
    
    /**
     * Update existing instance
     */
    update: curry((existing, changes) => {
      // Merge changes with existing
      const updated = { ...existing, ...changes };
      return model.process(updated);
    }),
    
    /**
     * Validate for specific operation
     */
    validateFor: (operation) => curry((data) => {
      // Operation-specific validation
      const operationRules = spec[`${operation}Rules`] || [];
      return operationRules.reduce(
        (result, rule) => result.flatMap(rule),
        model.validate(data)
      );
    }),
    
    /**
     * Create a pipeline of operations
     */
    pipeline: (...operations) => {
      return (data) => {
        return operations.reduce(
          (result, operation) => result.flatMap(operation),
          Either.Right(data)
        );
      };
    },
    
    /**
     * Chain with another model
     */
    chain: (nextModel) => {
      return curry((data) => {
        return model.process(data).flatMap(nextModel.process);
      });
    },
    
    /**
     * Map result to different format
     */
    map: (fn) => {
      const newModel = createModel(spec);
      newModel.process = curry((data) => {
        return model.process(data).map(fn);
      });
      return newModel;
    },
    
    /**
     * Add transformation to model
     */
    withTransform: (transform) => {
      return createModel({
        ...spec,
        transforms: [...transforms, transform]
      });
    },
    
    /**
     * Add validation rule to model
     */
    withValidation: (validation) => {
      return createModel({
        ...spec,
        validate: curry((data) => {
          return validate(data).flatMap(validation);
        })
      });
    },
    
    /**
     * Add business rule to model
     */
    withRule: (rule) => {
      return createModel({
        ...spec,
        rules: [...rules, rule]
      });
    },
    
    /**
     * Add sanitizer to model
     */
    withSanitizer: (sanitizer) => {
      return createModel({
        ...spec,
        sanitizers: [...sanitizers, sanitizer]
      });
    },
    
    /**
     * Set default values
     */
    withDefaults: (newDefaults) => {
      return createModel({
        ...spec,
        defaults: { ...defaults, ...newDefaults }
      });
    }
  };
  
  return model;
};

/**
 * Common model utilities
 */

/**
 * Required field validator
 */
const required = (fieldName, message = `${fieldName} is required`) => {
  return (data) => {
    if (data[fieldName] === undefined || data[fieldName] === null || data[fieldName] === '') {
      return Either.Left(message);
    }
    return Either.Right(data);
  };
};

/**
 * Type validator
 */
const isType = (fieldName, type, message = `${fieldName} must be ${type}`) => {
  return (data) => {
    const value = data[fieldName];
    if (value === undefined || value === null) return Either.Right(data);
    
    let isValid = false;
    switch (type) {
      case 'string':
        isValid = typeof value === 'string';
        break;
      case 'number':
        isValid = typeof value === 'number' && !isNaN(value);
        break;
      case 'boolean':
        isValid = typeof value === 'boolean';
        break;
      case 'array':
        isValid = Array.isArray(value);
        break;
      case 'object':
        isValid = typeof value === 'object' && value !== null && !Array.isArray(value);
        break;
      case 'date':
        isValid = value instanceof Date || !isNaN(new Date(value).getTime());
        break;
      default:
        isValid = true;
    }
    
    if (!isValid) {
      return Either.Left(message);
    }
    return Either.Right(data);
  };
};

/**
 * Length validator
 */
const minLength = (fieldName, min, message = `${fieldName} must be at least ${min} characters`) => {
  return (data) => {
    const value = data[fieldName];
    if (value === undefined || value === null) return Either.Right(data);
    
    if (typeof value === 'string' && value.length < min) {
      return Either.Left(message);
    }
    
    if (Array.isArray(value) && value.length < min) {
      return Either.Left(message);
    }
    
    return Either.Right(data);
  };
};

/**
 * Max length validator
 */
const maxLength = (fieldName, max, message = `${fieldName} must be at most ${max} characters`) => {
  return (data) => {
    const value = data[fieldName];
    if (value === undefined || value === null) return Either.Right(data);
    
    if (typeof value === 'string' && value.length > max) {
      return Either.Left(message);
    }
    
    if (Array.isArray(value) && value.length > max) {
      return Either.Left(message);
    }
    
    return Either.Right(data);
  };
};

/**
 * Email validator
 */
const isEmail = (fieldName, message = `${fieldName} must be a valid email`) => {
  return (data) => {
    const value = data[fieldName];
    if (value === undefined || value === null) return Either.Right(data);
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (typeof value === 'string' && !emailRegex.test(value)) {
      return Either.Left(message);
    }
    
    return Either.Right(data);
  };
};

/**
 * Pattern validator
 */
const matches = (fieldName, pattern, message = `${fieldName} must match pattern`) => {
  return (data) => {
    const value = data[fieldName];
    if (value === undefined || value === null) return Either.Right(data);
    
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    if (typeof value === 'string' && !regex.test(value)) {
      return Either.Left(message);
    }
    
    return Either.Right(data);
  };
};

/**
 * Range validator
 */
const inRange = (fieldName, min, max, message = `${fieldName} must be between ${min} and ${max}`) => {
  return (data) => {
    const value = data[fieldName];
    if (value === undefined || value === null) return Either.Right(data);
    
    if (typeof value === 'number' && (value < min || value > max)) {
      return Either.Left(message);
    }
    
    return Either.Right(data);
  };
};

/**
 * Custom validator builder
 */
const validator = (fieldName, testFn, message) => {
  return (data) => {
    const value = data[fieldName];
    if (value === undefined || value === null) return Either.Right(data);
    
    if (!testFn(value, data)) {
      return Either.Left(message || `${fieldName} is invalid`);
    }
    
    return Either.Right(data);
  };
};

/**
 * Transform field
 */
const transform = (fieldName, transformFn) => {
  return (data) => {
    const value = data[fieldName];
    if (value === undefined || value === null) return Either.Right(data);
    
    const transformed = transformFn(value);
    return Either.Right({ ...data, [fieldName]: transformed });
  };
};

/**
 * Set default value
 */
const defaultValue = (fieldName, value) => {
  return (data) => {
    if (data[fieldName] === undefined || data[fieldName] === null) {
      const defaultVal = typeof value === 'function' ? value() : value;
      return Either.Right({ ...data, [fieldName]: defaultVal });
    }
    return Either.Right(data);
  };
};

/**
 * Sanitize field (trim, lowercase, etc.)
 */
const sanitize = (fieldName, sanitizerFn) => {
  return (data) => {
    const value = data[fieldName];
    if (value === undefined || value === null) return Either.Right(data);
    
    if (typeof value === 'string') {
      const sanitized = sanitizerFn(value);
      return Either.Right({ ...data, [fieldName]: sanitized });
    }
    
    return Either.Right(data);
  };
};

module.exports = {
  createModel,
  
  // Validators
  required,
  isType,
  minLength,
  maxLength,
  isEmail,
  matches,
  inRange,
  validator,
  
  // Transformers
  transform,
  defaultValue,
  sanitize,
  
  // Composition utilities
  compose,
  pipe,
  curry
};
