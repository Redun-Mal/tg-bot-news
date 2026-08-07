exports.up = (pgm) => {
  pgm.createTable(
    'bot_settings',
    {
      telegram_user_id: { type: 'bigint', notNull: true, primaryKey: true },
      digest_time: { type: 'varchar(5)', notNull: true, default: '09:00' },
      timezone: { type: 'varchar(64)', notNull: true, default: 'Asia/Bishkek' },
      instant_alerts_enabled: { type: 'boolean', notNull: true, default: true },
      language: { type: 'varchar(10)', notNull: true, default: 'ru' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
    { id: false },
  );
};

exports.down = (pgm) => {
  pgm.dropTable('bot_settings');
};
