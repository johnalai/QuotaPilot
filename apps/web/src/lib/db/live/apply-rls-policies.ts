import { PrismaClient } from '@prisma/client';

const APP_URL = process.env.APP_DATABASE_URL;
const OWNER_URL = process.env.MIGRATION_DATABASE_URL;

if (!APP_URL || !OWNER_URL) {
  throw new Error(
    'needs APP_DATABASE_URL (app role) and MIGRATION_DATABASE_URL (owner). ' +
      'Set these in your environment.',
  );
}

// Owner client — used to apply RLS policies
const owner = new PrismaClient({ datasources: { db: { url: OWNER_URL } } });

async function main() {
  try {
    // Read the RLS SQL file
    const fs = require('fs');
    const path = require('path');
    const sql = fs.readFileSync(path.resolve(__dirname, '../../../../prisma/phase2a-rls.sql'), 'utf8');

    // Split by semicolon and execute each statement
    const statements = sql
      .split(';')
      .map((statement: string) => statement.trim())
      .filter((statement: string) => statement.length > 0);

    console.log(`Executing ${statements.length} SQL statements...`);

    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`Executing: ${statement.substring(0, 50)}...`);
        await owner.$executeRawUnsafe(statement);
      }
    }

    console.log('RLS policies applied successfully!');
  } catch (error) {
    console.error('Error applying RLS policies:', error);
    throw error;
  } finally {
    await owner.$disconnect();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});