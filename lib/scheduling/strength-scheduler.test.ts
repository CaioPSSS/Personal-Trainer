import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSplitDayOffsets,
  formatISODate,
  getMondayOfDate,
  parseAvailableDayIndices,
  isLowerBodyWorkout,
  isUpperBodyWorkout,
  solveOptimalWeeklyStrengthDistribution,
  CalendarEventScheduleContext,
  StrengthWorkoutToSchedule,
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

test('Multi-Sport: parseAvailableDayIndices parses numeric and string day names', () => {
  assert.deepEqual(parseAvailableDayIndices([0, 2, 4]), [0, 2, 4]);
  assert.deepEqual(parseAvailableDayIndices(['Seg', 'Qua', 'Sex']), [0, 2, 4]);
  assert.deepEqual(parseAvailableDayIndices(['segunda-feira', 'quinta-feira', 'sabado']), [0, 3, 5]);
  assert.deepEqual(parseAvailableDayIndices(['monday', 'wednesday', 'sunday']), [0, 2, 6]);
});

test('Multi-Sport: isLowerBodyWorkout and isUpperBodyWorkout identification', () => {
  assert.equal(isLowerBodyWorkout({ title: 'Treino A - Pernas e Glúteos' }), true);
  assert.equal(isLowerBodyWorkout({ label: 'Lower 1 (Agachamento)' }), true);
  assert.equal(isLowerBodyWorkout({ title: 'Inferiores Foco Quadríceps' }), true);
  assert.equal(
    isLowerBodyWorkout({
      title: 'Treino A',
      prescriptions: [{ movementPattern: 'squat', exerciseName: 'Agachamento Livre' }],
    }),
    true
  );

  assert.equal(isLowerBodyWorkout({ title: 'Treino B - Peito e Tríceps' }), false);
  assert.equal(isUpperBodyWorkout({ title: 'Treino B - Peito e Tríceps' }), true);
  assert.equal(isUpperBodyWorkout({ label: 'Upper 1 (Supino e Remada)' }), true);
});

test('Multi-Sport Solver: 3 workouts allocated across 5 available days', () => {
  const weekMonday = new Date(2026, 8, 28); // 2026-09-28
  const availableDays = [0, 1, 2, 4, 5]; // Mon, Tue, Wed, Fri, Sat (5 days)
  const workouts: StrengthWorkoutToSchedule[] = [
    { id: 'w1', title: 'Upper A - Peito e Costas', isLower: false },
    { id: 'w2', title: 'Lower A - Pernas Completo', isLower: true },
    { id: 'w3', title: 'Upper B - Ombros e Braços', isLower: false },
  ];

  const result = solveOptimalWeeklyStrengthDistribution({
    weekMonday,
    availableDays,
    workouts,
    fixedEvents: [],
  });

  assert.equal(result.assignment.length, 3);
  // All assigned days must be in availableDays
  for (const a of result.assignment) {
    assert.ok(availableDays.includes(a.dayIndex));
  }
  // No two workouts on the same day
  const assignedDays = result.assignment.map((a) => a.dayIndex);
  const uniqueDays = new Set(assignedDays);
  assert.equal(uniqueDays.size, 3);
});

