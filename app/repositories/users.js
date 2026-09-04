const { createRepository } = require('../../lib/repository');
const Reader = require('../../lib/reader');

// User repository factory
const createUserRepository = (db) => {
    const repo = createRepository(db, 'users', {
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
        findByEmail: (email) => {
            return repo.findBy({ email: email }).then(users => users[0] || null);
        },
        
        search: (query) => {
            return db.query(
                `SELECT * FROM users 
                 WHERE name LIKE ? OR email LIKE ? 
                 ORDER BY created_at DESC`,
                [`%${query}%`, `%${query}%`]
            );
        },
        
        // Reader-based operations
        findByIdReader: (id) => Reader((db) => repo.findById(id)),
        
        findByEmailReader: (email) => Reader((db) => 
            db.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email])
                .then(users => users[0] || null)
        ),
        
        // Advanced composition: Fetches a user profile and bundles all their articles
        getWithArticles: (id) => 
            repo.findByIdReader(id).flatMap((user) => {
                if (!user) return Reader.unit(null);
                return Reader((db) => 
                    db.query('SELECT * FROM articles WHERE author_id = ? ORDER BY created_at DESC', [id])
                ).map((articles) => ({
                    ...user,
                    articles: articles
                }));
            })
    };
};

module.exports = { createUserRepository };

