import { afterEach, expect, test } from 'vitest';
import { editLayoutHost } from './editLayoutHost.js';

afterEach(() => editLayoutHost.set(false));

test('a page lays out its own part until the host says it does', () => {
  expect(editLayoutHost.get()).toBe(false);
  editLayoutHost.set(true);
  expect(editLayoutHost.get()).toBe(true);
});

test('tells its listeners once per change, and not after they leave', () => {
  let calls = 0;
  const leave = editLayoutHost.subscribe(() => { calls += 1; });
  editLayoutHost.set(true);
  editLayoutHost.set(true);
  expect(calls).toBe(1);
  leave();
  editLayoutHost.set(false);
  expect(calls).toBe(1);
});
