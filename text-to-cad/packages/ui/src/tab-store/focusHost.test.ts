import { afterEach, expect, test } from 'vitest';
import { focusHost } from './focusHost.js';

afterEach(() => focusHost.set(null));

test('takes what the host asks only as a path, a line from 1 and a number', () => {
  expect(focusHost.get()).toBeNull();
  focusHost.set({ path: 'parts/bracket.py', line: 12, nonce: 3, more: true });
  expect(focusHost.get()).toEqual({ path: 'parts/bracket.py', line: 12, nonce: 3 });
  for (const asked of [{ path: '', line: 12, nonce: 4 }, { path: 'a.py', line: 0, nonce: 4 }, { path: 'a.py', line: 1.5, nonce: 4 },
    { path: 'a.py', line: 12 }, { path: 'a.py', line: 12, nonce: '4' }, 'a.py:12', null, undefined]) {
    focusHost.set({ path: 'parts/bracket.py', line: 12, nonce: 3 });
    focusHost.set(asked);
    expect(focusHost.get()).toBeNull();
  }
});

test('tells its listeners once per ask, and its takers which ask was taken', () => {
  let heard = 0;
  const taken: number[] = [];
  const leave = focusHost.subscribe(() => { heard += 1; });
  const leaveTaken = focusHost.subscribeTaken(nonce => { taken.push(nonce); });
  focusHost.set({ path: 'parts/bracket.py', line: 12, nonce: 3 });
  focusHost.set({ path: 'parts/bracket.py', line: 12, nonce: 3 });
  focusHost.set({ path: 'parts/bracket.py', line: 12, nonce: 4 });
  focusHost.take(4);
  expect([heard, taken]).toEqual([2, [4]]);
  leave();
  leaveTaken();
  focusHost.set(null);
  focusHost.take(5);
  expect([heard, taken]).toEqual([2, [4]]);
});
