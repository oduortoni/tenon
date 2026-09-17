/**
 * User repository — application-level extension over createRepository.
 *
 * Timestamps are explicit here: every create/update supplies created_at / updated_at
 * directly, as an application convention, not a framework feature.
 */
const { createRepository } = require('../repository');

const createUserRepository = (db) => {
    const repo = createRepository(db, 'users', { primaryKey: 'id' });

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

        findByEmail: (email) => {
            return repo.findBy({ email }).then(users => users[0] || null);
        },

        search: (query) => {
            return db.query(
                `SELECT * FROM users
                 WHERE name LIKE ? OR email LIKE ?
                 ORDER BY created_at DESC`,
                [`%${query}%`, `%${query}%`]
            );
        }
    };
};

module.exports = { createUserRepository };