exports.up = (pgm) => {
  pgm.createTable('news_sources', {
    id: 'id',
    news_item_id: {
      type: 'integer',
      notNull: true,
      references: 'news_items',
      onDelete: 'CASCADE',
    },
    post_id: {
      type: 'integer',
      notNull: true,
      references: 'posts',
      onDelete: 'CASCADE',
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // A post belongs to at most one news_item, ever — either it seeds a new
  // item or merges into an existing one.
  pgm.addConstraint('news_sources', 'news_sources_post_id_unique', { unique: 'post_id' });
  pgm.createIndex('news_sources', 'news_item_id');
};

exports.down = (pgm) => {
  pgm.dropTable('news_sources');
};
