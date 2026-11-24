import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shiftISODate,
  diffISODays,
  diffISODaysSigned,
  signedDiffISODays,
  weekdayIndexISO,
  formatISODateShortPTBR,
  formatISODateWithWeekdayPTBR,
  dayOfWeekName,
  dayOfWeekMon0,
  resolveISODate,
  todayISO,
  isISODate,
  mondayOfISODate,
  weekRangeOfISODate,
} from './dates';
import { calculateCurrentWeek } from './dateUtils';

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

test('Dates: signedDiffISODays preserves sign across calendar days', () => {
  assert.equal(signedDiffISODays('2026-11-21', '2026-11-23'), 2);
  assert.equal(signedDiffISODays('2026-11-23', '2026-11-21'), -2);
  assert.equal(signedDiffISODays('2026-11-23', '2026-11-23'), 0);
});

test('Dates: weekdayIndexISO and PT-BR formatters align Monday=0 through Sunday=6', () => {
  assert.equal(weekdayIndexISO('2026-11-23'), 0); // Monday
  assert.equal(weekdayIndexISO('2026-11-21'), 5); // Saturday
  assert.equal(weekdayIndexISO('2026-11-22'), 6); // Sunday
  assert.equal(formatISODateShortPTBR('2026-11-23'), '23/11');
  assert.equal(formatISODateWithWeekdayPTBR('2026-11-23'), 'Segunda-feira, 23/11');
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

test('Dates: mondayOfISODate and weekRangeOfISODate compute ISO week boundaries accurately', () => {
  assert.equal(mondayOfISODate('2026-09-30'), '2026-09-28'); // Wednesday -> Monday
  assert.equal(mondayOfISODate('2026-10-04'), '2026-09-28'); // Sunday -> Monday
  assert.equal(mondayOfISODate('2026-09-28'), '2026-09-28'); // Monday -> Monday

  const range = weekRangeOfISODate('2026-10-04');
  assert.equal(range.startOfWeek, '2026-09-28');
  assert.equal(range.endOfWeek, '2026-10-04');
});

test('Dates: diffISODaysSigned, dayOfWeekMon0, resolveISODate, and calculateCurrentWeek avoid UTC drift', () => {
  assert.equal(diffISODaysSigned('2026-10-12', '2026-10-05'), 7);
  assert.equal(diffISODaysSigned('2026-10-01', '2026-10-05'), -4);

  assert.equal(dayOfWeekMon0('2026-10-05'), 0); // Monday
  assert.equal(dayOfWeekMon0('2026-10-04'), 6); // Sunday

  // ISO date string must be returned verbatim without shifting backward in UTC-3
  assert.equal(resolveISODate('2026-10-05'), '2026-10-05');

  // Week progression anchored on mesocycle startDate
  assert.equal(calculateCurrentWeek('2026-10-05', 4, '2026-10-05'), 1);
  assert.equal(calculateCurrentWeek('2026-10-05', 4, '2026-10-11'), 1);
  assert.equal(calculateCurrentWeek('2026-10-05', 4, '2026-10-12'), 2);
  assert.equal(calculateCurrentWeek('2026-10-05', 4, '2026-11-20'), 4);
});
