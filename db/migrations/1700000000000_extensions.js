exports.up = (pgm) => {
  pgm.createExtension('pg_trgm', { ifNotExists: true });
};

exports.down = (pgm) => {
  pgm.dropExtension('pg_trgm', { ifExists: true });
};
