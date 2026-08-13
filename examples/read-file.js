const fs = require("node:fs");
const fspromises = require("node:fs").promises;


function readFileAsyncCallback(filename) {
	fs.readFile(filename, "utf8", (err, data) => {
		if (err) {
			console.log("Error: ", err);
			return err
		}
		console.log("[callback] File content: ", data);
	});
}

function readFileAsyncPromises(filename) {
	fspromises.readFile(filename, "utf8")
		.then(data => console.log("[promises] File content: ", data))
		.catch(err => console.error("Error: ", err));
}


const readFileAsyncAwait = async (filename) => {
	try {
		const data = await fspromises.readFile(filename, "utf8");
		console.log("[async-await] ", data);
	} catch (err) {
		console.error("Error: ", err);
	}
};


readFileAsyncCallback("data/example.txt");
readFileAsyncPromises("data/example.txt");
readFileAsyncAwait("data/example.txt");



