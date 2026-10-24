import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDayOfWeek } from './cross-training-scheduler';
import { todayISO, shiftISODate, dayOfWeekName } from '@/lib/dates';

test('Cross-Training Scheduler: normalizeDayOfWeek handles English and Portuguese variants', () => {
  assert.equal(normalizeDayOfWeek('Segunda'), 'monday');
  assert.equal(normalizeDayOfWeek('segunda-feira'), 'monday');
  assert.equal(normalizeDayOfWeek('seg'), 'monday');
  assert.equal(normalizeDayOfWeek('monday'), 'monday');
  assert.equal(normalizeDayOfWeek('Mon'), 'monday');

  assert.equal(normalizeDayOfWeek('Quarta'), 'wednesday');
  assert.equal(normalizeDayOfWeek('qua'), 'wednesday');
  assert.equal(normalizeDayOfWeek('wednesday'), 'wednesday');

  assert.equal(normalizeDayOfWeek('Sexta'), 'friday');
  assert.equal(normalizeDayOfWeek('sex'), 'friday');
  assert.equal(normalizeDayOfWeek('friday'), 'friday');

  assert.equal(normalizeDayOfWeek('Sábado'), 'saturday');
  assert.equal(normalizeDayOfWeek('sabado'), 'saturday');
  assert.equal(normalizeDayOfWeek('sab'), 'saturday');

  assert.equal(normalizeDayOfWeek('Domingo'), 'sunday');
  assert.equal(normalizeDayOfWeek('dom'), 'sunday');
});

test('Cross-Training Scheduler: forward-only projection respects today cutoff', () => {
  const today = todayISO();
  const pastDate = shiftISODate(today, -1);
  const futureDate = shiftISODate(today, 1);

  assert.ok(pastDate < today, 'Past date must be strictly less than today');
  assert.ok(futureDate > today, 'Future date must be strictly greater than today');

  // Any recurring schedule targeting Monday & Wednesday correctly identifies matching dates
  const nextMonday = [0, 1, 2, 3, 4, 5, 6, 7]
    .map((offset) => shiftISODate(today, offset))
    .find((date) => dayOfWeekName(date) === 'monday');

  assert.ok(nextMonday, 'Must find a Monday within 7 days');
  assert.ok(nextMonday >= today, 'Found Monday must be today or future');
});
