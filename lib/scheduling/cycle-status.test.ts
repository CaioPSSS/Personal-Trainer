import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateRunningCycleStatus,
  evaluateStrengthCycleStatus,
} from './cycle-status';

test('Strength Cycle Status: returns none when there is no active mesocycle', () => {
  const res = evaluateStrengthCycleStatus({
    today: '2026-11-21',
    activePlan: null,
    availableDayIndices: [0, 2, 4],
    weeklyWorkoutsTarget: 3,
    completedWorkoutsCount: 0,
    remainingPlannedCount: 0,
  });

  assert.equal(res.status, 'none');
  assert.equal(res.needsRenewal, false);
  // Saturday rolls suggestedStartDate to next Monday
  assert.equal(res.suggestedStartDate, '2026-11-23');
});

test('Strength Cycle Status: stays active when final week still has planned workouts (no premature nag)', () => {
  const res = evaluateStrengthCycleStatus({
    today: '2026-12-18', // Friday of Week 4 (ends Sun 2026-12-20)
    activePlan: {
      id: 'meso_1',
      title: 'Hipertrofia Upper/Lower',
      split: 'Upper/Lower',
      startDate: '2026-11-23',
      endDate: '2026-12-20',
      createdAt: new Date('2026-11-21T12:00:00Z'),
      durationWeeks: 4,
    },
    availableDayIndices: [0, 1, 3, 4],
    weeklyWorkoutsTarget: 4,
    completedWorkoutsCount: 15,
    remainingPlannedCount: 1, // 1 workout still left on Friday
  });

  assert.equal(res.status, 'active');
  assert.equal(res.needsRenewal, false);
});

test('Strength Cycle Status: triggers completed immediately when the last workout of final week is finished', () => {
  const res = evaluateStrengthCycleStatus({
    today: '2026-12-18', // Friday of Week 4
    activePlan: {
      id: 'meso_1',
      title: 'Hipertrofia Upper/Lower',
      split: 'Upper/Lower',
      startDate: '2026-11-23',
      endDate: '2026-12-20',
      createdAt: new Date('2026-11-21T12:00:00Z'),
      durationWeeks: 4,
    },
    availableDayIndices: [0, 1, 3, 4],
    weeklyWorkoutsTarget: 4,
    completedWorkoutsCount: 16,
    remainingPlannedCount: 0, // Last workout just completed!
  });

  assert.equal(res.status, 'completed');
  assert.equal(res.needsRenewal, true);
  // Next Monday after cycle end (2026-12-20) is 2026-12-21
  assert.equal(res.suggestedStartDate, '2026-12-21');
});

test('Strength Cycle Status: stays ended after plan endDate even if workouts were missed', () => {
  const res = evaluateStrengthCycleStatus({
    today: '2026-12-22', // Tuesday after cycle ended on 2026-12-20
    activePlan: {
      id: 'meso_1',
      title: 'Hipertrofia Upper/Lower',
      split: 'Upper/Lower',
      startDate: '2026-11-23',
      endDate: '2026-12-20',
      createdAt: new Date('2026-11-21T12:00:00Z'),
      durationWeeks: 4,
    },
    availableDayIndices: [0, 1, 2, 3, 4],
    weeklyWorkoutsTarget: 3,
    completedWorkoutsCount: 6,
    remainingPlannedCount: 0,
  });

  assert.equal(res.status, 'ended');
  assert.equal(res.needsRenewal, true);
  // Tuesday with Tue/Wed/Thu/Fri remaining (4 >= 3) can start today
  assert.equal(res.suggestedStartDate, '2026-12-22');
});

test('Running Cycle Status: stays active while future planned sessions remain', () => {
  const res = evaluateRunningCycleStatus({
    today: '2026-12-18', // Friday of Week 4
    activePlan: {
      id: 'run_1',
      title: 'Dezembro 2026 — Base',
      month: 12,
      year: 2026,
      sessions: [
        { scheduledDate: '2026-11-24', status: 'completed' },
        { scheduledDate: '2026-12-17', status: 'completed' },
        { scheduledDate: '2026-12-19', status: 'planned' }, // Saturday long run still planned
      ],
    },
    availableDayIndices: [1, 3, 5],
    weeklyRunsTarget: 3,
  });

  assert.equal(res.status, 'active');
  assert.equal(res.needsRenewal, false);
});

test('Running Cycle Status: triggers completed as soon as last running session is completed', () => {
  const res = evaluateRunningCycleStatus({
    today: '2026-12-19', // Saturday right after finishing the last run
    activePlan: {
      id: 'run_1',
      title: 'Dezembro 2026 — Base',
      month: 12,
      year: 2026,
      sessions: [
        { scheduledDate: '2026-11-24', status: 'completed' },
        { scheduledDate: '2026-12-17', status: 'completed' },
        { scheduledDate: '2026-12-19', status: 'completed' },
      ],
    },
    availableDayIndices: [1, 3, 5],
    weeklyRunsTarget: 3,
  });

  assert.equal(res.status, 'completed');
  assert.equal(res.needsRenewal, true);
  assert.equal(res.suggestedStartDate, '2026-12-21'); // Next Monday
  assert.equal(res.completedSessions, 3);
  assert.equal(res.totalSessions, 3);
});

test('Running Cycle Status: triggers ended once today passes lastSessionDate', () => {
  const res = evaluateRunningCycleStatus({
    today: '2026-12-21', // Monday after last session on Saturday Dec 19
    activePlan: {
      id: 'run_1',
      title: 'Dezembro 2026 — Base',
      month: 12,
      year: 2026,
      sessions: [
        { scheduledDate: '2026-11-24', status: 'completed' },
        { scheduledDate: '2026-12-19', status: 'planned' }, // Missed last run
      ],
    },
    availableDayIndices: [1, 3, 5],
    weeklyRunsTarget: 3,
  });

  assert.equal(res.status, 'ended');
  assert.equal(res.needsRenewal, true);
  assert.equal(res.suggestedStartDate, '2026-12-21');
});
