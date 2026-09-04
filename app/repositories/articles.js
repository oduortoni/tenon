const { createRepository } = require('../../lib/repository');
const Reader = require('../../lib/reader');

// Article repository factory
const createArticleRepository = (db) => {
    const repo = createRepository(db, 'articles', {
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
        
        // Custom methods
        findByAuthor: (authorId) => 
            repo.findBy({ author_id: authorId }),
        
        findPublished: () => 
            repo.findBy({ status: 'published' }),
        
        findDrafts: () => 
            repo.findBy({ status: 'draft' }),
        
        search: (query) => {
            return db.query(
                `SELECT * FROM articles 
                 WHERE title LIKE ? OR content LIKE ? 
                 ORDER BY created_at DESC`,
                [`%${query}%`, `%${query}%`]
            );
        },
        
        publish: (id) => 
            repo.update(id, { 
                status: 'published', 
                published_at: new Date().toISOString() 
            }),
        
        unpublish: (id) => 
            repo.update(id, { 
                status: 'draft', 
                published_at: null 
            }),
        
        // Reader-based operations
        findByIdReader: (id) => Reader((db) => repo.findById(id)),
        
        findByAuthorReader: (authorId) => Reader((db) => repo.findByAuthor(authorId)),
        
        getWithAuthor: (id) => 
            findByIdReader(id).flatMap((article) => {
                if (!article) return Reader.unit(null);
                return Reader((db) => 
                    db.query('SELECT * FROM users WHERE id = ?', [article.author_id])
                ).map((users) => ({
                    ...article,
                    author: users[0] || null
                }));
            })
    };
};

module.exports = { createArticleRepository };

