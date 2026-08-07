exports.up = (pgm) => {
  pgm.createTable('user_interests', {
    id: 'id',
    telegram_user_id: { type: 'bigint', notNull: true },
    interest: { type: 'text', notNull: true },
    weight: { type: 'real', notNull: true, default: 1 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('user_interests', 'user_interests_unique', {
    unique: ['telegram_user_id', 'interest'],
  });
};

exports.down = (pgm) => {
  pgm.dropTable('user_interests');
};
