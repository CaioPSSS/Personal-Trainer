import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAuthorized, unauthorizedResponse, verifyCalendarFeedToken } from '@/lib/auth';
import { shiftISODate, todayISO } from '@/lib/dates';
import { generateICalendarFeed, ICalEventInput } from '@/lib/analytics/wod-parser';
import { formatPacePerKm } from '@/lib/running/vdot-predictor';
import { formatHrZone } from '@/lib/labels';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!isAuthorized(request) && !verifyCalendarFeedToken(token)) {
    return unauthorizedResponse();
  }

  try {
    const startRange = shiftISODate(todayISO(), -30);
    const endRange = shiftISODate(todayISO(), 60);

    const [calendarEvents, activeMesocycle, activeRunningPlan, crossActivities] = await Promise.all([
      prisma.calendarEvent.findMany({
        where: {
          athleteProfileId: 'singleton',
          date: { gte: startRange, lte: endRange },
        },
        orderBy: [{ date: 'asc' }, { sortOrder: 'asc' }],
      }),
      prisma.mesocyclePlan.findFirst({
        where: { athleteProfileId: 'singleton', status: 'active' },
        include: {
          workoutDays: {
            include: {
              prescriptions: {
                orderBy: { sortOrder: 'asc' },
              },
            },
          },
        },
      }),
      prisma.runningPlan.findFirst({
        where: { runningProfileId: 'singleton', status: 'active' },
        include: {
          sessions: true,
        },
      }),
      prisma.crossTrainingActivity.findMany({
        where: {
          athleteProfileId: 'singleton',
          date: { gte: startRange, lte: endRange },
        },
      }),
    ]);

    const templatesById = new Map(
      (activeMesocycle?.workoutDays ?? []).map((t) => [t.id, t])
    );
    const templatesByLabel = new Map(
      (activeMesocycle?.workoutDays ?? []).map((t) => [t.label.trim().toLowerCase(), t])
    );
    const runningSessionsById = new Map(
      (activeRunningPlan?.sessions ?? []).map((s) => [s.id, s])
    );
    const crossById = new Map(crossActivities.map((c) => [c.id, c]));

    const icalEvents: ICalEventInput[] = calendarEvents.map((ev) => {
      let summary = ev.title;
      const descLines: string[] = [];

      if (ev.eventType === 'strength') {
        summary = `🏋️ Musculação: ${ev.title}`;
        const tmpl =
          (ev.referenceId ? templatesById.get(ev.referenceId) : undefined) ||
          templatesByLabel.get(ev.title.trim().toLowerCase());

        if (tmpl && tmpl.prescriptions.length > 0) {
          descLines.push(`Bloco: ${activeMesocycle?.title ?? 'Hipertrofia'}`);
          descLines.push(`Duração estimada: ~${tmpl.estimatedDurationMin} min`);
          descLines.push('');
          descLines.push('📋 FICHA DO TREINO:');
          for (const rx of tmpl.prescriptions) {
            const rpeStr = rx.targetRpeMin ? ` | RPE ${rx.targetRpeMin}-${rx.targetRpeMax}` : '';
            const restStr = rx.restSeconds ? ` | Descanso ${rx.restSeconds}s` : '';
            descLines.push(
              `• ${rx.exerciseName}: ${rx.targetSets}x ${rx.targetRepMin}-${rx.targetRepMax} reps${rpeStr}${restStr}`
            );
          }
        } else {
          descLines.push('Sessão de Musculação agendada no Personal Trainer AI.');
        }
      } else if (ev.eventType === 'running') {
        summary = `🏃 Corrida: ${ev.title}`;
        const runSession = ev.referenceId ? runningSessionsById.get(ev.referenceId) : undefined;
        if (runSession) {
          descLines.push(`Tipo: ${runSession.sessionType.toUpperCase()}`);
          if (runSession.totalDistanceKm) descLines.push(`Distância alvo: ${runSession.totalDistanceKm} km`);
          if (runSession.targetPaceSec) descLines.push(`Pace alvo: ${formatPacePerKm(runSession.targetPaceSec)}`);
          if (runSession.targetHrZone) descLines.push(`Zona FC: ${formatHrZone(runSession.targetHrZone, false)}`);
          if (Array.isArray(runSession.segments) && runSession.segments.length > 0) {
            descLines.push('');
            descLines.push('🏃 SEGMENTOS:');
            for (const rawSeg of runSession.segments) {
              if (!rawSeg || typeof rawSeg !== 'object') continue;
              const seg = rawSeg as Record<string, unknown>;
              const segType = typeof seg.type === 'string' ? seg.type : 'Bloco';
              const parts: string[] = [];
              if (typeof seg.reps === 'number' && seg.reps > 1) parts.push(`${seg.reps}x`);
              if (typeof seg.distanceKm === 'number') parts.push(`${seg.distanceKm} km`);
              else if (typeof seg.distanceM === 'number') parts.push(`${seg.distanceM} m`);
              if (typeof seg.durationMin === 'number') parts.push(`${seg.durationMin} min`);
              if (
                Array.isArray(seg.paceRangeSec) &&
                seg.paceRangeSec.length === 2 &&
                typeof seg.paceRangeSec[0] === 'number' &&
                typeof seg.paceRangeSec[1] === 'number'
              ) {
                parts.push(
                  `@ ${formatPacePerKm(seg.paceRangeSec[0])}-${formatPacePerKm(seg.paceRangeSec[1])}`
                );
              }
              if (typeof seg.hrZone === 'string' && seg.hrZone) {
                parts.push(`(${formatHrZone(seg.hrZone, true)})`);
              }
              if (typeof seg.restSec === 'number' && seg.restSec > 0) {
                parts.push(`| pausa ${seg.restSec}s`);
              }
              if (typeof seg.notes === 'string' && seg.notes.trim()) {
                parts.push(`— ${seg.notes.trim()}`);
              }
              descLines.push(`• ${segType}: ${parts.join(' ') || 'ritmo contínuo'}`);
            }
          }
          if (runSession.notes) {
            descLines.push('');
            descLines.push(`Notas: ${runSession.notes}`);
          }
        } else {
          descLines.push('Sessão de Corrida agendada no Personal Trainer AI.');
        }
      } else {
        summary = `🔥 ${ev.title}`;
        const ct = ev.referenceId ? crossById.get(ev.referenceId) : undefined;
        if (ct) {
          descLines.push(`Modalidade: ${ct.activityType.toUpperCase()} (${ct.durationMinutes} min)`);
          if (Array.isArray(ct.muscleGroups) && ct.muscleGroups.length > 0) {
            descLines.push(`Grupamentos exigidos: ${(ct.muscleGroups as string[]).join(', ')}`);
          }
          if (ct.notes) descLines.push(`Notas: ${ct.notes}`);
        } else {
          descLines.push('Sessão de Cross-Training agendada no Personal Trainer AI.');
        }
      }

      if (ev.caloriesBurned) {
        descLines.push('');
        descLines.push(`🔥 Gasto calórico: ${ev.caloriesBurned} kcal`);
      }

      return {
        uid: ev.id,
        date: ev.date,
        summary,
        description: descLines.join('\n'),
        status: (ev.status as 'planned' | 'completed' | 'skipped') || 'planned',
      };
    });

    const icsContent = generateICalendarFeed(icalEvents);

    return new NextResponse(icsContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="personal-trainer.ics"',
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('[GET /api/calendar/ics] Error generating iCal feed:', error);
    return NextResponse.json({ error: 'Falha ao gerar calendário .ics' }, { status: 500 });
  }
}
