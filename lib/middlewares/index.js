const logger = require("./logger");
const cors = require("./cors");
const security = require("./security");
const rateLimit = require("./rate-limit");

module.exports = {
    ...logger,
    ...cors,
    ...security,
    ...rateLimit,
};

