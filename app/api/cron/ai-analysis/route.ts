import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const maxDuration = 300;

const aiPrisma = prisma as typeof prisma & { aiReport: any };

const DEFAULT_SYSTEM_PROMPT = `Você é um fisiologista esportivo de elite e cientista de dados. Sua análise deve ser fria, realista e estritamente baseada em termodinâmica e fisiologia do exercício. Zero condescendência ou motivação vazia. Vá direto aos números e fatos.

CONTEXTO: Indivíduo com foco em perda de gordura, mantendo massa magra, praticando treino híbrido (musculação + cardio) e monitorando métricas metabólicas diárias (peso, ingestão calórica, ingestão proteica, sono e estresse).

DIRETRIZES DE FORMATAÇÃO (Otimizado para WhatsApp):
- Seja ultra direto. Sem introduções polidas, saudações ou encerramentos longos.
- Use parágrafos curtos e objetivos.
- Use *negrito* exclusivamente para destacar números, métricas e metas.
- Use emojis APENAS como ícones estruturais para organizar os tópicos (ex: 📊, 🥩, ⚠️, 🎯).

ESTRUTURA OBRIGATÓRIA DA RESPOSTA:
📊 *Termodinâmica:* Avalie a reta de tendência real de peso vs. déficit acumulado (filtre o ruído de retenção de fluidos e glicogênio), primeiro focando no desempenho da semana e depois no desempenho acumulado.
🥩 *Composição:* Julgue o aporte proteico e o risco de catabolismo frente ao desgaste do treino apresentado.
⚠️ *Sinal Clínico:* Correlacione o estresse/sono com possíveis estagnações (retenção hídrica por cortisol).
🎯 *Plano de Ação:* Forneça exatamente 3 diretrizes táticas, milimétricas e de alta eficiência para corrigir a rota na próxima semana.`;

// Captura a variável de ambiente, ou usa o padrão se estiver vazia
const SYSTEM_PROMPT = process.env.AI_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT;

