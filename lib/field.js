const field = (type, options = {}) => ({
    type,
    required: options.required || false,
    unique: options.unique || false,
    default: options.default || null,
    primaryKey: options.primaryKey || false,
    foreignKey: options.foreignKey || null,
    validate: options.validate || null
});

module.exports = { field };
