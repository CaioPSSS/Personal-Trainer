import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRestrictionTags,
  parseAvailableEquipment,
  detectRequiredEquipment,
  isExerciseSafeForAthlete,
  filterSwapRecommendations,
  sanitizePlanPrescriptions,
} from './safety-filter';

test('Safety Filter: parses joint restrictions from text, arrays, and injuryHistory', () => {
  const tags = parseRestrictionTags('Dor na lombar L4-L5, desconforto no ombro esquerdo', {
    previous: ['canelite recente'],
  });
  assert.ok(tags.includes('lower_back'));
  assert.ok(tags.includes('shoulder'));
  assert.ok(tags.includes('ankle_shin'));

  assert.deepEqual(parseRestrictionTags('sem restrições'), []);
});

test('Safety Filter: detects required equipment and filters unavailable items', () => {
  assert.equal(detectRequiredEquipment('Agachamento no Smith Machine'), 'machines');
  assert.equal(detectRequiredEquipment('Supino com Halteres no Banco'), 'dumbbells');
  assert.equal(detectRequiredEquipment('Crossover na Polia Média'), 'cables');
  assert.equal(detectRequiredEquipment('Levantamento Terra com Barra'), 'barbell');
  assert.equal(detectRequiredEquipment('Barra Fixa (Pull-up)'), 'bodyweight');

  const equip = parseAvailableEquipment(['dumbbells', 'bodyweight']);
  const barbellCheck = isExerciseSafeForAthlete('Supino Reto com Barra', 'horizontal_push', [], equip);
  assert.equal(barbellCheck.safe, false);
  assert.equal(barbellCheck.missingEquipment, 'barbell');

  const dumbbellCheck = isExerciseSafeForAthlete('Supino com Halteres no Banco', 'horizontal_push', [], equip);
  assert.equal(dumbbellCheck.safe, true);
});

test('Safety Filter: filterSwapRecommendations & sanitizePlanPrescriptions block unsafe movements and swap safely', () => {
  const restrictions = parseRestrictionTags('hernia lombar e tendinite no ombro');
  const equipment = parseAvailableEquipment(['dumbbells', 'cables', 'machines', 'bodyweight']);

  const filtered = filterSwapRecommendations(
    [
      { title: 'Levantamento Terra Tradicional', reason: 'Cadeia posterior' },
      { title: 'Desenvolvimento Atrás da Nuca', reason: 'Deltoides' },
      { title: 'Desenvolvimento com Halteres Sentado', reason: 'Seguro para ombro' },
    ],
    'vertical_push',
    restrictions,
    equipment
  );

  assert.equal(filtered.blocked.length, 2);
  assert.equal(filtered.safe.length, 1);
  assert.equal(filtered.safe[0].title, 'Desenvolvimento com Halteres Sentado');

  const plan = sanitizePlanPrescriptions({
    days: [
      {
        label: 'Dia A - Full',
        exercises: [
          { exerciseName: 'Levantamento Terra', movementPattern: 'hinge', targetSets: 3 },
          { exerciseName: 'Paralelas (Dips)', movementPattern: 'horizontal_push', targetSets: 3 },
          { exerciseName: 'Elevação Lateral com Halteres', movementPattern: 'lateral_raise', targetSets: 3 },
        ],
      },
    ],
    movementRestrictions: 'lombar e ombro',
    availableEquipment: ['dumbbells', 'cables', 'bodyweight'],
  });

  assert.equal(plan.replacements.length, 2);
  assert.equal(plan.sanitizedDays[0].exercises[0].exerciseName, 'Elevação Pélvica com Halter');
  assert.notEqual(plan.sanitizedDays[0].exercises[1].exerciseName, 'Paralelas (Dips)');
  assert.equal(plan.sanitizedDays[0].exercises[2].exerciseName, 'Elevação Lateral com Halteres');
});
