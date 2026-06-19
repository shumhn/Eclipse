import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SPORTS_RESOLUTION_RULE,
  createSportsMetadata,
  generateSportsMarketSuggestions,
  getSportsEventStatus,
} from '../src/lib/sports.ts';

const sampleEvent = {
  id: 'espn-760438',
  slug: 'espn-world-cup-760438',
  title: 'South Africa vs Czechia',
  competition: 'FIFA World Cup',
  category: 'world-cup',
  homeTeam: 'South Africa',
  awayTeam: 'Czechia',
  startTime: '2026-06-18T16:00:00.000Z',
  status: 'upcoming',
  source: 'espn',
};

test('sample World Cup event is a valid real fixture shape', () => {
  assert.equal(sampleEvent.category, 'world-cup');
  assert.equal(sampleEvent.competition, 'FIFA World Cup');
  assert.equal(sampleEvent.source, 'espn');
  assert.ok(sampleEvent.id.length > 0);
  assert.ok(sampleEvent.slug.length > 0);
  assert.ok(sampleEvent.homeTeam.length > 0);
  assert.ok(sampleEvent.awayTeam.length > 0);
  assert.ok(Number.isFinite(new Date(sampleEvent.startTime).getTime()));
});

test('Gemini suggestions are returned from the API without local fallback', async () => {
  const event = sampleEvent;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    JSON.stringify({
      success: true,
      data: {
        suggestions: [
          {
            question: `Will ${event.homeTeam} beat ${event.awayTeam}?`,
            marketType: 'match_winner',
            resolutionRule: 'Settles yes if the official final score shows the home team won.',
            confidence: 'high',
          },
        ],
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );

  try {
    const suggestions = await generateSportsMarketSuggestions(event);

    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].marketType, 'match_winner');
    assert.equal(suggestions[0].confidence, 'high');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Gemini suggestion failures are surfaced instead of falling back', async () => {
  const event = sampleEvent;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    JSON.stringify({
      success: false,
      error: 'GEMINI_API_KEY is required for sports market suggestions',
    }),
    { status: 500, headers: { 'Content-Type': 'application/json' } }
  );

  try {
    await assert.rejects(
      () => generateSportsMarketSuggestions(event),
      /GEMINI_API_KEY is required/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sports metadata preserves event and resolution details', () => {
  const event = sampleEvent;
  const metadata = createSportsMetadata(event, 'match_winner');

  assert.equal(metadata.category, 'world-cup');
  assert.equal(metadata.competition, event.competition);
  assert.equal(metadata.eventId, event.id);
  assert.equal(metadata.eventSlug, event.slug);
  assert.equal(metadata.homeTeam, event.homeTeam);
  assert.equal(metadata.awayTeam, event.awayTeam);
  assert.equal(metadata.startTime, event.startTime);
  assert.equal(metadata.marketType, 'match_winner');
  assert.equal(metadata.resolutionRule, DEFAULT_SPORTS_RESOLUTION_RULE);
  assert.equal(metadata.source, event.source);
});

test('sports event status handles future, live, ended, and invalid dates', () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const live = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const ended = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

  assert.equal(getSportsEventStatus(future), 'upcoming');
  assert.equal(getSportsEventStatus(live), 'live');
  assert.equal(getSportsEventStatus(ended), 'ended');
  assert.equal(getSportsEventStatus('not-a-date'), 'upcoming');
});
