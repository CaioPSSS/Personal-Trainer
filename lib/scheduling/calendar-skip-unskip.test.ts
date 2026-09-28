import test from 'node:test';
import assert from 'node:assert/strict';

function getWeekRange(dateStr: string): { startOfWeek: string; endOfWeek: string } {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = d.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return {
    startOfWeek: monday.toISOString().split('T')[0],
    endOfWeek: sunday.toISOString().split('T')[0],
  };
}

function addDaysToISODate(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

test('Calendar Skip & Unskip: getWeekRange correctly computes Monday and Sunday', () => {
  // Wednesday Sep 30, 2026
  const rangeWed = getWeekRange('2026-09-30');
  assert.equal(rangeWed.startOfWeek, '2026-09-28');
  assert.equal(rangeWed.endOfWeek, '2026-10-04');

  // Sunday Oct 04, 2026
  const rangeSun = getWeekRange('2026-10-04');
  assert.equal(rangeSun.startOfWeek, '2026-09-28');
  assert.equal(rangeSun.endOfWeek, '2026-10-04');

  // Monday Sep 28, 2026
  const rangeMon = getWeekRange('2026-09-28');
  assert.equal(rangeMon.startOfWeek, '2026-09-28');
  assert.equal(rangeMon.endOfWeek, '2026-10-04');
});

test('Calendar Skip & Unskip: addDaysToISODate accurately offsets dates across month boundaries', () => {
  assert.equal(addDaysToISODate('2026-09-28', 1), '2026-09-29');
  assert.equal(addDaysToISODate('2026-09-30', 1), '2026-10-01');
  assert.equal(addDaysToISODate('2026-10-01', -1), '2026-09-30');
  assert.equal(addDaysToISODate('2026-12-31', 1), '2027-01-01');
  assert.equal(addDaysToISODate('2027-01-01', -1), '2026-12-31');
});

test('Calendar Skip & Unskip: skip_and_reschedule and unskip reversibility', () => {
  // Scenario: 3 strength workouts in week: Mon, Wed, Fri
  const workouts = [
    { id: 'ev-1', date: '2026-09-28', title: 'Inferiores 1', status: 'planned', originalDate: null as string | null },
    { id: 'ev-2', date: '2026-09-30', title: 'Superiores 1', status: 'planned', originalDate: null as string | null },
    { id: 'ev-3', date: '2026-10-02', title: 'Inferiores 2', status: 'planned', originalDate: null as string | null },
  ];

  // 1. User skips Mon workout with skip_and_reschedule
  const skippedId = 'ev-1';
  const skippedEvent = workouts.find((w) => w.id === skippedId)!;
  skippedEvent.status = 'skipped';
  skippedEvent.originalDate = 'skip_and_reschedule';

  // Subsequent planned workouts shift +1 day
  const subsequent = workouts.filter((w) => w.id !== skippedId && w.status === 'planned');
  for (const item of subsequent) {
    item.originalDate = item.originalDate ?? item.date;
    item.date = addDaysToISODate(item.date, 1);
  }

  assert.equal(skippedEvent.status, 'skipped');
  assert.equal(workouts[1].date, '2026-10-01'); // was Wed, now Thu
  assert.equal(workouts[1].originalDate, '2026-09-30');
  assert.equal(workouts[2].date, '2026-10-03'); // was Fri, now Sat
  assert.equal(workouts[2].originalDate, '2026-10-02');

  // 2. User unskips Mon workout with restore_schedule
  // Revert target event
  skippedEvent.status = 'planned';
  skippedEvent.originalDate = null;

  // Revert subsequent events using recorded originalDate
  for (const item of subsequent) {
    if (item.originalDate) {
      item.date = item.originalDate;
      item.originalDate = null;
    }
  }

  assert.equal(skippedEvent.status, 'planned');
  assert.equal(workouts[1].date, '2026-09-30'); // restored to Wed
  assert.equal(workouts[1].originalDate, null);
  assert.equal(workouts[2].date, '2026-10-02'); // restored to Fri
  assert.equal(workouts[2].originalDate, null);
});
