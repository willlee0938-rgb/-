const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SyncEngine, emptyState } = require('../cloud-sync.cjs');
function setup(save) {
  let record; const engine = new SyncEngine({ repository: { save }, cache: { write(value) { record = structuredClone(value); } } });
  engine.initialize({ state: emptyState(), version: 1 }); return { engine, cache: () => record };
}
test('queued edits persist sequentially; edits during a request are saved at the returned revision', async () => {
  let release; const versions = [], states = [];
  const { engine, cache } = setup(async (state, version) => {
    versions.push(version); states.push(state);
    if (versions.length === 1) await new Promise(resolve => { release = resolve; });
    return { version: version + 1 };
  });
  engine.enqueue({ ...emptyState(), cars: [{ id: 'A' }] }); const running = engine.flush();
  engine.enqueue({ ...emptyState(), cars: [{ id: 'A' }, { id: 'B' }] }); release();
  assert.equal(await running, true); assert.deepEqual(versions, [1, 2]);
  assert.equal(states[1].cars.length, 2); assert.equal(cache().dirty, false); assert.equal(cache().version, 3);
});
test('network failure preserves latest dirty draft, and explicit retry uses the same expected version', async () => {
  let fail = true; const { engine, cache } = setup(async (_, version) => { if (fail) throw new Error('offline'); return { version: version + 1 }; });
  engine.enqueue({ ...emptyState(), cars: [{ id: 'A' }] }); assert.equal(await engine.flush(), false);
  assert.equal(cache().dirty, true); assert.equal(engine.status, 'error');
  engine.enqueue({ ...emptyState(), cars: [{ id: 'A' }, { id: 'B' }] });
  fail = false; assert.equal(await engine.retry(), true); assert.equal(cache().state.cars.length, 2);
});
test('conflicts never overwrite remote data and remain recoverable after reload', async () => {
  let calls = 0; const { engine, cache } = setup(async () => { calls++; return null; });
  engine.enqueue({ ...emptyState(), cars: [{ id: 'LOCAL' }] }); await engine.flush();
  assert.equal(engine.status, 'conflict'); assert.equal(cache().dirty, true);
  assert.equal(await engine.retry(), false); assert.equal(calls, 1);
  assert.throws(() => engine.enqueue(emptyState()), /版本衝突/);
  const restored = new SyncEngine({ repository: {}, cache: { write() {} } });
  restored.initialize({ state: emptyState(), version: 2 }, cache());
  assert.equal(restored.status, 'conflict'); assert.equal(restored.snapshot().cars[0].id, 'LOCAL');
});
test('dirty drafts resume only against a matching revision and account caches remain caller scoped', async () => {
  const cached = { version: 2, state: { ...emptyState(), cars: [{ id: 'DRAFT' }] }, dirty: true };
  const engine = new SyncEngine({ repository: { save: async (_, version) => ({ version: version + 1 }) }, cache: { write() {} } });
  engine.initialize({ state: emptyState(), version: 2 }, cached); assert.equal(engine.status, 'paused');
  assert.equal(await engine.retry(), true); assert.equal(engine.version, 3);
});