test('Multi-Sport Solver: Leg Day is repelled from Sunday Long Run', () => {
  const weekMonday = new Date(2026, 8, 28);
  const availableDays = [0, 1, 2, 4, 5, 6]; // Mon, Tue, Wed, Fri, Sat, Sun

  // Fixed event: Sunday Long Run (dayIndex = 6)
  const fixedEvents: CalendarEventScheduleContext[] = [
    {
      date: '2026-10-04',
      dayIndex: 6, // Sunday
      eventType: 'running',
      title: 'Treino Longo 16km',
      runningSessionType: 'long_run',
    },
  ];

  const workouts: StrengthWorkoutToSchedule[] = [
    { id: 'w1', title: 'Upper A (Peito / Costas)', isLower: false },
    { id: 'w2', title: 'Lower A (Pernas / Agachamento)', isLower: true },
    { id: 'w3', title: 'Upper B (Ombros / Braços)', isLower: false },
  ];

  const result = solveOptimalWeeklyStrengthDistribution({
    weekMonday,
    availableDays,
    workouts,
    fixedEvents,
  });

  const legWorkout = result.assignment.find((a) => a.isLower);
  assert.ok(legWorkout);

  // Leg workout must NOT be on Sunday (day 6, same day) or Saturday (day 5, pre-fatigue before 16k long run)
  assert.notEqual(legWorkout.dayIndex, 6, 'Lower body should not be on Sunday with Long Run');
  assert.notEqual(legWorkout.dayIndex, 5, 'Lower body should not be on Saturday before Long Run');
  // Lower body should be placed early or midweek (e.g. Wednesday or Friday)
  assert.ok([1, 2, 4].includes(legWorkout.dayIndex));
});

test('Multi-Sport Solver: Leg Day repelled from Tuesday Intervals / Tiros', () => {
  const weekMonday = new Date(2026, 8, 28);
  const availableDays = [0, 1, 2, 3, 4]; // Mon-Fri

  // Fixed event: Tuesday Intervals (dayIndex = 1)
  const fixedEvents: CalendarEventScheduleContext[] = [
    {
      date: '2026-09-29',
      dayIndex: 1, // Tuesday
      eventType: 'running',
      title: 'Tiros 8x400m no Pace 4:10',
      runningSessionType: 'intervals',
    },
  ];

  const workouts: StrengthWorkoutToSchedule[] = [
    { id: 'w1', title: 'Upper A', isLower: false },
    { id: 'w2', title: 'Lower A (Pernas)', isLower: true },
    { id: 'w3', title: 'Upper B', isLower: false },
  ];

  const result = solveOptimalWeeklyStrengthDistribution({
    weekMonday,
    availableDays,
    workouts,
    fixedEvents,
  });

  const legWorkout = result.assignment.find((a) => a.isLower);
  assert.ok(legWorkout);
  // Leg workout should not be on Tuesday (same day) nor Monday (pre-fatiguing hamstrings/quads before intervals)
  assert.notEqual(legWorkout.dayIndex, 1, 'Lower body should not be on Tuesday with Intervals');
  assert.notEqual(legWorkout.dayIndex, 0, 'Lower body should not pre-fatigue before Tuesday intervals');
  // Leg workout should be Wednesday, Thursday or Friday
  assert.ok([2, 3, 4].includes(legWorkout.dayIndex));
});

test('Multi-Sport Solver: CrossFit on Wednesday repels Leg Day from Wednesday and Thursday', () => {
  const weekMonday = new Date(2026, 8, 28);
  const availableDays = [0, 1, 2, 3, 4]; // Mon-Fri

  // Fixed event: Wednesday CrossFit (dayIndex = 2) with legs / high RPE
  const fixedEvents: CalendarEventScheduleContext[] = [
    {
      date: '2026-09-30',
      dayIndex: 2, // Wednesday
      eventType: 'crossfit',
      title: 'CrossFit WOD Murph',
      muscleGroups: ['Pernas', 'Full Body'],
      sessionRpe: 8.5,
    },
  ];

  const workouts: StrengthWorkoutToSchedule[] = [
    { id: 'w1', title: 'Upper A', isLower: false },
    { id: 'w2', title: 'Lower A (Pernas)', isLower: true },
    { id: 'w3', title: 'Upper B', isLower: false },
  ];

  const result = solveOptimalWeeklyStrengthDistribution({
    weekMonday,
    availableDays,
    workouts,
    fixedEvents,
  });

  const legWorkout = result.assignment.find((a) => a.isLower);
  assert.ok(legWorkout);
  // Leg workout should not collide with CrossFit on Wednesday
  assert.notEqual(legWorkout.dayIndex, 2, 'Lower body should not be on Wednesday with heavy CrossFit');
  assert.notEqual(legWorkout.dayIndex, 3, 'Lower body should not be immediately after heavy CrossFit (DOMS)');
});
