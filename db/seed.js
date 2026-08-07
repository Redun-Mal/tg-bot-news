// Idempotent seed of default user interests. Reads TELEGRAM_ALLOWED_USER_ID
// and DATABASE_URL from the environment (see package.json's db:seed script,
// which sources .env before invoking this).
const { Client } = require('pg');

const DEFAULT_INTERESTS = [
  'JavaScript',
  'TypeScript',
  'Next.js',
  'NestJS',
  'Prisma',
  'n8n',
  'Claude Code',
  'искусственный интеллект',
  'Git',
  'GitHub',
  'Roblox Studio',
  'разработка игр',
  'UI',
  'локализация',
  'CRM',
  'аналитика',
];

async function main() {
  const telegramUserId = process.env.TELEGRAM_ALLOWED_USER_ID;
  if (!telegramUserId) {
    throw new Error('TELEGRAM_ALLOWED_USER_ID is not set in .env');
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    for (const interest of DEFAULT_INTERESTS) {
      await client.query(
        `INSERT INTO user_interests (telegram_user_id, interest)
         VALUES ($1, $2)
         ON CONFLICT (telegram_user_id, interest) DO NOTHING`,
        [telegramUserId, interest],
      );
    }
    console.log(`Seeded ${DEFAULT_INTERESTS.length} default interests for user ${telegramUserId}.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
