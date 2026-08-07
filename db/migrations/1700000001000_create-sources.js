exports.up = (pgm) => {
  pgm.createTable('sources', {
    id: 'id',
    url: { type: 'text', notNull: true },
    channel_username: { type: 'varchar(255)', notNull: true },
    title: { type: 'text' },
    rss_url: { type: 'text' },
    status: { type: 'varchar(20)', notNull: true, default: 'active' },
    categories: { type: 'text[]', notNull: true, default: pgm.func("'{}'") },
    last_checked_at: { type: 'timestamptz' },
    last_success_at: { type: 'timestamptz' },
    error_count: { type: 'integer', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('sources', 'sources_channel_username_unique', {
    unique: 'channel_username',
  });
  pgm.addConstraint('sources', 'sources_status_check', {
    check: "status IN ('active', 'paused', 'error', 'removed')",
  });
  pgm.createIndex('sources', 'status');
};

exports.down = (pgm) => {
  pgm.dropTable('sources');
};
