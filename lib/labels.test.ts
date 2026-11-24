import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMovementPattern, formatHrZone } from './labels';

test('Labels: formatMovementPattern maps technical pattern tokens and normalizes spacing', () => {
  assert.equal(formatMovementPattern('horizontal_push'), 'Empurrar Horizontal');
  assert.equal(formatMovementPattern('HINGE'), 'Dobradiça de Quadril');
  assert.equal(formatMovementPattern('triceps-extension'), 'Extensão de Cotovelo (Tríceps)');
  assert.equal(formatMovementPattern('custom_unknown_pattern'), 'Custom Unknown Pattern');
  assert.equal(formatMovementPattern(null), 'Geral');
});

test('Labels: formatHrZone translates zone tokens in compact and detailed formats', () => {
  assert.equal(formatHrZone('zone2', true), 'Zona 2');
  assert.equal(formatHrZone('zone2', false), 'Zona 2 (Aeróbico Base)');
  assert.equal(formatHrZone('Z4', true), 'Zona 4');
  assert.equal(formatHrZone('z_5', false), 'Zona 5 (VO2 Máx)');
  assert.equal(formatHrZone(undefined), 'Zona 2');
});
