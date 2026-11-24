import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftISODate, weekRangeOfISODate } from '@/lib/dates';
import {
  extractPreservedISODate,
  resolveEventSkipStrategy,
  planCollisionAwareReschedule,
  planUnskipRestoration,
} from './calendar-skip';

test('Calendar Skip & Unskip: weekRangeOfISODate computes Monday and Sunday boundaries', () => {
  assert.deepEqual(weekRangeOfISODate('2026-09-30'), {
    startOfWeek: '2026-09-28',
    endOfWeek: '2026-10-04',
  });
  assert.deepEqual(weekRangeOfISODate('2026-10-04'), {
    startOfWeek: '2026-09-28',
    endOfWeek: '2026-10-04',
  });
  assert.deepEqual(weekRangeOfISODate('2026-09-28'), {
    startOfWeek: '2026-09-28',
    endOfWeek: '2026-10-04',
  });
});

test('Calendar Skip & Unskip: shiftISODate offsets across month and year boundaries without drift', () => {
  assert.equal(shiftISODate('2026-09-28', 1), '2026-09-29');
  assert.equal(shiftISODate('2026-09-30', 1), '2026-10-01');
  assert.equal(shiftISODate('2026-10-01', -1), '2026-09-30');
  assert.equal(shiftISODate('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftISODate('2027-01-01', -1), '2026-12-31');
});

test('Calendar Skip & Unskip: resolveEventSkipStrategy prefers typed skipStrategy over legacy sentinel', () => {
  assert.equal(
    resolveEventSkipStrategy({
      skipStrategy: 'skip_and_reschedule',
      originalDate: '2026-09-28',
    }),
    'skip_and_reschedule'
  );
  assert.equal(
    resolveEventSkipStrategy({
      skipStrategy: 'skip_only',
      originalDate: 'skip_and_reschedule',
    }),
    'skip_only'
  );
  assert.equal(
    resolveEventSkipStrategy({
      skipStrategy: null,
      originalDate: 'skip_and_reschedule::2026-09-28',
    }),
    'skip_and_reschedule'
  );
  assert.equal(
    extractPreservedISODate('skip_and_reschedule::2026-09-28'),
    '2026-09-28'
  );
  assert.equal(extractPreservedISODate('skip_and_reschedule'), null);
});

test('Calendar Skip & Unskip: planCollisionAwareReschedule avoids high-impact runs and respects reversibility', () => {
  const skippedEvent = {
    id: 'ev-str-1',
    date: '2026-09-28', // Monday
    eventType: 'strength',
    title: 'Treino A - Inferiores',
    status: 'planned',
    originalDate: null,
  };

  const subsequent = [
    {
      id: 'ev-str-2',
      date: '2026-09-30', // Wednesday (+1 would be Thu 2026-10-01, which has a tempo run!)
      eventType: 'strength',
      title: 'Treino B - Superiores',
      status: 'planned',
      originalDate: null,
    },
    {
      id: 'ev-str-3',
      date: '2026-10-02', // Friday
      eventType: 'strength',
      title: 'Treino C - Full',
      status: 'planned',
      originalDate: null,
    },
  ];

  const plans = planCollisionAwareReschedule({
    skippedEvent,
    subsequentStrengthEvents: subsequent,
    occupiedEvents: [
      ...subsequent,
      {
        id: 'ev-run-thu',
        date: '2026-10-01', // Thursday high-impact intervals
        eventType: 'running',
        runningSessionType: 'intervals',
        title: 'Tiros na Pista',
        status: 'planned',
      },
    ],
    availableDayIndices: [0, 1, 2, 3, 4, 5], // Mon..Sat
    endOfWeek: '2026-10-04',
  });

  assert.equal(plans.length, 2);
  // ev-str-2 skips Thursday collision (2026-10-01) and lands on Friday (2026-10-02)
  assert.equal(plans[0].fromDate, '2026-09-30');
  assert.equal(plans[0].toDate, '2026-10-02');
  assert.equal(plans[0].avoidedCollision, true);
  assert.equal(plans[0].originalDateToSave, '2026-09-30');

  // ev-str-3 shifts strictly after ev-str-2 (Saturday 2026-10-03)
  assert.equal(plans[1].fromDate, '2026-10-02');
  assert.equal(plans[1].toDate, '2026-10-03');
  assert.equal(plans[1].originalDateToSave, '2026-10-02');

  // Simulate persisted rescheduled state and plan unskip restoration
  const restore = planUnskipRestoration({
    event: {
      ...skippedEvent,
      status: 'skipped',
      skipStrategy: 'skip_and_reschedule',
      originalDate: '2026-09-28',
    },
    subsequentPlannedStrengthEvents: plans.map((p, idx) => ({
      ...subsequent[idx],
      date: p.toDate,
      originalDate: p.originalDateToSave,
    })),
    strategy: 'auto',
  });

  assert.equal(restore.wasRescheduled, true);
  assert.equal(restore.shouldRevertSchedule, true);
  assert.equal(restore.restoredOriginalDate, '2026-09-28');
  assert.deepEqual(
    restore.eventsToRestore.map((e) => ({ id: e.id, toDate: e.toDate, orig: e.originalDateToSave })),
    [
      { id: 'ev-str-2', toDate: '2026-09-30', orig: null },
      { id: 'ev-str-3', toDate: '2026-10-02', orig: null },
    ]
  );
});
