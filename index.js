const process = require('node:process');

const {
    createHttpServer,
    createRouter,
    compose_middlewares,
    convertPureReqResHandlerToServerHandler,
    Schema
} = require('./lib');

const { logger, cors, security, rateLimit } = require('./app/middlewares');
const { createSQLiteAdapter } = require('./app/adapters/sqlite');
const models = require('./app/models');
const handlers = require('./app/handlers');

const PORT = 9000;
const HOST = 'localhost';

const schema = Schema(models);

const adapter = createSQLiteAdapter({
    filename: './database/tonis.db',
    tables: { ArticleTag: 'article_tags' }
});

adapter.initializeSchema(schema)
    .then(() => console.log('Schema initialized'))
    .catch(err => {
        console.error('Schema initialization failed:', err);
        process.exit(1);
    });

const usersRepo = schema.repository(adapter, 'User');
const articlesRepo = schema.repository(adapter, 'Article');
const commentsRepo = schema.repository(adapter, 'Comment');

articlesRepo.findBySlug = (slug) =>
    articlesRepo.findBy({ slug }).then(results => results[0] || null);

usersRepo.softDelete = (id) =>
    usersRepo.update(id, { deleted_at: new Date() });

const router = createRouter();

router.get('/', handlers.handleHome);
router.get('/persons/:id', handlers.handleHome);
router.post('/json', handlers.handleJsonPayload);
router.get('/css/*', handlers.handleStatic);
router.get('/js/*', handlers.handleStatic);
router.get('/favicon/*', handlers.handleStatic);
router.get('/favicon.ico', handlers.handleStatic);
router.get('/images/*', handlers.handleStatic);
router.post('/api/users', handlers.handleCreateUser(usersRepo, schema));
router.get('/api/users/:id', handlers.handleGetUserById(usersRepo));
router.get('/api/articles', handlers.handleGetAllArticles(articlesRepo));
router.get('/api/articles/:id', handlers.handleGetArticle(articlesRepo));
router.post('/api/articles', handlers.handlePostArticle(articlesRepo, schema));
router.post('/api/articles/:articleId/comments', handlers.handleCreateArticlesComments(commentsRepo, schema));

const middleware_pipeline = compose_middlewares(
    logger,
    cors(),
    security(),
    rateLimit(100, 60000)
);

const handleRequest = middleware_pipeline(router);
const requestHandler = convertPureReqResHandlerToServerHandler(handleRequest);

const server = createHttpServer(requestHandler);
server.start(PORT, HOST)
    .then(() => console.log(`Server listening on port: ${PORT}`))
    .catch(err => {
        console.error('[server] failed to start:', err);
        process.exit(1);
    });

process.on('SIGTERM', () => {
    server.stop().then(() => process.exit(0));
});




