import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateInitialTarget } from '@/lib/metabolicAlgo';
import { getLocalISODate } from '@/lib/dateUtils';

export async function GET() {
  const settings = await prisma.userSettings.findUnique({ where: { id: 'singleton' } });
  return NextResponse.json(settings);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { age, height, weight, gender, activityLevel, goal, weeklyRate } = body;

  const initialTarget = calculateInitialTarget({
    age: Number(age),
    height: Number(height),
    weight: Number(weight),
    gender,
    activityLevel: Number(activityLevel),
    goal,
    weeklyRate: Number(weeklyRate),
  });

  const settings = await prisma.userSettings.upsert({
    where: { id: 'singleton' },
    update: {
      age: Number(age),
      height: Number(height),
      gender,
      activityLevel: Number(activityLevel),
      goal,
      weeklyRate: Number(weeklyRate),
      currentCalorieTarget: initialTarget,
    },
    create: {
      id: 'singleton',
      age: Number(age),
      height: Number(height),
      gender,
      activityLevel: Number(activityLevel),
      goal,
      weeklyRate: Number(weeklyRate),
      currentCalorieTarget: initialTarget,
    },
  });

  const todayStr = getLocalISODate();
  await prisma.dailyLog.upsert({
    where: { date: todayStr },
    update: { weight: Number(weight) },
    create: { date: todayStr, weight: Number(weight), trainingType: 'Descanso' },
  });

  return NextResponse.json(settings);
}
                                                                              