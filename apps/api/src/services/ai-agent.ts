import cron from 'node-cron';
import { PublicKey } from '@solana/web3.js';
import { coreService } from './magicblock-indexer';
// Privacy is now handled by MagicBlock TEE — no separate encryption service needed.
import { aiProvider, GeneratedMarket, NewsItem as AINewsItem } from './ai-provider';
import { newsScrapingService, NewsItem } from './news-scraper';

interface MarketOpportunity {
  question: string;
  reasoning: string;
  endTime: Date;
  confidence: number;
  category: 'regulation' | 'technology' | 'adoption' | 'events';
  urgency: 'breaking' | 'timely' | 'evergreen';
  suggestedLiquidityUSDC: number;
  sourceNews?: { title: string; source?: string; link?: string };
}

export class AIAgentService {
  private isRunning = false;
  private lastScanTime: number | null = null;
  private marketsCreated: string[] = [];
  private scanHistory: Array<{ timestamp: number; marketsFound: number; marketsCreated: number }> = [];

  constructor() {
    this.startScheduledScanning();
  }

  /**
   * Scrape crypto news using the enhanced news scraper
   */
  async scrapeNews(): Promise<NewsItem[]> {
    try {
      // Use real news scraping if available, demo news otherwise
      const useDemo = process.env.USE_DEMO_NEWS === 'true' || process.env.NODE_ENV === 'development';

      if (useDemo) {
        console.log('📰 Using demo news for hackathon');
        return newsScrapingService.getDemoNews();
      } else {
        console.log('📰 Scraping real news from RSS feeds...');
        return await newsScrapingService.getMarketableNews(30);
      }
    } catch (error) {
      console.error('Error in news scraping, falling back to demo news:', (error as Error).message);
      return newsScrapingService.getDemoNews();
    }
  }

  /**
   * Analyze news and identify market opportunities using AI
   */
  async identifyMarketOpportunities(news: NewsItem[]): Promise<MarketOpportunity[]> {
    const opportunities: MarketOpportunity[] = [];

    console.log(`🤖 AI Provider: ${aiProvider.getProviderName()}`);
    console.log(`📊 Analyzing ${news.length} news items...`);

    try {
      // Process top news items through AI
      for (const newsItem of news.slice(0, 3)) {
        if (newsItem.relevanceScore > 30) {
          try {
            const market = await aiProvider.generateFromNews({
              title: newsItem.title,
              summary: newsItem.summary,
              source: newsItem.source,
              link: newsItem.link
            });

            opportunities.push({
              question: market.question,
              reasoning: market.reasoning || `Generated from: ${newsItem.title}`,
              endTime: new Date(Date.now() + (market.suggestedDurationDays * 24 * 60 * 60 * 1000)),
              confidence: this.calculateConfidenceFromScore(newsItem.relevanceScore),
              category: market.category,
              urgency: market.urgency,
              suggestedLiquidityUSDC: market.suggestedLiquidityUSDC,
              sourceNews: market.sourceNews
            });

            console.log(`✅ Generated market: "${market.question.slice(0, 50)}..."`);
          } catch (error) {
            console.error(`Error generating market from news: ${(error as Error).message}`);
          }
        }
      }

      // If no news-based opportunities, generate diverse markets
      if (opportunities.length === 0) {
        console.log('📦 No news-based markets, generating diverse markets...');
        const diverseMarkets = await aiProvider.generateDiverseMarkets(3);

        for (const result of diverseMarkets) {
          if (result.success && result.market) {
            opportunities.push({
              question: result.market.question,
              reasoning: result.market.reasoning || 'AI-generated market',
              endTime: new Date(Date.now() + (result.market.suggestedDurationDays * 24 * 60 * 60 * 1000)),
              confidence: 0.7,
              category: result.market.category,
              urgency: result.market.urgency,
              suggestedLiquidityUSDC: result.market.suggestedLiquidityUSDC
            });
          }
        }
      }
    } catch (error) {
      console.error('Error in AI market generation:', (error as Error).message);

      // Fallback to pre-defined demo markets
      console.log('📦 Using fallback demo markets');
      const demoMarkets = [
        {
          question: 'Will the SEC approve a privacy-focused crypto ETF by end of 2025?',
          reasoning: 'High-impact regulatory decision for hackathon demo',
          category: 'regulation' as const,
          urgency: 'timely' as const,
          suggestedLiquidityUSDC: 10000
        },
        {
          question: 'Will Solana confidential transfers see 1M+ transactions by Q4 2025?',
          reasoning: 'Key adoption metric for Solana privacy features',
          category: 'technology' as const,
          urgency: 'timely' as const,
          suggestedLiquidityUSDC: 8000
        },
        {
          question: 'Will zero-knowledge proof TVL exceed $10B by mid-2025?',
          reasoning: 'Major ZK adoption milestone',
          category: 'adoption' as const,
          urgency: 'timely' as const,
          suggestedLiquidityUSDC: 12000
        }
      ];

      for (const demo of demoMarkets) {
        opportunities.push({
          question: demo.question,
          reasoning: demo.reasoning,
          endTime: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000),
          confidence: 0.75,
          category: demo.category,
          urgency: demo.urgency,
          suggestedLiquidityUSDC: demo.suggestedLiquidityUSDC
        });
      }
    }

