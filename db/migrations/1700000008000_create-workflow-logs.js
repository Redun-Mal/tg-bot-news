exports.up = (pgm) => {
  pgm.createTable('workflow_logs', {
    id: 'id',
    workflow_name: { type: 'varchar(100)', notNull: true },
    level: { type: 'varchar(10)', notNull: true },
    message: { type: 'text', notNull: true },
    metadata: { type: 'jsonb' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('workflow_logs', 'workflow_logs_level_check', {
    check: "level IN ('debug', 'info', 'warn', 'error')",
  });

  pgm.createIndex('workflow_logs', ['workflow_name', 'created_at']);
  pgm.createIndex('workflow_logs', 'level');
};

exports.down = (pgm) => {
  pgm.dropTable('workflow_logs');
};
