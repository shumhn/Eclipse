import Parser from 'rss-parser';

// Privacy keywords with weights (from reference-repos/privacy-oracle)
export const PRIVACY_KEYWORDS: Record<string, number> = {
  // High relevance - direct privacy tech
  'zero-knowledge': 3,
  'zk-proof': 3,
  'zk-snark': 3,
  'zk-stark': 3,
  'zkrollup': 3,
  'confidential': 2.5,
  'encryption': 2.5,
  'encrypted': 2.5,
  'privacy-preserving': 3,
  'private transaction': 3,

  // Privacy protocols
  'tornado cash': 3,
  'zcash': 2.5,
  'monero': 2.5,
  'light protocol': 3,
  'elusiv': 3,
  'aztec': 2.5,
  'railgun': 2.5,
  'secret network': 2.5,

  // Regulatory
  'gdpr': 2,
  'privacy law': 2.5,
  'data protection': 2,
  'surveillance': 2.5,
  'sanctions': 2,
  'ofac': 2.5,
  'compliance': 1.5,
  'kyc': 1.5,
  'aml': 1.5,

  // General privacy
  'privacy': 1.5,
  'anonymous': 2,
  'anonymity': 2,
  'pseudonymous': 1.5,
  'private': 1,
  'mixer': 2,
  'mixing': 2,
  'shielded': 2.5,

  // Tech terms
  'homomorphic': 3,
  'mpc': 2.5,
  'secure enclave': 2,
  'tee': 2,
  'trusted execution': 2,

  // Events
  'data breach': 2.5,
  'leak': 1.5,
  'hack': 1.5,
  'compromised': 1.5,

  // Solana specific
  'solana privacy': 3,
  'spl confidential': 3,
  'token-2022 confidential': 3
};

// Category mappings
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  regulation: ['law', 'regulation', 'gdpr', 'sanctions', 'ofac', 'compliance', 'legislation', 'ban', 'restrict', 'sec', 'cftc'],
  technology: ['zk', 'protocol', 'launch', 'release', 'upgrade', 'mainnet', 'testnet', 'tvl', 'smart contract', 'proof'],
  adoption: ['users', 'growth', 'adoption', 'enterprise', 'mainstream', 'wallet', 'integration', 'partnership'],
  events: ['breach', 'hack', 'leak', 'scandal', 'arrest', 'raid', 'lawsuit', 'verdict', 'court']
};

// Urgency indicators
const URGENCY_KEYWORDS: Record<string, string[]> = {
  breaking: ['breaking', 'just in', 'urgent', 'alert', 'confirmed', 'arrested', 'breached'],
  timely: ['announces', 'launches', 'releases', 'proposes', 'reaches', 'exceeds', 'surpasses']
};

export interface NewsItem {
  id: string;
  title: string;
  summary?: string;
  source: string;
  link: string;
  publishedAt: string;
  relevanceScore: number;
  matchedKeywords: string[];
  suggestedCategory: string;
  urgency: 'breaking' | 'timely' | 'evergreen';
}

interface NewsSource {
  name: string;
  url: string;
  type: 'rss';
  keywords?: string[];
  weight: number;
}

export class NewsScrapingService {
  private parser: Parser;
  private sources: NewsSource[] = [
    {
      name: 'EFF',
      url: 'https://www.eff.org/rss/updates.xml',
      keywords: ['privacy', 'encryption', 'surveillance', 'data protection', 'FISA'],
      type: 'rss',
      weight: 1.0
    },
    {
      name: 'Decrypt',
      url: 'https://decrypt.co/feed',
      keywords: ['privacy', 'zk', 'zero-knowledge', 'tornado', 'zcash', 'monero', 'mixer'],
      type: 'rss',
      weight: 0.9
    },
    {
      name: 'CoinDesk',
      url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
      keywords: ['privacy', 'regulation', 'sanctions', 'compliance', 'OFAC'],
      type: 'rss',
      weight: 0.7
    },
    {
      name: 'CoinTelegraph',
      url: 'https://cointelegraph.com/rss',
      keywords: ['privacy', 'zk-proof', 'confidential', 'solana'],
      type: 'rss',
      weight: 0.8
    },
    {
      name: 'The Block',
      url: 'https://www.theblock.co/rss.xml',
      keywords: ['privacy', 'zk-rollup', 'confidential', 'anonymous'],
      type: 'rss',
      weight: 0.8
    }
  ];

