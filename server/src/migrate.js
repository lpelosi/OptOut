// Apply db/schema.sql to the configured database. Idempotent.
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf-8');

try {
  await pool.query(schema);
  console.log('✓ schema applied');
} catch (err) {
  console.error('migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
