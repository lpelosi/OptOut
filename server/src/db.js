import pg from 'pg';
import { config } from './config.js';

// Parse numeric(10,2) as JS number rather than string (OID 1700).
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

pool.on('error', (err) => {
  console.error('Unexpected idle Postgres client error:', err);
});

export const query = (text, params) => pool.query(text, params);

// Run fn inside a transaction; rolls back on throw.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
