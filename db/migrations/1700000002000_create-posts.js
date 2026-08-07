exports.up = (pgm) => {
  pgm.createTable('posts', {
    id: 'id',
    source_id: {
      type: 'integer',
      notNull: true,
      references: 'sources',
      onDelete: 'CASCADE',
    },
    external_id: { type: 'text' },
    post_url: { type: 'text', notNull: true },
    title: { type: 'text' },
    raw_text: { type: 'text' },
    normalized_text: { type: 'text' },
    content_hash: { type: 'varchar(64)', notNull: true },
    published_at: { type: 'timestamptz' },
    fetched_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    media_url: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('posts', 'posts_post_url_unique', { unique: 'post_url' });

  // Same external_id can repeat across different sources; only unique per-source,
  // and only enforced when the source actually provides an external_id.
  pgm.createIndex('posts', ['source_id', 'external_id'], {
    name: 'posts_source_external_id_unique',
    unique: true,
    where: 'external_id IS NOT NULL',
  });

  // Deliberately non-unique: identical content_hash across sources is the
  // multi-source merge case (see news_sources), not a rejected duplicate.
  pgm.createIndex('posts', 'content_hash');
  pgm.createIndex('posts', 'source_id');
  pgm.createIndex('posts', 'published_at');
};

exports.down = (pgm) => {
  pgm.dropTable('posts');
};
