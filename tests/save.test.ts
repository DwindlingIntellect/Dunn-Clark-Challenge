import { describe, it, expect, beforeEach } from 'vitest';
import { loadSave, recordTime, isUnlocked, medalFor, formatTime } from '../src/core/save';

class MemStorage {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

describe('save data', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
  });

  it('records best times and unlocks courses in order', () => {
    const ids = ['a', 'b', 'c'];
    const s = loadSave();
    expect(isUnlocked(0, ids, s)).toBe(true);
    expect(isUnlocked(1, ids, s)).toBe(false);
    expect(recordTime(s, 'a', 30)).toBe(true);
    expect(recordTime(s, 'a', 31)).toBe(false);
    expect(recordTime(s, 'a', 29.5)).toBe(true);
    expect(isUnlocked(1, ids, s)).toBe(true);
    expect(isUnlocked(2, ids, s)).toBe(false);
    expect(loadSave().best.a).toBe(29.5);
  });

  it('survives broken or missing storage', () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem() { throw new Error('denied'); },
      setItem() { throw new Error('denied'); },
    };
    const s = loadSave();
    expect(s.best).toEqual({});
    expect(() => recordTime(s, 'a', 10)).not.toThrow();
    const mem = new MemStorage();
    mem.setItem('ashen-spire.save', '{not json');
    (globalThis as { localStorage?: unknown }).localStorage = mem;
    expect(loadSave().best).toEqual({});
  });

  it('awards medals and formats times', () => {
    const m = { bronze: 40, silver: 30, gold: 20 };
    expect(medalFor(19.9, m)).toBe('gold');
    expect(medalFor(25, m)).toBe('silver');
    expect(medalFor(39, m)).toBe('bronze');
    expect(medalFor(41, m)).toBe('none');
    expect(formatTime(83.456)).toBe('1:23.46');
    expect(formatTime(5.1)).toBe('0:05.10');
  });
});
