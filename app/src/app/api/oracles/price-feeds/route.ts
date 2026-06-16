import { NextResponse } from 'next/server';
import { SUPPORTED_PRICE_FEEDS } from '@/lib/priceFeeds';

interface HermesParsedPrice {
  id: string;
  price?: {
    price: string;
    expo: number;
    publish_time?: number;
  };
}

function parsePythPrice(parsedPrice?: HermesParsedPrice['price']): number | null {
  if (!parsedPrice) return null;

  const price = Number(parsedPrice.price);
  if (!Number.isFinite(price)) return null;

  return price * Math.pow(10, parsedPrice.expo);
}

export async function GET() {
  const ids = SUPPORTED_PRICE_FEEDS.map((feed) => `ids[]=${feed.hermesFeedId}`).join('&');

  try {
    const response = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?${ids}`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Hermes returned ${response.status}`);
    }

    const json = (await response.json()) as { parsed?: HermesParsedPrice[] };
    const parsedById = new Map((json.parsed || []).map((price) => [price.id, price]));

    return NextResponse.json({
      success: true,
      data: SUPPORTED_PRICE_FEEDS.map((feed) => {
        const parsed = parsedById.get(feed.hermesFeedId);
        return {
          ...feed,
          currentPriceUsd: parsePythPrice(parsed?.price),
          publishTime: parsed?.price?.publish_time ?? null,
        };
      }),
    });
  } catch (error) {
    return NextResponse.json({
      success: true,
      data: SUPPORTED_PRICE_FEEDS.map((feed) => ({
        ...feed,
        currentPriceUsd: null,
        publishTime: null,
      })),
      warning: (error as Error).message,
    });
  }
}
