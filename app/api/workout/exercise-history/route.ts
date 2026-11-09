import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateEstimated1RM } from '@/lib/analytics/hypertrophy-analytics';
import { isSameExerciseName } from '@/lib/ai/exercise-swap';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const exerciseName = searchParams.get('name')?.trim();

    if (!exerciseName) {
      return NextResponse.json({ error: 'name query param is required.' }, { status: 400 });
    }

    const allExecutions = await prisma.exerciseExecution.findMany({
      where: {
        workoutExecution: {
          athleteProfileId: 'singleton',
          status: 'completed',
        },
      },
      include: {
        setExecutions: {
          orderBy: { setNumber: 'asc' },
        },
        workoutExecution: {
          select: {
            date: true,
            sessionRpe: true,
          },
        },
      },
      orderBy: {
        workoutExecution: {
          date: 'asc',
        },
      },
    });

    const matched = allExecutions.filter(
      (ex) =>
        isSameExerciseName(ex.exerciseName, exerciseName) ||
        (ex.substitutedFrom && isSameExerciseName(ex.substitutedFrom, exerciseName))
    );

    let allTimeMaxLoadKg = 0;
    let allTimeBest1RM = 0;
    let allTimeBestSetLabel = '—';

    const sessions = matched
      .map((ex) => {
        const validSets = ex.setExecutions.filter((s) => (s.reps ?? 0) > 0);
        if (validSets.length === 0) return null;

        let maxLoadKg = 0;
        let bestEstimated1RM = 0;
        let totalTonnageKg = 0;
        let bestSetLabel = '';

        const sets = validSets.map((s) => {
          const load = Number(s.loadKg ?? 0);
          const reps = Number(s.reps ?? 0);
          const e1rm = calculateEstimated1RM(load, reps, s.rpe);
          totalTonnageKg += load * reps;

          if (load > maxLoadKg) {
            maxLoadKg = load;
          }
          if (e1rm > bestEstimated1RM) {
            bestEstimated1RM = e1rm;
            bestSetLabel = `${load}kg × ${reps} reps${s.rpe ? ` @ RPE ${s.rpe}` : ''}`;
          }
          if (load > allTimeMaxLoadKg) {
            allTimeMaxLoadKg = load;
          }
          if (e1rm > allTimeBest1RM) {
            allTimeBest1RM = e1rm;
            allTimeBestSetLabel = `${load}kg × ${reps} reps (${ex.workoutExecution.date})`;
          }

          return {
            setNumber: s.setNumber,
            loadKg: load,
            reps,
            rpe: s.rpe,
            isFailure: s.isFailure,
            e1RM: e1rm,
          };
        });

        return {
          date: ex.workoutExecution.date,
          exerciseName: ex.exerciseName,
          movementPattern: ex.movementPattern,
          maxLoadKg: Math.round(maxLoadKg * 10) / 10,
          bestEstimated1RM: Math.round(bestEstimated1RM * 10) / 10,
          totalTonnageKg: Math.round(totalTonnageKg),
          bestSetLabel,
          sets,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return NextResponse.json({
      exerciseName,
      totalSessions: sessions.length,
      allTimeMaxLoadKg,
      allTimeBest1RM,
      allTimeBestSetLabel,
      sessions,
    });
  } catch (error) {
    console.error('[GET /api/workout/exercise-history] Error:', error);
    return NextResponse.json({ error: 'Failed to load exercise history.' }, { status: 500 });
  }
}
