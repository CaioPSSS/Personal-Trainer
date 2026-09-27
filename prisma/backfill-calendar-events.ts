import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function backfillCalendarEvents(): Promise<{
  totalWorkouts: number;
  existingEvents: number;
  migratedCount: number;
}> {
  console.log('--- Início da Migração: WorkoutExecution -> CalendarEvent ---');

  // 1. Obter referências já migradas para garantir idempotência estrita
  const existingEvents = await prisma.calendarEvent.findMany({
    where: {
      referenceModel: 'WorkoutExecution',
      referenceId: { not: null },
    },
    select: { referenceId: true },
  });

  const existingRefIds = new Set(
    existingEvents
      .map((e) => e.referenceId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  );

  console.log(`Eventos de musculação já presentes no calendário: ${existingRefIds.size}`);

  // 2. Buscar todas as execuções de treino existentes
  const workouts = await prisma.workoutExecution.findMany({
    include: {
      mesocyclePlan: {
        select: { title: true },
      },
      exerciseExecutions: {
        take: 1,
        orderBy: { sortOrder: 'asc' },
        include: {
          exercisePrescription: {
            include: {
              workoutDayTemplate: {
                select: { label: true },
              },
            },
          },
        },
      },
    },
    orderBy: { date: 'asc' },
  });

  const unmigratedWorkouts = workouts.filter((w) => !existingRefIds.has(w.id));
  console.log(`Total de treinos encontrados: ${workouts.length}`);
  console.log(`Treinos a serem migrados: ${unmigratedWorkouts.length}`);

  if (unmigratedWorkouts.length === 0) {
    console.log('Nenhum registro pendente de migração. O calendário já está sincronizado.');
    return {
      totalWorkouts: workouts.length,
      existingEvents: existingRefIds.size,
      migratedCount: 0,
    };
  }

  // 3. Preparar payloads de inserção
  const eventsToCreate = unmigratedWorkouts.map((workout) => {
    const templateLabel =
      workout.exerciseExecutions[0]?.exercisePrescription?.workoutDayTemplate?.label;
    const planTitle = workout.mesocyclePlan?.title;
    const title = templateLabel || planTitle || 'Treino de Força';

    return {
      athleteProfileId: workout.athleteProfileId || 'singleton',
      date: workout.date,
      eventType: 'strength',
      referenceId: workout.id,
      referenceModel: 'WorkoutExecution',
      title,
      status: workout.status || 'completed',
      sortOrder: 0,
      originalDate: workout.date,
      createdAt: workout.createdAt,
      updatedAt: workout.updatedAt,
    };
  });

  // 4. Executar inserção em lote com granularidade controlada
  const batchSize = 50;
  let createdCount = 0;

  for (let i = 0; i < eventsToCreate.length; i += batchSize) {
    const batch = eventsToCreate.slice(i, i + batchSize);
    await prisma.calendarEvent.createMany({
      data: batch,
    });
    createdCount += batch.length;
    console.log(`Migrados ${createdCount}/${eventsToCreate.length} eventos...`);
  }

  console.log(`--- Migração concluída com sucesso: ${createdCount} CalendarEvents criados ---`);
  return {
    totalWorkouts: workouts.length,
    existingEvents: existingRefIds.size,
    migratedCount: createdCount,
  };
}

backfillCalendarEvents()
  .catch((err: unknown) => {
    console.error('Erro durante migração de CalendarEvents:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