    return opportunities;
  }

  /**
   * Create privacy-enhanced prediction market
   */
  async createPrivacyMarket(opportunity: MarketOpportunity): Promise<string | null> {
    try {
      const result = await coreService.createPrivacyMarket({
        question: opportunity.question,
        initialLiquidity: BigInt(1_000_000), // 1 token
        endTime: Math.floor(opportunity.endTime.getTime() / 1000)
      });

      const marketAddress = result.marketAddress;

      console.log(`🎯 Created market: ${opportunity.question.slice(0, 50)}...`);
      console.log(`📍 Market address: ${marketAddress}`);

      this.marketsCreated.push(marketAddress);

      return marketAddress;
    } catch (error) {
      console.error('Error creating market:', error);
      return null;
    }
  }

  /**
   * Execute automated trading based on strategy
   */
  async executeAutoTrade(marketAddress: string, news: NewsItem[]) {
    try {
      const strategy = await this.analyzeMarketStrategy(marketAddress, news);

      if (strategy.shouldTrade) {
        // Execute trade — MagicBlock TEE handles privacy automatically
        await coreService.executeTrade({
          market: marketAddress,
          side: strategy.side,
          amount: strategy.amount
        });

        console.log(`🔐 Executed private trade on ${marketAddress} via MagicBlock TEE`);
      }
    } catch (error) {
      console.error('Error executing auto trade:', error);
    }
  }

  /**
   * Manual scan trigger for API endpoint
   */
  async forceScan(): Promise<{
    success: boolean;
    newsFound: number;
    opportunitiesFound: number;
    marketsCreated: string[];
  }> {
    if (this.isRunning) {
      return {
        success: false,
        newsFound: 0,
        opportunitiesFound: 0,
        marketsCreated: []
      };
    }

    this.isRunning = true;
    console.log('🔍 AI Agent: Starting manual scan...');

    try {
      const news = await this.scrapeNews();
      const opportunities = await this.identifyMarketOpportunities(news);
      const createdMarkets: string[] = [];

      console.log(`📰 Found ${news.length} news items`);
      console.log(`💡 Found ${opportunities.length} market opportunities`);

      for (const opportunity of opportunities.slice(0, 2)) {
        const marketAddress = await this.createPrivacyMarket(opportunity);
        if (marketAddress) {
          createdMarkets.push(marketAddress);
        }
        await new Promise(resolve => setTimeout(resolve, 2000)); // Rate limit
      }

      this.lastScanTime = Date.now();
      this.scanHistory.push({
        timestamp: Date.now(),
        marketsFound: opportunities.length,
        marketsCreated: createdMarkets.length
      });

      return {
        success: true,
        newsFound: news.length,
        opportunitiesFound: opportunities.length,
        marketsCreated: createdMarkets
      };
    } catch (error) {
      console.error('Error in force scan:', error);
      return {
        success: false,
        newsFound: 0,
        opportunitiesFound: 0,
        marketsCreated: []
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Start scheduled news scanning and market creation
   */
  private startScheduledScanning() {
    // Scan news every 2 hours
    cron.schedule('0 */2 * * *', async () => {
      if (this.isRunning) return;

      this.isRunning = true;
      console.log('🤖 AI Agent: Starting scheduled news scan...');

      try {
        const news = await this.scrapeNews();
        const opportunities = await this.identifyMarketOpportunities(news);

        console.log(`Found ${opportunities.length} market opportunities`);

        for (const opportunity of opportunities.slice(0, 2)) { // Limit to 2 markets per scan
          await this.createPrivacyMarket(opportunity);
          await new Promise(resolve => setTimeout(resolve, 5000)); // Rate limit
        }

        this.lastScanTime = Date.now();
      } catch (error) {
        console.error('Error in scheduled scan:', error);
      } finally {
        this.isRunning = false;
      }
    });

    console.log('⏰ AI Agent: Scheduled scanning enabled (every 2 hours)');
  }

  /**
   * Get agent status for monitoring
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      aiProvider: aiProvider.getProviderName(),
      lastScanTime: this.lastScanTime,
      marketsCreated: this.marketsCreated.length,
      recentMarkets: this.marketsCreated.slice(-5),
      scanHistory: this.scanHistory.slice(-10),
      newsScraperStatus: newsScrapingService.getStatus()
    };
  }

  /**
   * Get recent news events
   */
  getRecentNews(limit = 10) {
    return newsScrapingService.getRecentEvents(limit);
  }

  // Helper methods
  private calculateConfidenceFromScore(relevanceScore: number): number {
    // Convert relevance score (0-100) to confidence (0-1)
    return Math.min(Math.max(relevanceScore / 100, 0.3), 0.9);
  }

  private async analyzeMarketStrategy(marketAddress: string, news: NewsItem[]) {
    // Simple strategy based on news relevance
    const recentNews = news.filter(n => this.isRecentNews(n.publishedAt));
    const avgRelevance = recentNews.length > 0
      ? recentNews.reduce((acc, n) => acc + n.relevanceScore, 0) / recentNews.length
      : 50;

    return {
      shouldTrade: avgRelevance > 50,
      side: avgRelevance > 60 ? 'yes' : 'no' as 'yes' | 'no',
      amount: BigInt(500_000) // 0.5 tokens
    };
  }

  private isRecentNews(publishedAt: string): boolean {
    const newsDate = new Date(publishedAt);
    const hoursAgo = 24;
    return Date.now() - newsDate.getTime() < hoursAgo * 60 * 60 * 1000;
  }
}

export const aiAgent = new AIAgentService();
