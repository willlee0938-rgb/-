const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
test('private photo bucket policies reject cross-account upload, read and delete, and repeat safely', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(bucket_id text references storage.buckets(id),name text,primary key(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema auth,storage to authenticated,anon;
      grant execute on function auth.uid(),storage.foldername(text) to authenticated,anon;
      grant select,insert,delete on storage.objects to authenticated;`);
    const sql = readFileSync(new URL('../supabase/photos.sql', 'file://' + __filename), 'utf8');
    await db.exec(sql); await db.exec(sql);
    assert.equal((await db.query('select public from storage.buckets')).rows[0].public, false);
    const owner = '11111111-1111-4111-8111-111111111111';
    const other = '22222222-2222-4222-8222-222222222222';
    await db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}'`);
    await db.query('insert into storage.objects values($1,$2)', ['driveos-vehicle-photos', owner + '/CAR-1/image.jpg']);
    await assert.rejects(db.query('insert into storage.objects values($1,$2)', ['driveos-vehicle-photos', other + '/CAR-1/forged.jpg']), /row-level security/);
    assert.equal((await db.query('select * from storage.objects')).rows.length, 1);
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
    assert.equal((await db.query('delete from storage.objects returning name')).rows.length, 0);
    await db.exec(`set request.jwt.claim.sub='${owner}'`);
    assert.equal((await db.query('delete from storage.objects returning name')).rows.length, 1);
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from storage.objects'), /permission denied/);
  } finally { await db.close(); }
});
