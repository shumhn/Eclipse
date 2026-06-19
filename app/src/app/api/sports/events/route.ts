import { NextResponse } from 'next/server';
import {
  getSportsEventStatus,
  type SportsCategory,
  type SportsEvent,
} from '@/lib/sports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PolymarketEvent = {
  id?: string | number;
  slug?: string;
  title?: string;
  name?: string;
  ticker?: string;
  startDate?: string;
  endDate?: string;
  image?: string;
  icon?: string;
  tags?: Array<{ slug?: string; label?: string; name?: string } | string>;
};

type EspnEvent = {
  id?: string;
  uid?: string;
  name?: string;
  shortName?: string;
  date?: string;
  status?: {
    type?: {
      state?: 'pre' | 'in' | 'post';
      completed?: boolean;
    };
  };
  competitions?: Array<{
    competitors?: Array<{
      homeAway?: 'home' | 'away';
      team?: {
        displayName?: string;
        shortDisplayName?: string;
        abbreviation?: string;
      };
    }>;
  }>;
};

const PLAYER_PROP_TERMS = [
  'h2h',
  'goals h2h',
  'goal contributions',
  'player',
  'top scorer',
  'golden boot',
  'assists',
  'shots',
  'cards',
];

function cleanFixtureTitle(title: string): string {
  return title
    .replace(/^fifa\s+world\s+cup\s*:\s*/i, '')
    .replace(/^world\s+cup\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTeamNames(title: string): { homeTeam: string; awayTeam: string } | null {
  const cleaned = cleanFixtureTitle(title);
  const separators = [' vs. ', ' vs ', ' v. ', ' v ', ' - '];

  for (const separator of separators) {
    const [homeTeam, awayTeam] = cleaned.split(separator).map((part) => part?.trim());
    if (homeTeam && awayTeam && isLikelyTeamName(homeTeam) && isLikelyTeamName(awayTeam)) {
      return { homeTeam, awayTeam };
    }
  }

  return null;
}

function isLikelyTeamName(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    value.length >= 3 &&
    value.length <= 40 &&
    !normalized.includes(':') &&
    !PLAYER_PROP_TERMS.some((term) => normalized.includes(term))
  );
}

function toDateKey(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('');
}

function normalizeEspnEvent(event: EspnEvent): SportsEvent | null {
  const competitors = event.competitions?.[0]?.competitors || [];
  const home = competitors.find((competitor) => competitor.homeAway === 'home') || competitors[0];
  const away = competitors.find((competitor) => competitor.homeAway === 'away') || competitors[1];
  const homeTeam = home?.team?.displayName || home?.team?.shortDisplayName;
  const awayTeam = away?.team?.displayName || away?.team?.shortDisplayName;
  const startTime = event.date;

  if (!event.id || !homeTeam || !awayTeam || !startTime) return null;

  const status = getSportsEventStatus(startTime);
  const espnState = event.status?.type?.state;
  if (status === 'ended' || espnState === 'post' || event.status?.type?.completed) return null;

  const slug = `espn-world-cup-${event.id}`;

  return {
    id: `espn-${event.id}`,
    slug,
    title: `${awayTeam} vs ${homeTeam}`,
    competition: 'FIFA World Cup',
    category: 'world-cup',
    homeTeam: awayTeam,
    awayTeam: homeTeam,
    startTime,
    status: espnState === 'in' ? 'live' : status,
    source: 'espn',
    sourceUrl: `https://www.espn.com/soccer/match/_/gameId/${event.id}`,
  };
}

function isWorldCupLike(event: PolymarketEvent): boolean {
  const haystack = [
    event.title,
    event.name,
    event.slug,
    event.ticker,
    ...(event.tags || []).map((tag) =>
      typeof tag === 'string' ? tag : `${tag.slug || ''} ${tag.label || ''} ${tag.name || ''}`
    ),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes('world cup') || haystack.includes('fifa') || haystack.includes('soccer');
}

function isPlayerProp(event: PolymarketEvent): boolean {
  const haystack = [event.title, event.name, event.slug, event.ticker]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return PLAYER_PROP_TERMS.some((term) => haystack.includes(term));
}

function normalizePolymarketEvent(event: PolymarketEvent): SportsEvent | null {
  const title = event.title || event.name || event.ticker || '';
  if (isPlayerProp(event)) return null;

  const teams = getTeamNames(title);
  if (!title || !teams) return null;

  const startTime = event.startDate || event.endDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const status = getSportsEventStatus(startTime);
  if (status === 'ended') return null;

  const slug = event.slug || String(event.id || title).toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return {
    id: String(event.id || slug),
    slug,
    title: `${teams.homeTeam} vs ${teams.awayTeam}`,
    competition: 'FIFA World Cup',
    category: 'world-cup',
    homeTeam: teams.homeTeam,
    awayTeam: teams.awayTeam,
    startTime,
    status,
    source: 'polymarket',
    sourceUrl: `https://polymarket.com/event/${slug}`,
  };
}

async function fetchPolymarketWorldCupEvents(): Promise<SportsEvent[]> {
  const baseUrl = process.env.POLYMARKET_GAMMA_URL || 'https://gamma-api.polymarket.com';
  const urls = [
    `${baseUrl}/events?limit=80&tag_slug=world-cup`,
    `${baseUrl}/events?limit=80&tag_slug=soccer`,
    `${baseUrl}/events?limit=80&tag_slug=sports`,
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) continue;

      const json = await response.json();
      const rawEvents: PolymarketEvent[] = Array.isArray(json) ? json : json.events || json.data || [];
      const events = rawEvents
        .filter(isWorldCupLike)
        .map(normalizePolymarketEvent)
        .filter((event): event is SportsEvent => Boolean(event))
        .slice(0, 16);

      if (events.length > 0) return events;
    } catch {
      continue;
    }
  }

  return [];
}

async function fetchEspnWorldCupEvents(): Promise<SportsEvent[]> {
  const baseUrl =
    process.env.ESPN_WORLD_CUP_SCOREBOARD_URL ||
    'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
  const today = new Date();
  const dates = Array.from({ length: 10 }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() + index);
    return toDateKey(date);
  });
  const seen = new Set<string>();
  const events: SportsEvent[] = [];

  for (const date of dates) {
    try {
      const response = await fetch(`${baseUrl}?dates=${date}&limit=50`, { cache: 'no-store' });
      if (!response.ok) continue;

      const json = await response.json();
      const rawEvents: EspnEvent[] = Array.isArray(json.events) ? json.events : [];
      for (const rawEvent of rawEvents) {
        const event = normalizeEspnEvent(rawEvent);
        if (!event || seen.has(event.id)) continue;
        seen.add(event.id);
        events.push(event);
      }
    } catch {
      continue;
    }
  }

  return events
    .sort((left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime())
    .slice(0, 20);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const category = (url.searchParams.get('category') || 'world-cup') as SportsCategory;

  if (category !== 'world-cup') {
    return NextResponse.json(
      { success: false, error: 'Unsupported sports category' },
      { status: 400 }
    );
  }

  const espnEvents = await fetchEspnWorldCupEvents();
  const polymarketEvents = espnEvents.length > 0 ? [] : await fetchPolymarketWorldCupEvents();
  const events = espnEvents.length > 0 ? espnEvents : polymarketEvents;

  return NextResponse.json({
    success: true,
    data: events,
    source: espnEvents.length > 0 ? 'espn' : polymarketEvents.length > 0 ? 'polymarket' : 'none',
  });
}
