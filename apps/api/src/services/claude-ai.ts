import Anthropic from '@anthropic-ai/sdk';

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

export class ClaudeAIService {
  private client: Anthropic;
  private model = 'claude-sonnet-4-20250514';

  constructor(apiKey?: string) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error('ANTHROPIC_API_KEY is required for AI market generation');
    }
    this.client = new Anthropic({ apiKey: key });
  }

  /**
   * Generate a market question from news headline
   */
  async generateFromNews(newsItem: {
    title: string;
    summary?: string;
    source?: string;
    link?: string;
  }) {
    const { title, summary, source, link } = newsItem;

    const userPrompt = `Generate a prediction market question based on this news:

Title: ${title}
${summary ? `Summary: ${summary}` : ''}
${source ? `Source: ${source}` : ''}

Create a compelling, verifiable YES/NO question that privacy-focused traders would want to bet on.`;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 500,
        messages: [
          { role: 'user', content: MARKET_GENERATION_PROMPT + '\n\n' + userPrompt }
        ]
      });

      const block = response.content[0];
      const content = block.type === 'text' ? block.text : '';
      const market = JSON.parse(content);

      return {
        ...market,
        sourceNews: { title, source, link },
        generatedAt: Date.now()
      };
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Failed to parse AI response as JSON: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Generate a market from a topic/theme (not news-based)
   */
  async generateFromTopic(topic: string, category?: string) {
    const userPrompt = `Generate a prediction market question about: ${topic}
${category ? `Focus on the "${category}" category.` : ''}

Create a compelling, verifiable YES/NO question that privacy-focused traders would want to bet on.`;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 500,
        messages: [
          { role: 'user', content: MARKET_GENERATION_PROMPT + '\n\n' + userPrompt }
        ]
      });

      const block = response.content[0];
      const content = block.type === 'text' ? block.text : '';
      const market = JSON.parse(content);

      return {
        ...market,
        sourceTopic: topic,
        generatedAt: Date.now()
      };
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Failed to parse AI response as JSON: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Generate multiple diverse markets for the hackathon demo
   */
  async generateDiverseMarkets(count = 5) {
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

    const results = [];

    for (let i = 0; i < Math.min(count, topics.length); i++) {
      try {
        const market = await this.generateFromTopic(topics[i]);
        results.push({ success: true, market });
      } catch (error) {
        results.push({ success: false, error: (error as Error).message, topic: topics[i] });
      }
    }

    return results;
  }
}

// Create instance only if API key is available
export const claudeAI = process.env.ANTHROPIC_API_KEY
  ? new ClaudeAIService()
  : null;