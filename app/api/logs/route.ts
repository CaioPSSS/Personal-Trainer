import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateInsights, recalculateAdaptiveTarget } from '@/lib/metabolicAlgo';

export async function GET() {
  const logs = await prisma.dailyLog.findMany({
    orderBy: { date: 'desc' },
    take: 30,
  });

  const settings = await prisma.userSettings.findMany();
  const insights = generateInsights(logs, settings);

  return NextResponse.json({ logs, insights });
}

export async function POST(request: Request) {
  const body = await request.json();
  const {
    date,
    weight,
    caloriesConsumed,
    caloriesBurned,
    trainingType,
    sleepHours,
    waterIntake,
    stressLevel,
    mood,
    proteinConsumed,
    waistCircumference,
  } = body;

  await prisma.dailyLog.upsert({
    where: { date },
    update: {
      weight: weight ? Number(weight) : null,
      caloriesConsumed: caloriesConsumed ? Number(caloriesConsumed) : null,
      caloriesBurned: caloriesBurned ? Number(caloriesBurned) : null,
      trainingType,
      sleepHours: sleepHours ? Number(sleepHours) : null,
      waterIntake: waterIntake ? Number(waterIntake) : null,
      stressLevel: stressLevel ? Number(stressLevel) : null,
      mood: mood || null,
      proteinConsumed: proteinConsumed ? Number(proteinConsumed) : null,
      waistCircumference: waistCircumference ? Number(waistCircumference) : null,
    },
    create: {
      date,
      weight: weight ? Number(weight) : null,
      caloriesConsumed: caloriesConsumed ? Number(caloriesConsumed) : null,
      caloriesBurned: caloriesBurned ? Number(caloriesBurned) : null,
      trainingType,
      sleepHours: sleepHours ? Number(sleepHours) : null,
      waterIntake: waterIntake ? Number(waterIntake) : null,
      stressLevel: stressLevel ? Number(stressLevel) : null,
      mood: mood || null,
      proteinConsumed: proteinConsumed ? Number(proteinConsumed) : null,
      waistCircumference: waistCircumference ? Number(waistCircumference) : null,
    },
  });

  const allLogsForCalculation = await prisma.dailyLog.findMany({
    orderBy: { date: 'desc' },
    take: 21,
  });

  const settings = await prisma.userSettings.findMany();

  if (allLogsForCalculation.length >= 14 && settings.length > 0) {
    const newTarget = recalculateAdaptiveTarget(allLogsForCalculation, settings);
    await prisma.userSettings.update({
      where: { id: 'singleton' },
      data: { currentCalorieTarget: newTarget },
    });
  }

  return NextResponse.json({ success: true });
}
                                                                                                                                                      