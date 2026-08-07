exports.up = (pgm) => {
  pgm.createTable('deliveries', {
    id: 'id',
    news_item_id: {
      type: 'integer',
      notNull: true,
      references: 'news_items',
      onDelete: 'CASCADE',
    },
    telegram_user_id: { type: 'bigint', notNull: true },
    delivery_type: { type: 'varchar(20)', notNull: true },
    telegram_message_id: { type: 'bigint' },
    delivered_at: { type: 'timestamptz' },
  });

  pgm.addConstraint('deliveries', 'deliveries_delivery_type_check', {
    check: "delivery_type IN ('instant', 'digest')",
  });

  // The anti-duplicate-send guard: every send path does
  // INSERT ... ON CONFLICT (news_item_id, telegram_user_id, delivery_type) DO NOTHING
  // RETURNING id, *before* calling Telegram. 0 rows back means already sent/in-flight.
  pgm.addConstraint('deliveries', 'deliveries_dedup_unique', {
    unique: ['news_item_id', 'telegram_user_id', 'delivery_type'],
  });

  pgm.createIndex('deliveries', ['telegram_user_id', 'delivered_at']);
};

exports.down = (pgm) => {
  pgm.dropTable('deliveries');
};
