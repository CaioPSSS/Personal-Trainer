import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftISODate, diffISODays, dayOfWeekName, todayISO, isISODate } from './dates';

test('Dates: shiftISODate handles whole days across months without timezone drift', () => {
  assert.equal(shiftISODate('2026-10-03', 1), '2026-10-04');
  assert.equal(shiftISODate('2026-10-03', -1), '2026-10-02');
  assert.equal(shiftISODate('2026-10-01', -1), '2026-09-30');
  assert.equal(shiftISODate('2026-12-31', 1), '2027-01-01');
});

test('Dates: diffISODays calculates distance in calendar days', () => {
  assert.equal(diffISODays('2026-10-03', '2026-10-03'), 0);
  assert.equal(diffISODays('2026-10-03', '2026-10-04'), 1);
  assert.equal(diffISODays('2026-10-04', '2026-10-02'), 2);
  assert.equal(diffISODays('2026-09-30', '2026-10-01'), 1);
});

test('Dates: dayOfWeekName returns correct lowercase English day', () => {
  // 2026-10-03 is a Saturday
  assert.equal(dayOfWeekName('2026-10-03'), 'saturday');
  // 2026-10-04 is a Sunday
  assert.equal(dayOfWeekName('2026-10-04'), 'sunday');
  // 2026-10-05 is a Monday
  assert.equal(dayOfWeekName('2026-10-05'), 'monday');
});

test('Dates: isISODate validates format strictly', () => {
  assert.equal(isISODate('2026-10-03'), true);
  assert.equal(isISODate('2026-1-3'), false);
  assert.equal(isISODate('invalid'), false);
});

test('Dates: todayISO returns a valid ISO date string', () => {
  const today = todayISO();
  assert.equal(isISODate(today), true);
});
