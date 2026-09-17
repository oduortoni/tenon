/**
 * Article repository — application-level extension over createRepository.
 *
 * Timestamps and publishing helpers live here as application conventions,
 * not framework features.
 */
const { createRepository } = require('../repository');

const createArticleRepository = (db) => {
    const repo = createRepository(db, 'articles', { primaryKey: 'id' });

    return {
        ...repo,

        create: (data) => {
            const now = new Date().toISOString();
            return repo.create({
                ...data,
                created_at: data.created_at || now,
                updated_at: data.updated_at || now
            });
        },

        update: (id, changes) => {
            const now = new Date().toISOString();
            return repo.update(id, {
                ...changes,
                updated_at: changes.updated_at || now
            });
        },

        findBySlug: (slug) => {
            return repo.findBy({ slug }).then(articles => articles[0] || null);
        },

        findByAuthor: (authorId) => {
            return repo.findBy({ author_id: authorId });
        },

        findPublished: () => {
            return repo.findBy({ status: 'published' });
        },

        findDrafts: () => {
            return repo.findBy({ status: 'draft' });
        },

        search: (query) => {
            return db.query(
                `SELECT * FROM articles
                 WHERE title LIKE ? OR content LIKE ?
                 ORDER BY created_at DESC`,
                [`%${query}%`, `%${query}%`]
            );
        },

        publish: (id) => {
            return repo.update(id, {
                status: 'published',
                published_at: new Date().toISOString()
            });
        },

        unpublish: (id) => {
            return repo.update(id, {
                status: 'draft',
                published_at: null
            });
        }
    };
};

module.exports = { createArticleRepository };