import test from 'node:test';
import assert from 'node:assert/strict';
import { createDecisionGate, mergePhotoQueue, nextUnreviewed, swipeChoice } from '../src/domain/decisions.ts';

test('switching album readers keeps prior keep decisions and never mixes queues', async () => {
  const camera = [{ id: 'kept-camera' }, { id: 'camera-new' }];
  const screenshots = [{ id: 'kept-screenshot' }, { id: 'screenshot-new' }];
  const kept = new Set(['kept-camera', 'kept-screenshot']);
  const read = (items: { id: string }[]) => async (offset: number, limit: number) => items.slice(offset, offset + limit);
  assert.deepEqual(await nextUnreviewed(read(camera), kept, new Set()), [{ id: 'camera-new' }]);
  assert.deepEqual(await nextUnreviewed(read(screenshots), kept, new Set()), [{ id: 'screenshot-new' }]);
  assert.deepEqual(await nextUnreviewed(read(camera), kept, new Set()), [{ id: 'camera-new' }]);
  assert.deepEqual(await nextUnreviewed(read([]), kept, new Set()), []);
});

test('directions and threshold match the visible keep/delete instructions', () => {
  assert.equal(swipeChoice(-120, 400), 'keep');
  assert.equal(swipeChoice(120, 400), 'delete');
  assert.equal(swipeChoice(50, 400), null);
  assert.equal(swipeChoice(-50, 400), null);
});

test('a pending deletion prevents a second destructive request', async () => {
  let finish!: () => void;
  let calls = 0;
  const gate = createDecisionGate<string>({ keep: async () => {}, delete: async () => {
    calls++;
    await new Promise<void>(resolve => { finish = resolve; });
  }});
  const first = gate('a', 'delete');
  assert.equal(await gate('a', 'delete'), 'busy');
  assert.equal(await gate('a', 'keep'), 'busy');
  finish();
  assert.equal(await first, 'deleted');
  assert.equal(calls, 1);
});

test('cancelled deletion does not report success and releases the gate', async () => {
  const gate = createDecisionGate<string>({ keep: async () => {}, delete: async () => { throw Error('cancelled'); } });
  await assert.rejects(gate('a', 'delete'), /cancelled/);
  assert.equal(await gate('a', 'keep'), 'kept');
});

test('failed persistence does not report keep success', async () => {
  const gate = createDecisionGate<string>({ keep: async () => { throw Error('disk'); }, delete: async () => {} });
  await assert.rejects(gate('a', 'keep'), /disk/);
});

test('refresh starts from zero after deletion so shifted pages do not skip photos', async () => {
  let library = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id }));
  const read = async (offset: number, limit: number) => library.slice(offset, offset + limit);
  const kept = new Set(['a', 'b']);
  assert.equal((await nextUnreviewed(read, kept, new Set(), 2))[0].id, 'c');
  library = library.filter(photo => photo.id !== 'c');
  assert.deepEqual((await nextUnreviewed(read, kept, new Set(), 2)).map(p => p.id), ['d', 'e']);
  library.unshift({ id: 'new' });
  assert.equal((await nextUnreviewed(read, kept, new Set(), 2))[0].id, 'new');
});

test('persisted keeps and session-only unavailable skips yield an empty queue', async () => {
  const photos = [{ id: 'kept' }, { id: 'missing' }];
  assert.deepEqual(await nextUnreviewed(async () => photos, new Set(['kept']), new Set(['missing']), 40), []);
});

test('background refill preserves the visible photo and omits completed decisions', () => {
  const visible = { id: 'b' };
  const previous = [visible, { id: 'c' }];
  const fresh = [{ id: 'new' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const queue = mergePhotoQueue(previous, fresh, new Set(['c']));
  assert.strictEqual(queue[0], visible);
  assert.deepEqual(queue.map(photo => photo.id), ['b', 'new', 'd']);
});

test('refill removes externally deleted photos and has no duplicate cards', () => {
  const queue = mergePhotoQueue([{ id: 'missing' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }], new Set());
  assert.deepEqual(queue.map(photo => photo.id), ['b', 'c']);
});
