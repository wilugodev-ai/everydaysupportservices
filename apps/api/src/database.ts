import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { Pool, PoolClient, types } from 'pg';

type Scope = { client?: PoolClient; release?: () => void };
types.setTypeParser(20, Number);

function parameters(sql: string) {
  let quoted = false, index = 0, result = '';
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    if (char === "'") {
      if (quoted && sql[i + 1] === "'") { result += "''"; i++; continue; }
      quoted = !quoted;
    }
    result += char === '?' && !quoted ? `$${++index}` : char;
  }
  return result;
}

export class Database {
  readonly postgres = !!process.env.DATABASE_URL;
  readonly scope = new AsyncLocalStorage<Scope>();
  private sqlite?: DatabaseSync;
  private pool?: Pool;
  private schema = process.env.DATABASE_SCHEMA;
  private queue: Promise<void> = Promise.resolve();
  constructor(directory: string) {
    if (this.schema && !/^[a-z_][a-z0-9_]*$/.test(this.schema)) throw new Error('Invalid database schema.');
    if (process.env.K_SERVICE && !this.postgres) throw new Error('Hosted startup requires persistent DATABASE_URL.');
    if (this.postgres) this.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 15_000 });
    else this.sqlite = new DatabaseSync(resolve(directory, 'content.sqlite'));
  }
  get inTransaction() { const scope = this.scope.getStore(); return !!(scope?.client || scope?.release); }
  private async pgQuery(sql: string, values: unknown[] = []) {
    const current = this.scope.getStore()?.client;
    if (current || !this.schema) return (current || this.pool!).query(sql, values);
    const client = await this.pool!.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO ${this.schema}`);
      const result = await client.query(sql, values);
      await client.query('COMMIT');
      return result;
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  }
  private async lock() {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    return release;
  }
  private async query(sql: string, values: unknown[] = []) {
    const scope = this.scope.getStore();
    if (this.pool) return this.pgQuery(parameters(sql), values);
    const release = scope?.release ? undefined : await this.lock();
    try {
      const statement = this.sqlite!.prepare(sql);
      if (statement.columns().length) return { rows: statement.all(...values as never[]), rowCount: 0 };
      const result = statement.run(...values as never[]);
      return { rows: [], rowCount: Number(result.changes) };
    } finally { release?.(); }
  }
  prepare(sql: string) {
    return {
      get: async (...values: unknown[]) => (await this.query(sql, values)).rows[0],
      all: async (...values: unknown[]) => (await this.query(sql, values)).rows,
      run: async (...values: unknown[]) => ({ changes: (await this.query(sql, values)).rowCount }),
    };
  }
  async columns(table: string) {
    if (!/^[a-z_]+$/.test(table)) throw new Error('Invalid table');
    if (this.pool) return (await this.pgQuery('SELECT column_name AS name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1', [table])).rows;
    return this.sqlite!.prepare(`PRAGMA table_info(${table})`).all();
  }
  async exec(sql: string) {
    const scope = this.scope.getStore();
    const begin = /^BEGIN(?: IMMEDIATE)?$/i.test(sql.trim());
    const end = /^(COMMIT|ROLLBACK)$/i.test(sql.trim());
    if (begin) {
      if (!scope || this.inTransaction) throw new Error('A fresh database request context is required.');
      if (this.pool) { scope.client = await this.pool.connect(); try { await scope.client.query('BEGIN'); if (this.schema) await scope.client.query(`SET LOCAL search_path TO ${this.schema}`); } catch (e) { scope.client.release(); delete scope.client; throw e; } }
      else { scope.release = await this.lock(); try { this.sqlite!.exec(sql); } catch (e) { scope.release(); delete scope.release; throw e; } }
      return;
    }
    if (end) {
      try {
        if (scope?.client) await scope.client.query(sql);
        else if (scope?.release) this.sqlite!.exec(sql);
      } finally { scope?.client?.release(); if (scope) delete scope.client; scope?.release?.(); if (scope) delete scope.release; }
      return;
    }
    if (this.pool) {
      const postgresSql = sql.replace(/PRAGMA[^;]+;/g, '').replace(/\bINTEGER\b/g, 'BIGINT');
      if (postgresSql.trim()) await this.pgQuery(postgresSql);
    } else {
      const release = scope?.release ? undefined : await this.lock();
      try { this.sqlite!.exec(sql); } finally { release?.(); }
    }
  }
  async cleanup(scope: Scope) {
    if (scope.client) { try { await scope.client.query('ROLLBACK'); } finally { scope.client.release(); delete scope.client; } }
    if (scope.release) { try { this.sqlite!.exec('ROLLBACK'); } finally { scope.release(); delete scope.release; } }
  }
}
