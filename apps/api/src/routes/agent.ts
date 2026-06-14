import { Router } from 'express';
import { aiAgent } from '../services/ai-agent';
import { newsScrapingService } from '../services/news-scraper';

const router = Router();

// Get AI agent status
router.get('/status', async (req, res) => {
  try {
    const status = aiAgent.getStatus();

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Get recent news events
router.get('/news', async (req, res) => {
  try {
    const limit = Number.parseInt(req.query.limit as string) || 10;
    const news = aiAgent.getRecentNews(limit);

    res.json({
      success: true,
      data: {
        count: news.length,
        news
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Force news scrape (without creating markets)
router.post('/scrape', async (req, res) => {
  try {
    const news = await aiAgent.scrapeNews();

    res.json({
      success: true,
      data: {
        count: news.length,
        news: news.slice(0, 10)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Force full scan (analyze news + identify opportunities)
router.post('/scan', async (req, res) => {
  try {
    const news = await aiAgent.scrapeNews();
    const opportunities = await aiAgent.identifyMarketOpportunities(news);

    res.json({
      success: true,
      data: {
        newsItems: news.length,
        opportunities: opportunities.length,
        preview: opportunities.slice(0, 5).map(opp => ({
          question: opp.question,
          category: opp.category,
          urgency: opp.urgency,
          confidence: opp.confidence,
          reasoning: opp.reasoning.slice(0, 100)
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Force full scan AND create markets
router.post('/execute', async (req, res) => {
  try {
    const result = await aiAgent.forceScan();

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Get news scraper status
router.get('/scraper/status', async (req, res) => {
  try {
    const status = newsScrapingService.getStatus();

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Get demo news (for testing)
router.get('/demo-news', async (req, res) => {
  try {
    const news = newsScrapingService.getDemoNews();

    res.json({
      success: true,
      data: {
        count: news.length,
        news
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Get high urgency news
router.get('/news/urgent', async (req, res) => {
  try {
    const limit = Number.parseInt(req.query.limit as string) || 5;
    const news = newsScrapingService.getHighUrgencyEvents(limit);

    res.json({
      success: true,
      data: {
        count: news.length,
        news
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Get news by category
router.get('/news/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const limit = Number.parseInt(req.query.limit as string) || 10;
    const news = newsScrapingService.getEventsByCategory(category, limit);

    res.json({
      success: true,
      data: {
        category,
        count: news.length,
        news
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

export default router;
