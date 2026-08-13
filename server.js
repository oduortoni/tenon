const http = require("node:http");
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

const server = http.createServer(async (req, res) => {
	const payload = await readFile("index.html");
	if (payload.error) {
		res.writeHead(404, {
			'Content-Type': "text/html",
		});
		res.end("<h1>Page not found</h1>");
	} else {
		res.writeHead(200, {
			'Content-Type': "text/html",
			'Content-Length': payload.data.length,
			'Cookie': "Session-twos 9ef000fed009009ce",
		});
		res.end(payload.data);
	}
});

let PORT = 9000;
server.listen(PORT, () => console.log(`Server listening on port: ${PORT}`));
