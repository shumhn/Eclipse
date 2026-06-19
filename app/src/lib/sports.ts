export type SportsCategory = 'world-cup';
export type SportsEventStatus = 'upcoming' | 'live' | 'ended';
export type SportsMarketType =
  | 'match_winner'
  | 'over_under'
  | 'both_teams_score'
  | 'qualify'
  | 'custom';

export interface SportsEvent {
  id: string;
  slug: string;
  title: string;
  competition: string;
  category: SportsCategory;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  status: SportsEventStatus;
  source: 'espn' | 'polymarket';
  sourceUrl?: string;
}

export interface SportsMarketMetadata {
  category: SportsCategory;
  competition: string;
  eventId: string;
  eventSlug: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  marketType: SportsMarketType;
  resolutionRule: string;
  source: 'espn' | 'polymarket' | 'manual';
}

export interface SportsMarketSuggestion {
  question: string;
  marketType: SportsMarketType;
  resolutionRule: string;
  confidence: 'high' | 'medium';
}

export const DEFAULT_SPORTS_RESOLUTION_RULE =
  'Resolve from the official match result shown by the admin source. Admin confirms the final YES/NO outcome.';

export function createSportsMetadata(
  event: SportsEvent,
  marketType: SportsMarketType,
  resolutionRule = DEFAULT_SPORTS_RESOLUTION_RULE
): SportsMarketMetadata {
  return {
    category: event.category,
    competition: event.competition,
    eventId: event.id,
    eventSlug: event.slug,
    homeTeam: event.homeTeam,
    awayTeam: event.awayTeam,
    startTime: event.startTime,
    marketType,
    resolutionRule,
    source: event.source,
  };
}

export function getSportsEventStatus(startTime: string): SportsEventStatus {
  const start = new Date(startTime).getTime();
  const now = Date.now();
  if (!Number.isFinite(start)) return 'upcoming';
  if (now < start) return 'upcoming';
  if (now < start + 2 * 60 * 60 * 1000) return 'live';
  return 'ended';
}

export async function fetchWorldCupEvents(): Promise<SportsEvent[]> {
  const res = await fetch('/api/sports/events?category=world-cup', {
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Failed to fetch World Cup events');
  }
  return json.data || [];
}

export async function generateSportsMarketSuggestions(
  event: SportsEvent
): Promise<SportsMarketSuggestion[]> {
  const res = await fetch('/api/ai/sports-markets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Failed to generate Gemini suggestions');
  }
  const suggestions = json.data?.suggestions || [];
  if (suggestions.length === 0) {
    throw new Error('Gemini returned no market suggestions');
  }
  return suggestions;
}
