
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);


CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',       -- Handled by findPublished/findDrafts
    author_id INTEGER NOT NULL,                -- Handled by findByAuthor/getWithAuthor
    published_at TEXT,                         -- Managed by publish() / unpublish()
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), -- Added automatically via timestamps: true
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), -- Added automatically via timestamps: true
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Optimize search() performance (indexes for faster filtering/sorting)
CREATE INDEX IF NOT EXISTS idx_articles_author_id ON articles(author_id);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_created_at ON articles(created_at DESC);

