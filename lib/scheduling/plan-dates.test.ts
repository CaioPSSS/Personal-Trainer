import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCycleEndDate,
  resolveCycleAnchorMonday,
  resolveRunningPlanMonthYear,
} from './plan-dates';

test('Smart Anchor: generating on Monday starts in the current week with all days allowed', () => {
  // 2026-11-23 is Monday
  const res = resolveCycleAnchorMonday({
    today: '2026-11-23',
    availableDayIndices: [0, 2, 4], // Mon, Wed, Fri
    weeklyTarget: 3,
  });

  assert.equal(res.anchorMonday, '2026-11-23');
  assert.equal(res.effectiveStartDate, '2026-11-23');
  assert.deepEqual(res.week1AllowedDayIndices, [0, 2, 4]);
  assert.equal(res.rolledToNextWeek, false);
});

test('Smart Anchor: generating on Wednesday with enough remaining available days starts this week without dropping sessions', () => {
  // 2026-11-25 is Wednesday (index 2)
  const res = resolveCycleAnchorMonday({
    today: '2026-11-25',
    availableDayIndices: [0, 1, 2, 3, 4, 5], // Mon..Sat -> remaining: Wed, Thu, Fri, Sat (4 >= 3)
    weeklyTarget: 3,
  });

  assert.equal(res.anchorMonday, '2026-11-23');
  assert.equal(res.effectiveStartDate, '2026-11-25');
  assert.deepEqual(res.week1AllowedDayIndices, [2, 3, 4, 5]);
  assert.deepEqual(res.week1AllowedDayNames, ['wednesday', 'thursday', 'friday', 'saturday']);
  assert.equal(res.rolledToNextWeek, false);
});

test('Smart Anchor: generating on Saturday rolls cleanly to next Monday preserving Week 1 in full', () => {
  // 2026-11-21 is Saturday (index 5)
  const res = resolveCycleAnchorMonday({
    today: '2026-11-21',
    availableDayIndices: [1, 3, 5], // Tue, Thu, Sat -> only 1 day left < target 3
    weeklyTarget: 3,
  });

  assert.equal(res.anchorMonday, '2026-11-23');
  assert.equal(res.effectiveStartDate, '2026-11-23');
  assert.deepEqual(res.week1AllowedDayIndices, [1, 3, 5]);
  assert.equal(res.rolledToNextWeek, true);
});

test('Smart Anchor: generating on Sunday rolls cleanly to tomorrow (Monday) preserving Week 1 in full', () => {
  // 2026-11-22 is Sunday (index 6)
  const res = resolveCycleAnchorMonday({
    today: '2026-11-22',
    availableDayIndices: [0, 1, 3, 4], // Mon, Tue, Thu, Fri
    weeklyTarget: 4,
  });

  assert.equal(res.anchorMonday, '2026-11-23');
  assert.equal(res.effectiveStartDate, '2026-11-23');
  assert.deepEqual(res.week1AllowedDayIndices, [0, 1, 3, 4]);
  assert.equal(res.rolledToNextWeek, true);
});

test('Smart Anchor: generating late mid-week (Thursday) without enough remaining days rolls to next Monday', () => {
  // 2026-11-26 is Thursday (index 3)
  const res = resolveCycleAnchorMonday({
    today: '2026-11-26',
    availableDayIndices: [0, 2, 4], // Mon, Wed, Fri -> only Fri left (1 < 3)
    weeklyTarget: 3,
  });

  assert.equal(res.anchorMonday, '2026-11-30');
  assert.equal(res.effectiveStartDate, '2026-11-30');
  assert.deepEqual(res.week1AllowedDayIndices, [0, 2, 4]);
  assert.equal(res.rolledToNextWeek, true);
});

test('Smart Anchor: explicit requestedStartDate on a future Monday is respected', () => {
  const res = resolveCycleAnchorMonday({
    today: '2026-11-21',
    availableDayIndices: [0, 2, 4],
    weeklyTarget: 3,
    requestedStartDate: '2026-11-30', // Next-next Monday
  });

  assert.equal(res.anchorMonday, '2026-11-30');
  assert.equal(res.effectiveStartDate, '2026-11-30');
  assert.equal(res.rolledToNextWeek, true);
});

test('RunningPlan Month/Year: uses ISO Thursday of Week 1 across month boundaries', () => {
  // Monday Nov 30, 2026 -> Thursday is Dec 3, 2026 -> December!
  assert.deepEqual(resolveRunningPlanMonthYear('2026-11-30'), { month: 12, year: 2026 });
  // Monday Nov 23, 2026 -> Thursday is Nov 26, 2026 -> November
  assert.deepEqual(resolveRunningPlanMonthYear('2026-11-23'), { month: 11, year: 2026 });
  // Monday Dec 28, 2026 -> Thursday is Dec 31, 2026 -> December 2026
  assert.deepEqual(resolveRunningPlanMonthYear('2026-12-28'), { month: 12, year: 2026 });
  // Monday Dec 29, 2025 -> Thursday is Jan 1, 2026 -> January 2026
  assert.deepEqual(resolveRunningPlanMonthYear('2025-12-29'), { month: 1, year: 2026 });
});

test('Cycle End Date: computes inclusive Sunday of the final week', () => {
  // 4-week block starting Monday 2026-11-23 ends Sunday 2026-12-20
  assert.equal(computeCycleEndDate('2026-11-23', 4), '2026-12-20');
  // 6-week block starting Monday 2026-11-23 ends Sunday 2027-01-03
  assert.equal(computeCycleEndDate('2026-11-23', 6), '2027-01-03');
});
