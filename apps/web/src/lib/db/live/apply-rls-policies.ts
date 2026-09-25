import fs from 'node:fs';
import path from 'node:path';

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
    const sql = fs.readFileSync(
      path.resolve(import.meta.dirname, '../../../../prisma/phase2a-rls.sql'),
      'utf8',
    );

    // Strip '--' line comments BEFORE splitting on ';'. phase2a-rls.sql contains
    // a semicolon inside a comment, which would otherwise split a statement in
    // half and execute a fragment (syntax error) — and because the ALTER TABLE
    // ... ENABLE ROW LEVEL SECURITY statements come before the CREATE POLICY
    // ones, a partial run leaves tables with RLS enabled and no policy, i.e.
    // deny-all for the app role. Worse than not applying the file at all.
    //
    // This is a line-based strip, not a SQL parser: it would also blank a '--'
    // inside a string literal. This file has none. For the canonical path, see
    // the header of phase2a-rls.sql (psql -f), which is what CI uses.
    const withoutComments = sql
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n');

    // Split by semicolon and execute each statement
    const statements = withoutComments
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
