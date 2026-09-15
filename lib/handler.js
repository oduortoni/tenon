const { parseHttpRequest, parseHttpRequestBody } = require('./request');
const { serializeResponseToHttp } = require('./response');

const convertPureReqResHandlerToServerHandler = (handleRequest) => async (req, res) => {
    try {
        const request = parseHttpRequest(req);
        await parseHttpRequestBody(req, request);
        const response = await handleRequest(request);
        serializeResponseToHttp(response, res);
    } catch (error) {
        console.error('Request error:', error);
        serializeResponseToHttp(
            { status: 500, headers: { 'Content-Type': 'text/plain' }, body: 'Internal Server Error' },
            res
        );
    }
};

module.exports = { convertPureReqResHandlerToServerHandler };