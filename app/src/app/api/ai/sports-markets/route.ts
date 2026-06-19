import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SportsMarketSuggestion } from '@/lib/sports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const eventSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  competition: z.string(),
  category: z.literal('world-cup'),
  homeTeam: z.string(),
  awayTeam: z.string(),
  startTime: z.string(),
  status: z.enum(['upcoming', 'live', 'ended']),
  source: z.enum(['espn', 'polymarket']),
  sourceUrl: z.string().optional(),
});

const requestSchema = z.object({
  event: eventSchema,
});

function cleanSuggestions(value: unknown): SportsMarketSuggestion[] {
  const raw = Array.isArray(value) ? value : [];

  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const suggestion = item as Partial<SportsMarketSuggestion>;
      if (!suggestion.question || !suggestion.marketType || !suggestion.resolutionRule) {
        return null;
      }

      return {
        question: String(suggestion.question).slice(0, 180),
        marketType: suggestion.marketType,
        resolutionRule: String(suggestion.resolutionRule).slice(0, 240),
        confidence: suggestion.confidence === 'high' ? 'high' : 'medium',
      };
    })
    .filter((item): item is SportsMarketSuggestion => Boolean(item))
    .slice(0, 5);
}

function extractGeminiText(json: any): string {
  return json?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || '')
    .join('')
    .trim() || '';
}

export async function POST(req: Request) {
  let event: z.infer<typeof eventSchema> | null = null;

  try {
    const body = requestSchema.parse(await req.json());
    event = body.event;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'GEMINI_API_KEY is required for sports market suggestions' },
        { status: 500 }
      );
    }

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const prompt = [
      'Generate premium private prediction market questions for a sports admin.',
      'Return strict JSON only with this shape:',
      '{"suggestions":[{"question":"...","marketType":"match_winner|over_under|both_teams_score|qualify|custom","resolutionRule":"...","confidence":"high|medium"}]}',
      'Rules:',
      '- Questions must be yes/no only.',
      '- Use only the two teams in the selected match.',
      '- Do not create player-vs-player, goals H2H, player props, or Messi/Ronaldo-style questions.',
      '- Questions must be clear enough for admin-confirmed settlement.',
      '- Avoid obscure edge cases.',
      '- Prefer clean Polymarket-style wording.',
      '- Include one match winner, one goals market, and one creative but resolvable market when sensible.',
      '',
      `Competition: ${event.competition}`,
      `Match: ${event.homeTeam} vs ${event.awayTeam}`,
      `Start time: ${event.startTime}`,
    ].join('\n');

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.35,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini returned ${response.status}`);
    }

    const json = await response.json();
    const text = extractGeminiText(json);
    const geminiJson = JSON.parse(text);
    const suggestions = cleanSuggestions(geminiJson.suggestions);

    if (suggestions.length === 0) {
      throw new Error('Gemini returned no usable market suggestions');
    }

    return NextResponse.json({
      success: true,
      data: {
        suggestions,
        source: 'gemini',
        model,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: event ? 502 : 400 }
    );
  }
}