  private seenIds = new Set<string>();
  private recentEvents: NewsItem[] = [];
  private maxEvents = 100;

  constructor() {
    this.parser = new Parser({
      timeout: 10000,
      headers: {
        'User-Agent': 'Eclipse-NewsBot/1.0'
      }
    });
  }

  /**
   * Score relevance based on privacy keywords
   */
  private scoreRelevance(text: string, sourceKeywords: string[] = [], sourceWeight = 1.0): {
    score: number;
    matchedKeywords: string[];
    suggestedCategory: string;
    urgency: 'breaking' | 'timely' | 'evergreen';
  } {
    const lowerText = text.toLowerCase();
    let score = 0;
    const matchedKeywords: string[] = [];

    // Score based on privacy keywords
    for (const [keyword, weight] of Object.entries(PRIVACY_KEYWORDS)) {
      if (lowerText.includes(keyword)) {
        score += weight * 10;
        matchedKeywords.push(keyword);
      }
    }

    // Additional score from source-specific keywords
    for (const keyword of sourceKeywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        score += 5;
        if (!matchedKeywords.includes(keyword)) {
          matchedKeywords.push(keyword);
        }
      }
    }

    // Apply source weight and cap at 100
    score = Math.min(Math.round(score * sourceWeight), 100);

    return {
      score,
      matchedKeywords,
      suggestedCategory: this.determineCategory(lowerText),
      urgency: this.determineUrgency(lowerText)
    };
  }

  private determineCategory(text: string): string {
    const scores: Record<string, number> = {
      regulation: 0,
      technology: 0,
      adoption: 0,
      events: 0
    };

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          scores[category] += 1;
        }
      }
    }

    let maxScore = 0;
    let bestCategory = 'technology';

    for (const [category, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        bestCategory = category;
      }
    }

    return bestCategory;
  }

  private determineUrgency(text: string): 'breaking' | 'timely' | 'evergreen' {
    for (const keyword of URGENCY_KEYWORDS.breaking) {
      if (text.includes(keyword)) return 'breaking';
    }
    for (const keyword of URGENCY_KEYWORDS.timely) {
      if (text.includes(keyword)) return 'timely';
    }
    return 'evergreen';
  }

  /**
   * Check if news item is recent (within last 24 hours)
   */
  private isRecentNews(publishedAt: string): boolean {
    const newsDate = new Date(publishedAt);
    const hoursAgo = 24;
    return Date.now() - newsDate.getTime() < hoursAgo * 60 * 60 * 1000;
  }

  /**
   * Scrape news from a single RSS source
   */
  private async scrapeRSSSource(source: NewsSource): Promise<NewsItem[]> {
    try {
      const feed = await this.parser.parseURL(source.url);
      const items: NewsItem[] = [];

      for (const item of feed.items.slice(0, 20)) {
        const id = item.guid || item.link || `${source.name}-${Date.now()}`;

        if (this.seenIds.has(id)) continue;

        const text = `${item.title || ''} ${item.contentSnippet || item.content || ''}`;
        const { score, matchedKeywords, suggestedCategory, urgency } = this.scoreRelevance(
          text,
          source.keywords,
          source.weight
        );

        // Only include items with relevance score >= 20
        if (score >= 20) {
          items.push({
            id,
            title: item.title || 'No title',
            summary: item.contentSnippet || item.content?.substring(0, 200),
            source: source.name,
            link: item.link || '',
            publishedAt: item.pubDate || new Date().toISOString(),
            relevanceScore: score,
            matchedKeywords,
            suggestedCategory,
            urgency
          });
        }

        this.seenIds.add(id);

        // Limit seen IDs to prevent memory growth
        if (this.seenIds.size > 10000) {
          const idsArray = Array.from(this.seenIds);
          this.seenIds = new Set(idsArray.slice(-5000));
        }
      }

      return items;
    } catch (error) {
      console.error(`Error scraping ${source.name}:`, (error as Error).message);
      return [];
    }
  }

  /**
   * Scrape news from all configured sources
   */
  async scrapeAllSources(): Promise<NewsItem[]> {
    const allNews: NewsItem[] = [];

    for (const source of this.sources) {
      const newsItems = await this.scrapeRSSSource(source);
      allNews.push(...newsItems);
    }

    // Update recent events cache
    for (const item of allNews) {
      this.recentEvents.unshift(item);
    }
    if (this.recentEvents.length > this.maxEvents) {
      this.recentEvents = this.recentEvents.slice(0, this.maxEvents);
    }

    // Sort by relevance score (highest first) and filter recent
    return allNews
      .filter(item => this.isRecentNews(item.publishedAt))
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 15);
  }

  /**
   * Get news specifically for market generation
   */
  async getMarketableNews(minScore = 30): Promise<NewsItem[]> {
    const news = await this.scrapeAllSources();
    return news.filter(item => item.relevanceScore >= minScore);
  }

  /**
   * Get recent cached events
   */
  getRecentEvents(limit = 10): NewsItem[] {
    return this.recentEvents.slice(0, limit);
  }

  /**
   * Get events by category
   */
  getEventsByCategory(category: string, limit = 10): NewsItem[] {
    return this.recentEvents
      .filter(e => e.suggestedCategory === category)
      .slice(0, limit);
  }

  /**
   * Get high urgency events
   */
  getHighUrgencyEvents(limit = 5): NewsItem[] {
    return this.recentEvents
      .filter(e => e.urgency === 'breaking' || e.urgency === 'timely')
      .slice(0, limit);
  }

  /**
   * Demo method: Get hardcoded privacy news for hackathon demo
   */
  getDemoNews(): NewsItem[] {
    return [
      {
        id: 'demo-1',
        title: "SEC Considers New Privacy Coin Regulations for 2025",
        summary: "The Securities and Exchange Commission is reviewing new framework for privacy-focused cryptocurrencies amid growing regulatory scrutiny.",
        source: "Demo News",
        link: "https://example.com/sec-privacy-regulations",
        publishedAt: new Date().toISOString(),
        relevanceScore: 85,
        matchedKeywords: ['privacy', 'regulation', 'sec'],
        suggestedCategory: 'regulation',
        urgency: 'timely'
      },
      {
        id: 'demo-2',
        title: "Zero-Knowledge Proof Technology Adoption Surges 300% in DeFi",
        summary: "Major DeFi protocols are rapidly implementing ZK-proof technology to enhance user privacy and transaction confidentiality.",
        source: "Demo News",
        link: "https://example.com/zk-defi-surge",
        publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        relevanceScore: 90,
        matchedKeywords: ['zero-knowledge', 'zk-proof', 'privacy', 'confidential'],
        suggestedCategory: 'technology',
        urgency: 'breaking'
      },
      {
        id: 'demo-3',
        title: "Solana Launches New Privacy Features for Enterprise Users",
        summary: "Solana Foundation announces confidential transactions and private smart contracts for enterprise adoption.",
        source: "Demo News",
        link: "https://example.com/solana-privacy-enterprise",
        publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        relevanceScore: 80,
        matchedKeywords: ['solana privacy', 'confidential', 'private'],
        suggestedCategory: 'technology',
        urgency: 'timely'
      },
      {
        id: 'demo-4',
        title: "Major Data Breach Affects 50M Users at Tech Giant",
        summary: "Security researchers confirm massive data leak exposing personal information of millions of users worldwide.",
        source: "Demo News",
        link: "https://example.com/data-breach-millions",
        publishedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        relevanceScore: 75,
        matchedKeywords: ['data breach', 'leak', 'privacy'],
        suggestedCategory: 'events',
        urgency: 'breaking'
      },
      {
        id: 'demo-5',
        title: "Tornado Cash Developer's Appeal Gains Support from EFF",
        summary: "Electronic Frontier Foundation files amicus brief supporting privacy rights in landmark crypto case.",
        source: "Demo News",
        link: "https://example.com/tornado-cash-eff",
        publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        relevanceScore: 95,
        matchedKeywords: ['tornado cash', 'privacy', 'sanctions'],
        suggestedCategory: 'regulation',
        urgency: 'breaking'
      }
    ];
  }

  /**
   * Get status of the news scraper
   */
  getStatus() {
    return {
      sourcesCount: this.sources.length,
      sources: this.sources.map(s => s.name),
      cachedEventsCount: this.recentEvents.length,
      seenIdsCount: this.seenIds.size
    };
  }
}

export const newsScrapingService = new NewsScrapingService();
