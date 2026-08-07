exports.up = (pgm) => {
  pgm.createTable('news_items', {
    id: 'id',
    canonical_title: { type: 'text', notNull: true },
    summary: { type: 'text' },
    why_it_matters: { type: 'text' },
    categories: { type: 'text[]', notNull: true, default: pgm.func("'{}'") },
    importance: { type: 'smallint', notNull: true },
    relevance: { type: 'real', notNull: true },
    confidence: { type: 'real', notNull: true },
    language: { type: 'varchar(10)' },
    keywords: { type: 'text[]', notNull: true, default: pgm.func("'{}'") },
    is_advertisement: { type: 'boolean', notNull: true, default: false },
    is_duplicate: { type: 'boolean', notNull: true, default: false },
    processed_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('news_items', 'news_items_importance_check', {
    check: 'importance BETWEEN 1 AND 4',
  });
  pgm.addConstraint('news_items', 'news_items_relevance_check', {
    check: 'relevance BETWEEN 0 AND 1',
  });
  pgm.addConstraint('news_items', 'news_items_confidence_check', {
    check: 'confidence BETWEEN 0 AND 1',
  });

  pgm.createIndex('news_items', 'categories', { method: 'gin' });
  pgm.createIndex('news_items', ['importance', 'relevance']);
  pgm.createIndex('news_items', 'processed_at');
};

exports.down = (pgm) => {
  pgm.dropTable('news_items');
};
