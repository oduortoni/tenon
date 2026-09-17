/**
 * Comments repository — application-level.
 */
const { createRepository } = require('../repository');

const createArticleCommentsRepository = (db) => {
    const repo = createRepository(db, 'comments', { primaryKey: 'id' });

    return {
        ...repo,

        create: (data) => {
            const now = new Date().toISOString();
            return repo.create({
                ...data,
                created_at: data.created_at || now
            });
        }
    };
};

module.exports = { createArticleCommentsRepository };