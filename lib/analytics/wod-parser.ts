import { normalizeTextKey } from '@/lib/ai/exercise-swap';

export interface ParsedWodResult {
  title: string;
  durationMinutes: number;
  suggestedRpe: number;
  muscleGroups: string[];
  metabolicNotes: string;
}

const MOVEMENT_RULES: Array<{
  keywords: string[];
  muscles: string[];
  rpeBump: number;
}> = [
  {
    keywords: [
      'thruster',
      'wall ball',
      'squat',
      'agachamento',
      'lunge',
      'passada',
      'afundo',
      'pistol',
      'box jump',
      'front squat',
      'overhead squat',
      'assault bike',
      'echo bike',
    ],
    muscles: ['Pernas', 'Core'],
    rpeBump: 1,
  },
  {
    keywords: [
      'deadlift',
      'terra',
      'clean',
      'snatch',
      'arranco',
      'arremesso',
      'kettlebell swing',
      'kb swing',
      'row',
      'remo',
    ],
    muscles: ['Pernas', 'Costas', 'Core'],
    rpeBump: 1,
  },
  {
    keywords: [
      'pull-up',
      'pull up',
      'pullup',
      'barra',
      'chest to bar',
      'c2b',
      'muscle-up',
      'muscle up',
      'BMU',
      'RMU',
      'rope climb',
      'corda',
      'toes to bar',
      't2b',
    ],
    muscles: ['Costas', 'Braços', 'Core'],
    rpeBump: 0.5,
  },
  {
    keywords: [
      'push-up',
      'push up',
      'flexao',
      'dip',
      'paralela',
      'bench press',
      'supino',
      'burpee',
    ],
    muscles: ['Peito', 'Ombros', 'Braços'],
    rpeBump: 0.5,
  },
  {
    keywords: [
      'hspu',
      'handstand',
      'push press',
      'push jerk',
      'split jerk',
      'shoulder to overhead',
      's2oh',
      'devil press',
      'snatch',
    ],
    muscles: ['Ombros', 'Braços', 'Core'],
    rpeBump: 0.5,
  },
  {
    keywords: ['sit-up', 'ghd', 'plank', 'prancha', 'v-up', 'hollow', 'abmat'],
    muscles: ['Core'],
    rpeBump: 0,
  },
];

export function parseCrossFitWodDeterministic(rawWodText: string): ParsedWodResult {
  const cleanText = rawWodText.trim();
  const norm = normalizeTextKey(cleanText);

  const detectedMuscles = new Set<string>();
  let rpeScore = 7;

  // Named benchmark WOD detection
  if (norm.includes('murph')) {
    return {
      title: 'Hero WOD Murph',
      durationMinutes: 50,
      suggestedRpe: 9.5,
      muscleGroups: ['Pernas', 'Costas', 'Peito', 'Core'],
      metabolicNotes: 'Altíssimo volume de corrida (3.2km total), 100 pull-ups, 200 push-ups e 300 air squats.',
    };
  }
  if (norm.includes('fran')) {
    return {
      title: 'Benchmark WOD Fran (21-15-9)',
      durationMinutes: 12,
      suggestedRpe: 9,
      muscleGroups: ['Pernas', 'Costas', 'Ombros', 'Core'],
      metabolicNotes: 'Sprint glicolítico intenso combinando Thrusters e Pull-ups.',
    };
  }

  for (const rule of MOVEMENT_RULES) {
    if (rule.keywords.some((kw) => norm.includes(normalizeTextKey(kw)))) {
      rule.muscles.forEach((m) => detectedMuscles.add(m));
      rpeScore += rule.rpeBump;
    }
  }

  if (detectedMuscles.size === 0) {
    detectedMuscles.add('Pernas');
    detectedMuscles.add('Core');
  }

  // Extract duration from "AMRAP 15", "EMOM 20", "Time cap 18", etc.
  let durationMinutes = 45;
  const durationMatch = cleanText.match(/(?:amrap|emom|time\s*cap|cap|for\s*time|por)\s*(\d{1,2})\s*(?:min|m\b)?/i);
  if (durationMatch?.[1]) {
    const parsedMin = parseInt(durationMatch[1], 10);
    if (parsedMin >= 5 && parsedMin <= 90) {
      // Include class warm-up/skill + WOD window or exact WOD window
      durationMinutes = parsedMin < 25 ? parsedMin + 25 : parsedMin;
    }
  }

  const firstLine = cleanText.split('\n')[0]?.trim().slice(0, 50) || 'WOD CrossFit';
  const suggestedRpe = Math.min(10, Math.max(6, Math.round(rpeScore)));
  const muscleGroups = Array.from(detectedMuscles);

  return {
    title: firstLine,
    durationMinutes,
    suggestedRpe,
    muscleGroups,
    metabolicNotes: `WOD analisado (${muscleGroups.join(', ')}): ${cleanText.slice(0, 180)}`,
  };
}

export interface ICalEventInput {
  uid: string;
  date: string; // YYYY-MM-DD
  summary: string;
  description: string;
  status: 'planned' | 'completed' | 'skipped';
}

function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function nextISODateForAllDayEnd(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1, 12, 0, 0));
  return dt.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Generates an RFC 5545 compliant iCalendar (.ics) feed with All-Day events.
 */
export function generateICalendarFeed(events: ICalEventInput[]): string {
  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Personal Trainer AI//Multi-Sport Calendar//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Personal Trainer — Treinos',
    'X-WR-TIMEZONE:America/Sao_Paulo',
  ];

  for (const ev of events) {
    if (ev.status === 'skipped') continue;
    const startCompact = ev.date.replace(/-/g, '');
    const endCompact = nextISODateForAllDayEnd(ev.date);
    const statusPrefix = ev.status === 'completed' ? '✅ ' : '';

    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.uid}@personal-trainer.app`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART;VALUE=DATE:${startCompact}`,
      `DTEND;VALUE=DATE:${endCompact}`,
      `SUMMARY:${escapeICalText(`${statusPrefix}${ev.summary}`)}`,
      `DESCRIPTION:${escapeICalText(ev.description)}`,
      `STATUS:${ev.status === 'completed' ? 'CONFIRMED' : 'TENTATIVE'}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
