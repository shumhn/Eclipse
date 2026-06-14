import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';

// Market generation prompt - shared across providers
const MARKET_GENERATION_PROMPT = `You are an expert at creating prediction market questions for a privacy-focused prediction market on Solana.

Given news headlines or topics, generate relevant YES/NO prediction market questions that:
1. Are clearly verifiable with a definitive outcome
2. Focus on privacy, regulation, zero-knowledge proofs, encryption, data protection, or surveillance
3. Have appropriate timeframes (30-365 days typically)
4. Are interesting enough to attract betting activity
5. Are NOT already obviously true or false

Categories to consider:
- regulation: Government policies, GDPR, privacy laws, sanctions
- technology: ZK protocols, encryption standards, privacy tools, Solana privacy features
- adoption: User growth, TVL milestones, enterprise adoption
- events: Breaches, scandals, conference announcements, court cases

Respond with valid JSON only, no markdown formatting:
{
  "question": "The yes/no question ending with ?",
  "category": "regulation|technology|adoption|events",
  "categoryName": "Human readable category name",
  "suggestedDurationDays": 30-365,
  "suggestedLiquidityUSDC": 1000-10000,
  "urgency": "breaking|timely|evergreen",
  "reasoning": "Brief explanation of why this is a good market"
}`;

export interface GeneratedMarket {
  question: string;
  category: 'regulation' | 'technology' | 'adoption' | 'events';
  categoryName: string;
  suggestedDurationDays: number;
  suggestedLiquidityUSDC: number;
  urgency: 'breaking' | 'timely' | 'evergreen';
  reasoning: string;
  sourceNews?: { title: string; source?: string; link?: string };
  sourceTopic?: string;
  generatedAt: number;
}

export interface NewsItem {
  title: string;
  summary?: string;
  source?: string;
  link?: string;
  relevanceScore?: number;
}

type AIProvider = 'gemini' | 'anthropic' | 'fallback';

/**
 * Multi-provider AI service for market generation
 * Supports: Google Gemini (Interactions API), Anthropic Claude, and rule-based fallback
 */
export class AIProviderService {
  private provider: AIProvider;
  private geminiClient?: GoogleGenAI;
  private anthropicClient?: Anthropic;

  constructor() {
    // Check available providers - Gemini first (free), then Anthropic, then fallback
    if (process.env.GOOGLE_API_KEY) {
      this.provider = 'gemini';
      this.geminiClient = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
      console.log('🤖 AI Provider: Google Gemini (Interactions API - gemini-3-flash-preview)');
    } else if (process.env.ANTHROPIC_API_KEY) {
      this.provider = 'anthropic';
      this.anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      console.log('🤖 AI Provider: Anthropic Claude');
    } else {
      this.provider = 'fallback';
      console.log('🤖 AI Provider: Rule-based fallback (no API key)');
    }
  }

  getProviderName(): string {
    return this.provider;
  }

  /**
   * Generate a market question from a news item
   */
  async generateFromNews(newsItem: NewsItem): Promise<GeneratedMarket> {
    const { title, summary, source, link } = newsItem;

    const userPrompt = `Generate a prediction market question based on this news:

Title: ${title}
${summary ? `Summary: ${summary}` : ''}
${source ? `Source: ${source}` : ''}

Create a compelling, verifiable YES/NO question that privacy-focused traders would want to bet on.`;

    const fullPrompt = `${MARKET_GENERATION_PROMPT}\n\n${userPrompt}`;

    let market: GeneratedMarket;

    switch (this.provider) {
      case 'gemini':
        market = await this.generateWithGemini(fullPrompt);
        break;
      case 'anthropic':
        market = await this.generateWithAnthropic(fullPrompt);
        break;
      default:
        market = this.generateWithFallback(newsItem);
    }

    return {
      ...market,
      sourceNews: { title, source, link },
      generatedAt: Date.now()
    };
  }

  /**
   * Generate a market from a topic
   */
  async generateFromTopic(topic: string, category?: string): Promise<GeneratedMarket> {
    const userPrompt = `Generate a prediction market question about: ${topic}
${category ? `Focus on the "${category}" category.` : ''}

Create a compelling, verifiable YES/NO question that privacy-focused traders would want to bet on.`;

    const fullPrompt = `${MARKET_GENERATION_PROMPT}\n\n${userPrompt}`;

    let market: GeneratedMarket;

    switch (this.provider) {
      case 'gemini':
        market = await this.generateWithGemini(fullPrompt);
        break;
      case 'anthropic':
        market = await this.generateWithAnthropic(fullPrompt);
        break;
      default:
        market = this.generateTopicFallback(topic, category);
    }

    return {
      ...market,
      sourceTopic: topic,
      generatedAt: Date.now()
    };
  }

