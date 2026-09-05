const { createRepository } = require('../../lib/repository');
const Reader = require('../../lib/reader');

// Article repository factory
const createArticleCommentsRepository = (db) => {
    const repo = createRepository(db, 'comments', {
        primaryKey: 'id',
        timestamps: true
    });
    
    return {
        // Standard repository methods
        findAll: repo.findAll,
        findById: repo.findById,
        findBy: repo.findBy,
        create: repo.create,
        update: repo.update,
        delete: repo.delete,
        count: repo.count,
    };
};

module.exports = { createArticleCommentsRepository };

