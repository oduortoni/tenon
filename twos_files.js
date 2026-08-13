const fspromises = require("node:fs").promises;

const readFile = async (filename) => {
    let payload = {
        error: true,
        data: "",
    };

    try {
        payload.data = await fspromises.readFile(filename, "utf8");
        payload.error = false;        
    } catch (err) {
        console.error(err);
    }

    return payload;
};

module.exports = {
    readFile,
};

