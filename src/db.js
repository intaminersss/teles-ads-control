'use strict';
/* Supabase Postgres access (pg Pool). All queries parameterized. */
const { Pool } = require('pg');
const { config } = require('./config');

const pool = new Pool({
  connectionString: config.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000
});

const q = async (text, params = []) => (await pool.query(text, params)).rows;
const one = async (text, params = []) => (await q(text, params))[0] || null;

async function tx(fn) {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }
  catch (e) { await c.query('ROLLBACK'); throw e; }
  finally { c.release(); }
}

async function healthy() {
  try { await q('select 1'); return true; } catch { return false; }
}

module.exports = { pool, q, one, tx, healthy };
