const { Types } = require('../../lib/types');
const { field } = require('../../lib/field');
const { entity } = require('../../lib/entity');

// Every field is explicit. Timestamps and soft delete are application
// conventions expressed as datetime fields — not framework flags.

const User = entity('User', {
    id: field(Types.id, { primaryKey: true }),
    email: field(Types.email, { required: true, unique: true }),
    password: field(Types.string, { required: true }),
    name: field(Types.string, { required: true }),
    role: field(Types.string, { default: 'user' }),
    created_at: field(Types.datetime, { default: () => new Date() }),
    updated_at: field(Types.datetime, { default: () => new Date() }),
    deleted_at: field(Types.datetime)
});

const Article = entity('Article', {
    id: field(Types.id, { primaryKey: true }),
    title: field(Types.string, { required: true }),
    slug: field(Types.slug, { required: true, unique: true }),
    content: field(Types.text, { required: true }),
    excerpt: field(Types.text),
    author_id: field(Types.id, { required: true, foreignKey: 'User' }),
    status: field(Types.string, { default: 'draft' }),
    published_at: field(Types.datetime),
    created_at: field(Types.datetime, { default: () => new Date() }),
    updated_at: field(Types.datetime, { default: () => new Date() }),
    deleted_at: field(Types.datetime)
});

const Comment = entity('Comment', {
    id: field(Types.id, { primaryKey: true }),
    article_id: field(Types.id, { required: true, foreignKey: 'Article' }),
    user_id: field(Types.id, { foreignKey: 'User' }),
    name: field(Types.string),
    email: field(Types.email),
    content: field(Types.text, { required: true }),
    status: field(Types.string, { default: 'pending' }),
    created_at: field(Types.datetime, { default: () => new Date() })
});

const Tag = entity('Tag', {
    id: field(Types.id, { primaryKey: true }),
    name: field(Types.string, { required: true, unique: true }),
    slug: field(Types.slug, { required: true, unique: true }),
    created_at: field(Types.datetime, { default: () => new Date() })
});

const ArticleTag = entity('ArticleTag', {
    article_id: field(Types.id, { required: true, foreignKey: 'Article' }),
    tag_id: field(Types.id, { required: true, foreignKey: 'Tag' })
});

module.exports = { User, Article, Comment, Tag, ArticleTag };