function splitReportParagraphs(reportText: string): string[] {
  return reportText
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET;

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Alterado para buscar a chave do OpenRouter
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing OPENROUTER_API_KEY' }, { status: 500 });
    }

    const logs = await prisma.dailyLog.findMany({
      orderBy: { date: 'desc' },
      take: 14,
    });

    const settings = await prisma.userSettings.findUnique({
      where: { id: 'singleton' },
    });

    const leanPayload = logs
      .slice()
      .reverse()
      .map((log: {
        date: string | Date;
        weight: number | null;
        caloriesConsumed: number | null;
        caloriesBurned: number | null;
        trainingType: string;
        sleepHours: number | null;
        waterIntake: number | null;
        stressLevel: number | null;
        mood: string | null;
        proteinConsumed: number | null;
        waistCircumference: number | null;
        createdAt: Date;
      }) => ({
        date: typeof log.date === 'string' ? log.date.slice(0, 10) : new Date(log.date).toISOString().slice(0, 10),
        weight: log.weight ?? null,
        caloriesConsumed: log.caloriesConsumed ?? null,
        caloriesBurned: log.caloriesBurned ?? null,
        trainingType: log.trainingType ?? null,
        sleepHours: log.sleepHours ?? null,
        waterIntake: log.waterIntake ?? null,
        stressLevel: log.stressLevel ?? null,
        mood: log.mood ?? null,
        proteinConsumed: log.proteinConsumed ?? null,
        waistCircumference: log.waistCircumference ?? null,
        createdAt: log.createdAt ? new Date(log.createdAt).toISOString() : null,
      }));

    const settingsPayload = settings
      ? {
        age: settings.age,
        height: settings.height,
        gender: settings.gender,
        activityLevel: settings.activityLevel,
        goal: settings.goal,
        weeklyRate: settings.weeklyRate,
        currentCalorieTarget: settings.currentCalorieTarget,
      }
      : null;

    const prompt = `Analise a seguinte janela metabólica das últimas 2 semanas. Envie todas as variáveis disponíveis do histórico e as variáveis de configuração/meta do usuário. Se algum dado estiver ausente, trate como lacuna e não invente valores.\n\nHistórico das últimas 2 semanas:\n${JSON.stringify(leanPayload, null, 2)}\n\nConfiguração e meta do usuário:\n${JSON.stringify(settingsPayload, null, 2)}`;

    // Requisição nativa via fetch utilizando a API compatível da OpenRouter
    const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Cabeçalhos opcionais de rastreio para os leaderboards do OpenRouter
        'HTTP-Referer': 'https://meu-rastreador-metabolico.vercel.app',
        'X-Title': 'Metabolic Tracker AI Cron'
      },
      body: JSON.stringify({
        model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
      })
    });

    if (!openRouterResponse.ok) {
      const errorData = await openRouterResponse.text();
      console.error('Erro na API do OpenRouter:', errorData);
      return NextResponse.json({ error: 'Failed to generate content from OpenRouter' }, { status: 502 });
    }

    const result = await openRouterResponse.json();

    // Log para diagnóstico — ajuda a depurar respostas inesperadas
    console.log('Resposta do OpenRouter (resumo):', JSON.stringify({
      id: result.id,
      model: result.model,
      hasChoices: Array.isArray(result.choices),
      choicesLength: result.choices?.length,
      finishReason: result.choices?.[0]?.finish_reason,
      contentLength: result.choices?.[0]?.message?.content?.length ?? 0,
      error: result.error ?? null,
    }));

    // OpenRouter pode retornar 200 com um campo de erro no corpo
    if (result.error) {
      console.warn('Erro embutido na resposta do OpenRouter (tentando fallback):', JSON.stringify(result.error));
    }

    let reportText = result.error ? null : result.choices?.[0]?.message?.content;

    // Se o modelo principal não retornou conteúdo (ou retornou erro), tenta um modelo de fallback
    if (!reportText) {
      console.warn('Modelo primário não retornou conteúdo. Tentando modelo de fallback...');

      const fallbackResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://meu-rastreador-metabolico.vercel.app',
          'X-Title': 'Metabolic Tracker AI Cron (Fallback)',
        },
        body: JSON.stringify({
          model: 'google/gemma-4-31b-it:free',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
        }),
      });

      if (!fallbackResponse.ok) {
        const fallbackError = await fallbackResponse.text();
        console.error('Erro no modelo de fallback do OpenRouter:', fallbackError);
        throw new Error('Ambos os modelos (primário e fallback) falharam ao gerar conteúdo.');
      }

      const fallbackResult = await fallbackResponse.json();
      console.log('Resposta do fallback (resumo):', JSON.stringify({
        id: fallbackResult.id,
        model: fallbackResult.model,
        hasChoices: Array.isArray(fallbackResult.choices),
        contentLength: fallbackResult.choices?.[0]?.message?.content?.length ?? 0,
        error: fallbackResult.error ?? null,
      }));

      if (fallbackResult.error) {
        throw new Error(`Fallback retornou erro: ${fallbackResult.error.message || JSON.stringify(fallbackResult.error)}`);
      }

      reportText = fallbackResult.choices?.[0]?.message?.content;
    }

    if (!reportText) {
      throw new Error(
        'Formato de resposta inesperado: nenhum modelo retornou conteúdo. ' +
        `Resposta primária: ${JSON.stringify(result).slice(0, 300)}`
      );
    }

    await aiPrisma.aiReport.create({
      data: {
        content: reportText,
        isRead: false,
      },
    });

    const whatsappNumber = process.env.WHATSAPP_NUMBER;
    const callMeBotKey = process.env.CALLMEBOT_API_KEY;

    if (whatsappNumber && callMeBotKey) {
      const whatsappParagraphs = splitReportParagraphs(reportText);

      for (const paragraph of whatsappParagraphs) {
        const whatsappUrl = `https://api.callmebot.com/whatsapp.php?phone=${whatsappNumber}&text=${encodeURIComponent(paragraph)}&apikey=${callMeBotKey}`;
        try {
          await fetch(whatsappUrl);
        } catch (notificationError) {
          console.error('Falha ao enviar notificação por WhatsApp.', notificationError);
        }
      }
    }

    return NextResponse.json({ success: true, reportText });
  } catch (error) {
    console.error('Falha na análise semanal de IA.', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}