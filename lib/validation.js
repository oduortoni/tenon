const validate = (entity, data) => {
    const errors = [];
    const result = {};

    for (const [name, field] of Object.entries(entity.fields)) {
        const value = data[name];

        if (field.required && (value === undefined || value === null)) {
            errors.push(`${name} is required`);
            continue;
        }

        if (value !== undefined && value !== null) {
            if (field.type.validate) {
                if (!field.type.validate(value)) {
                    errors.push(`${name} has invalid type (expected ${field.type.name})`);
                    continue;
                }
            }

            if (field.validate) {
                const customError = field.validate(value);
                if (customError) {
                    errors.push(`${name}: ${customError}`);
                    continue;
                }
            }
        }

        if (value === undefined && field.default !== null && field.default !== undefined) {
            result[name] = typeof field.default === 'function' ? field.default() : field.default;
        } else {
            result[name] = value;
        }
    }

    return { errors, data: result };
};

module.exports = { validate };
