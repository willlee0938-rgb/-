const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
test('PostgreSQL policies isolate owners, reject anonymous/forged writes, and enforce revision updates', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to anon,authenticated;
      grant execute on function auth.uid() to anon,authenticated;
      insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');`);
    const sql = readFileSync(new URL('../supabase/setup.sql', 'file://' + __filename), 'utf8');
    await db.exec(sql); await db.exec(sql);
    await db.exec(`set role authenticated; set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111'`);
    const state = JSON.stringify({ cars: [], leads: [], posts: [], deals: [] });
    await db.query('insert into public.driveos_workspaces(owner_id,state) values ($1,$2)', ['11111111-1111-4111-8111-111111111111', state]);
    await assert.rejects(db.query('insert into public.driveos_workspaces(owner_id,state) values ($1,$2)', ['22222222-2222-4222-8222-222222222222', state]), /row-level security/);
    let result = await db.query('update public.driveos_workspaces set state=$1 where version=1 returning version', [state]);
    assert.equal(result.rows[0].version, 2);
    result = await db.query('update public.driveos_workspaces set state=$1 where version=1 returning version', [state]);
    assert.equal(result.rows.length, 0, 'stale versions must not overwrite');
    await assert.rejects(db.exec('update public.driveos_workspaces set version=1'), /permission denied/);
    await assert.rejects(db.query('update public.driveos_workspaces set state=$1', ['{"cars":[]}']), /check constraint/);
    await db.exec(`set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222'`);
    assert.equal((await db.query('select * from public.driveos_workspaces')).rows.length, 0);
    assert.equal((await db.query('update public.driveos_workspaces set state=$1 returning owner_id', [state])).rows.length, 0);
    await db.exec('set role anon');
    await assert.rejects(db.exec('select * from public.driveos_workspaces'), /permission denied/);
  } finally { await db.close(); }
});
