import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExerciseSubstitutionSummary,
  findSavedSwapSuggestions,
  getBiomechanicalSwapFallback,
  recordSwapSelectionInSuggestions,
  tagRecommendationsWithObjective,
} from './exercise-swap';
import { buildDataAnalystPrompts, buildMasterCoachPrompts } from './prompts';

describe('lib/ai/exercise-swap', () => {
  it('reuses saved swap suggestions when exercise and objective match exactly', () => {
    const tagged = tagRecommendationsWithObjective(
      [
        { title: 'Supino Máquina Articulado', reason: 'Mesmo vetor horizontal com alta estabilidade.' },
        { title: 'Supino com Halteres', reason: 'Maior amplitude sem depender da barra olímpica.' },
        { title: 'Crossover Polia Média', reason: 'Tensão constante no peitoral.' },
      ],
      'Hipertrofia Miofibrilar'
    );

    const swapHistory = [
      {
        id: 'swap-1',
        requestedExercise: 'Supino Reto com Barra',
        requestedPattern: 'Horizontal Push',
        suggestions: tagged,
        selectedIndex: 1,
      },
    ];

    // Same exercise + same objective -> returns saved suggestions
    const matchSameObj = findSavedSwapSuggestions({
      exerciseName: 'supino reto com barra',
      objective: 'Hipertrofia Miofibrilar',
      swapHistory,
    });

    assert.ok(matchSameObj);
    assert.equal(matchSameObj.swapSuggestionId, 'swap-1');
    assert.equal(matchSameObj.recommendations.length, 3);
    // Because selectedIndex was 1 ('Supino com Halteres'), it should be promoted to first
    assert.equal(matchSameObj.recommendations[0].title, 'Supino com Halteres');

    // Same exercise + DIFFERENT objective -> does not reuse
    const matchDiffObj = findSavedSwapSuggestions({
      exerciseName: 'Supino Reto com Barra',
      objective: 'Força Pura Powerlifting',
      swapHistory,
    });

    assert.equal(matchDiffObj, null);
  });

  it('records temporary and permanent ("Substituir sempre") choices and promotes them to top', () => {
    const initial = tagRecommendationsWithObjective(
      [
        { title: 'Leg Press 45°', reason: 'Sobrecarga estável de quadríceps.' },
        { title: 'Hack Squat Máquina', reason: 'Estabilidade guiada para joelhos e coluna.' },
        { title: 'Agachamento no Smith', reason: 'Barra guiada com rápido setup.' },
      ],
      'Hipertrofia Geral'
    );

    const afterPermanent = recordSwapSelectionInSuggestions({
      recommendations: initial,
      selectedTitle: 'Hack Squat Máquina',
      objective: 'Hipertrofia Geral',
      isPermanent: true,
      nowISO: '2026-11-03T19:00:00.000Z',
    });

    assert.equal(afterPermanent.selectedIndex, 0);
    assert.equal(afterPermanent.updatedRecommendations[0].title, 'Hack Squat Máquina');
    assert.equal(afterPermanent.updatedRecommendations[0].metadata?.isPermanent, true);
    assert.equal(afterPermanent.updatedRecommendations[0].metadata?.selectedCount, 1);
  });

  it('generates 3 biomechanically equivalent SmartFit fallback options without repeating original exercise', () => {
    const chestSwaps = getBiomechanicalSwapFallback(
      'Supino Máquina Articulado',
      'Horizontal Push',
      'Hipertrofia'
    );
    assert.equal(chestSwaps.length, 3);
    assert.ok(chestSwaps.every((s) => s.title !== 'Supino Máquina Articulado'));
    assert.ok(chestSwaps.every((s) => s.metadata?.objective === 'Hipertrofia'));
  });

  it('aggregates permanent swaps and frequent swaps and injects them into Analyst and Master Coach prompts', () => {
    const summary = buildExerciseSubstitutionSummary({
      swapSuggestions: [
        {
          id: 'swap-perm-1',
          requestedExercise: 'Agachamento Livre com Barra',
          requestedPattern: 'Squat',
          selectedIndex: 0,
          suggestions: [
            {
              title: 'Hack Squat Máquina',
              reason: 'Alta estabilidade e menor fadiga lombar.',
              metadata: {
                objective: 'Hipertrofia Geral',
                selectedCount: 3,
                isPermanent: true,
                lastSelectedAt: '2026-11-03T19:00:00.000Z',
              },
            },
          ],
        },
      ],
      activeMesocycle: {
        objective: 'Hipertrofia Geral',
        workoutDays: [],
      },
      recentWorkouts: [
        {
          date: '2026-11-01',
          exerciseExecutions: [
            {
              exerciseName: 'Remada Máquina Articulada',
              movementPattern: 'Horizontal Pull',
              substitutedFrom: 'Remada Curvada com Barra',
            },
          ],
        },
        {
          date: '2026-10-25',
          exerciseExecutions: [
            {
              exerciseName: 'Remada Máquina Articulada',
              movementPattern: 'Horizontal Pull',
              substitutedFrom: 'Remada Curvada com Barra',
            },
          ],
        },
      ],
    });

    assert.equal(summary.permanentSwaps.length, 1);
    assert.equal(summary.permanentSwaps[0].originalExercise, 'Agachamento Livre com Barra');
    assert.equal(summary.permanentSwaps[0].replacementExercise, 'Hack Squat Máquina');

    const rowFreq = summary.frequentSwaps.find(
      (f) => f.originalExercise === 'Remada Curvada com Barra'
    );
    assert.ok(rowFreq);
    assert.equal(rowFreq.preferredSubstitute, 'Remada Máquina Articulada');
    assert.equal(rowFreq.swapCount, 2);

    const analystPrompts = buildDataAnalystPrompts({
      athleteProfile: { id: 'singleton' },
      activeMesocycle: { objective: 'Hipertrofia Geral' },
      recentWorkouts: [],
      recentWellness: [],
      exerciseSubstitutionSummary: summary,
    });
    assert.ok(analystPrompts.userPrompt.includes('Hack Squat Máquina'));

    const masterPrompts = buildMasterCoachPrompts({
      athleteProfile: { id: 'singleton' },
      analystReport: {
        executiveSummary: 'Good progression.',
        exercisePerformance: [],
        progressionSignals: {
          progressionCompliance: 'high',
          keyBottlenecks: ['None'],
          recoveryConstraints: ['None'],
        },
        recommendationsForMaster: ['Use Hack Squat Máquina'],
      },
      previousCoachBrain: null,
      recentWorkouts: [],
      recentWellness: [],
      exerciseSubstitutionSummary: summary,
    });
    assert.ok(masterPrompts.systemPrompt.includes('PERMANENT ATHLETE PREFERENCES'));
    assert.ok(masterPrompts.userPrompt.includes('Agachamento Livre com Barra'));
    assert.ok(masterPrompts.userPrompt.includes('Hack Squat Máquina'));
  });
});
