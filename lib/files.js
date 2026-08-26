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

async function isdir(filename) {
	try {
		const fileStat = await stat(filename);
		return fileStat.isDirectory();
	} catch(err) {
		if(err.code == 'ENOENT') { // no such file entry
			console.error("[isdir] no file entry: ", err);
			return false;
		}
		console.error("[isdir] ", err);
		return false;
	}
}

module.exports = {
    readFile,
    isdir
};