  /**
   * Generate using Google Gemini Interactions API (new unified interface)
   * Uses gemini-3-flash-preview model
   */
  private async generateWithGemini(prompt: string): Promise<GeneratedMarket> {
    if (!this.geminiClient) {
      throw new Error('Gemini client not initialized');
    }

    try {
      // Use the new Interactions API with gemini-3-flash-preview
      const interaction = await this.geminiClient.interactions.create({
        model: 'gemini-3-flash-preview',
        input: prompt,
        generation_config: {
          temperature: 0.7,
          max_output_tokens: 500,
        }
      });

      // Get the text output from the interaction
      const textOutput = interaction.outputs.find((o: any) => o.type === 'text');
      if (!textOutput || !(textOutput as any).text) {
        throw new Error('No text output from Gemini');
      }

      const text = (textOutput as any).text;

      // Extract JSON from response (handle potential markdown wrapping)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to extract JSON from Gemini response');
      }

      console.log('✅ Gemini Interactions API succeeded');
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      const error = e as Error;
      console.log(`⚠️ Gemini Interactions API failed: ${error.message.slice(0, 100)}`);
      throw error;
    }
  }

  /**
   * Generate using Anthropic Claude
   */
  private async generateWithAnthropic(prompt: string): Promise<GeneratedMarket> {
    if (!this.anthropicClient) {
      throw new Error('Anthropic client not initialized');
    }

    const response = await this.anthropicClient.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    });

    const block = response.content[0];
    const content = block.type === 'text' ? block.text : '';

    return JSON.parse(content);
  }

  /**
   * Rule-based fallback for news items (no AI needed)
   */
  private generateWithFallback(newsItem: NewsItem): GeneratedMarket {
    const { title, summary } = newsItem;
    const text = `${title} ${summary || ''}`.toLowerCase();

    // Determine category from keywords
    let category: 'regulation' | 'technology' | 'adoption' | 'events' = 'technology';
    let urgency: 'breaking' | 'timely' | 'evergreen' = 'timely';

    if (text.includes('regulation') || text.includes('law') || text.includes('sec') || text.includes('ban')) {
      category = 'regulation';
    } else if (text.includes('breach') || text.includes('hack') || text.includes('arrest')) {
      category = 'events';
      urgency = 'breaking';
    } else if (text.includes('adoption') || text.includes('users') || text.includes('growth')) {
      category = 'adoption';
    }

    // Generate question based on headline
    const cleanTitle = title.replace(/['"]/g, '').slice(0, 60);
    const durationDays = urgency === 'breaking' ? 14 : category === 'regulation' ? 90 : 30;

    const categoryQuestions: Record<string, string> = {
      regulation: `Will regulatory action be taken regarding "${cleanTitle}" by ${this.formatFutureDate(durationDays)}?`,
      technology: `Will "${cleanTitle}" lead to significant protocol adoption within ${durationDays} days?`,
      adoption: `Will user metrics exceed expectations for "${cleanTitle}" by ${this.formatFutureDate(durationDays)}?`,
      events: `Will there be follow-up legal or regulatory action on "${cleanTitle}" within ${durationDays} days?`
    };

    return {
      question: categoryQuestions[category],
      category,
      categoryName: category.charAt(0).toUpperCase() + category.slice(1),
      suggestedDurationDays: durationDays,
      suggestedLiquidityUSDC: 5000,
      urgency,
      reasoning: `Auto-generated from news: ${title.slice(0, 50)}...`,
      generatedAt: Date.now()
    };
  }

  /**
   * Rule-based fallback for topics
   */
  private generateTopicFallback(topic: string, category?: string): GeneratedMarket {
    const cat = (category || 'technology') as 'regulation' | 'technology' | 'adoption' | 'events';
    const durationDays = cat === 'regulation' ? 90 : 60;

    // Make sure the topic is properly formatted as a question
    let question = topic;
    if (!topic.endsWith('?')) {
      question = `Will ${topic.toLowerCase()}?`;
    }

    return {
      question,
      category: cat,
      categoryName: cat.charAt(0).toUpperCase() + cat.slice(1),
      suggestedDurationDays: durationDays,
      suggestedLiquidityUSDC: 5000,
      urgency: 'timely',
      reasoning: `Generated from topic: ${topic.slice(0, 50)}`,
      generatedAt: Date.now()
    };
  }

  /**
   * Pre-defined demo markets for hackathon (no AI needed)
   */
  getDemoMarkets(): GeneratedMarket[] {
    return [
      {
        question: "Will the SEC approve a privacy-focused crypto ETF by end of 2025?",
        category: 'regulation',
        categoryName: 'Regulation',
        suggestedDurationDays: 180,
        suggestedLiquidityUSDC: 10000,
        urgency: 'timely',
        reasoning: "High-impact regulatory decision affecting privacy coins",
        generatedAt: Date.now()
      },
      {
        question: "Will Solana's confidential token standard (Token-2022) see 1M+ transfers by Q4 2025?",
        category: 'technology',
        categoryName: 'Technology',
        suggestedDurationDays: 120,
        suggestedLiquidityUSDC: 8000,
        urgency: 'timely',
        reasoning: "Key adoption metric for Solana's privacy features",
        generatedAt: Date.now()
      },
      {
        question: "Will Tornado Cash sanctions be fully lifted before 2026?",
        category: 'regulation',
        categoryName: 'Regulation',
        suggestedDurationDays: 365,
        suggestedLiquidityUSDC: 15000,
        urgency: 'evergreen',
        reasoning: "Major precedent for privacy protocol regulations",
        generatedAt: Date.now()
      },
      {
        question: "Will a major data breach affecting 100M+ users occur in 2025?",
        category: 'events',
        categoryName: 'Events',
        suggestedDurationDays: 365,
        suggestedLiquidityUSDC: 5000,
        urgency: 'evergreen',
        reasoning: "Privacy market indicator based on breach frequency",
        generatedAt: Date.now()
      },
      {
        question: "Will zero-knowledge proof TVL exceed $10B across all chains by mid-2025?",
        category: 'adoption',
        categoryName: 'Adoption',
        suggestedDurationDays: 150,
        suggestedLiquidityUSDC: 12000,
        urgency: 'timely',
        reasoning: "Key metric for ZK technology adoption",
        generatedAt: Date.now()
      }
    ];
  }

  /**
   * Generate diverse markets for demo
   * Falls back to pre-defined markets if AI fails
   */
  async generateDiverseMarkets(count = 5): Promise<Array<{ success: boolean; market?: GeneratedMarket; error?: string }>> {
    // If using fallback mode, just return demo markets immediately
    if (this.provider === 'fallback') {
      const demoMarkets = this.getDemoMarkets();
      return demoMarkets.slice(0, count).map(market => ({ success: true, market }));
    }

    const topics = [
      'Will US pass comprehensive crypto privacy regulations in 2025?',
      'Will Solana privacy features reach 1M+ active users by end of 2025?',
      'Will a major exchange implement zero-knowledge proofs for trading by Q4 2025?',
      'Will the EU ban privacy coins completely by 2026?',
      'Will Tornado Cash legal case be resolved favorably by end of 2025?',
      'Will enterprise adoption of confidential computing exceed 50% by 2026?',
      'Will a major data breach affect 100M+ users in 2025?',
      'Will decentralized identity solutions reach mainstream adoption by 2025?',
      'Will privacy-preserving AI regulations be passed globally by 2026?',
      'Will Token-2022 confidential transfers be used by major DeFi protocols?'
    ];

    const categories = ['regulation', 'technology', 'adoption', 'events'];
    const results = [];
    let aiFailures = 0;

    for (let i = 0; i < Math.min(count, topics.length); i++) {
      try {
        const market = await this.generateFromTopic(topics[i], categories[i % categories.length]);
        results.push({ success: true, market });
      } catch (error) {
        aiFailures++;
        results.push({ success: false, error: (error as Error).message });
      }
    }

    // If all AI calls failed, return demo markets instead
    if (aiFailures === count) {
      console.log('📦 AI failed, using pre-defined demo markets');
      const demoMarkets = this.getDemoMarkets();
      return demoMarkets.slice(0, count).map(market => ({ success: true, market }));
    }

    return results;
  }

  private formatFutureDate(daysFromNow: number): string {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
  }
}

// Lazy-initialized singleton (waits for dotenv.config() to run)
let _aiProvider: AIProviderService | null = null;

export const aiProvider = {
  get instance(): AIProviderService {
    if (!_aiProvider) {
      _aiProvider = new AIProviderService();
    }
    return _aiProvider;
  },

  getProviderName(): string {
    return this.instance.getProviderName();
  },

  generateFromNews(newsItem: NewsItem): Promise<GeneratedMarket> {
    return this.instance.generateFromNews(newsItem);
  },

  generateFromTopic(topic: string, category?: string): Promise<GeneratedMarket> {
    return this.instance.generateFromTopic(topic, category);
  },

  generateDiverseMarkets(count?: number) {
    return this.instance.generateDiverseMarkets(count);
  }
};
