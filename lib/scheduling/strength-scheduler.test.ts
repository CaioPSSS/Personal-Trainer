import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSplitDayOffsets,
  formatISODate,
  getMondayOfDate,
} from './strength-scheduler';

test('Deterministic Scheduling: 4-day split assigns Upper/Lower balancing rest days', () => {
  const offsets = getSplitDayOffsets(4);
  assert.deepEqual(offsets, [0, 1, 3, 4]);

  const baseMonday = new Date(2026, 8, 28); // 2026-09-28 is a Monday
  const dates = offsets.map((offset) => {
    const d = new Date(baseMonday);
    d.setDate(baseMonday.getDate() + offset);
    return formatISODate(d);
  });

  assert.deepEqual(dates, [
    '2026-09-28', // Monday - Day 1 Upper
    '2026-09-29', // Tuesday - Day 2 Lower
    '2026-10-01', // Thursday - Day 3 Upper (Wednesday was Rest!)
    '2026-10-02', // Friday - Day 4 Lower (Sat/Sun are Rest!)
  ]);
});

test('Deterministic Scheduling: 3-day split assigns Mon/Wed/Fri', () => {
  const offsets = getSplitDayOffsets(3);
  assert.deepEqual(offsets, [0, 2, 4]);

  const baseMonday = new Date(2026, 8, 28);
  const dates = offsets.map((offset) => {
    const d = new Date(baseMonday);
    d.setDate(baseMonday.getDate() + offset);
    return formatISODate(d);
  });

  assert.deepEqual(dates, [
    '2026-09-28', // Monday
    '2026-09-30', // Wednesday
    '2026-10-02', // Friday
  ]);
});

test('Deterministic Scheduling: 5-day split assigns balanced recovery', () => {
  const offsets = getSplitDayOffsets(5);
  assert.deepEqual(offsets, [0, 1, 2, 4, 5]);
});

test('Deterministic Scheduling: getMondayOfDate correctly aligns Sunday and midweek dates', () => {
  const sunday = new Date(2026, 8, 27); // Sunday Sep 27, 2026
  const mondayFromSunday = getMondayOfDate(sunday);
  assert.equal(formatISODate(mondayFromSunday), '2026-09-21');

  const wednesday = new Date(2026, 8, 30); // Wednesday Sep 30, 2026
  const mondayFromWednesday = getMondayOfDate(wednesday);
  assert.equal(formatISODate(mondayFromWednesday), '2026-09-28');
});
