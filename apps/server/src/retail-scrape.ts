import { chromium, type Page } from 'playwright';
import type { RetailScrapeResult } from '@sell/core';

/**
 * Visits a retail product URL (Amazon, etc.) and extracts listing-friendly
 * fields. Prefers JSON-LD Product schema, then Open Graph / meta tags, then
 * common DOM selectors.
 *
 * Extraction runs as stringified scripts inside the page so tsx/esbuild
 * helpers (e.g. __name) are never serialized into the browser context.
 */
export async function scrapeRetailProduct(url: string): Promise<RetailScrapeResult> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'en-US',
      viewport: { width: 1366, height: 900 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(45_000);

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => undefined);

    const extracted = (await page.evaluate(EXTRACT_SCRIPT)) as PageExtract;
    const amazon = await extractAmazonFallbacks(page);

    const title = cleanText(extracted.title || amazon.title);
    const retailPriceCents =
      parseMoneyToCents(extracted.price) ?? parseMoneyToCents(amazon.price);
    const concise =
      cleanText(extracted.concise || amazon.concise || title)?.slice(0, 240) ?? null;
    const summary =
      cleanText(extracted.summary || amazon.summary)?.slice(0, 2500) ?? null;
    const imageUrls = uniqueUrls([...(extracted.imageUrls ?? []), ...(amazon.imageUrls ?? [])]).slice(
      0,
      8,
    );

    return {
      url: page.url(),
      title,
      retailPriceCents,
      concise,
      summary,
      imageUrls,
      siteName: cleanText(extracted.siteName),
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

function cleanText(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : null;
}

function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

/** Parses "$19.99", "19.99", "1,299.00" etc. into cents. */
export function parseMoneyToCents(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const match = raw.replace(/,/g, '').match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) return null;
  const dollars = Number(match[1]);
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  return Math.round(dollars * 100);
}

interface PageExtract {
  title: string | null;
  price: string | null;
  concise: string | null;
  summary: string | null;
  imageUrls: string[];
  siteName: string | null;
}

const EXTRACT_SCRIPT = `(() => {
  const meta = (prop) => {
    const el =
      document.querySelector('meta[property="' + prop + '"]') ||
      document.querySelector('meta[name="' + prop + '"]');
    return el && el.getAttribute('content') ? el.getAttribute('content').trim() : null;
  };

  const asString = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  const isProductLike = (n) => {
    const t = n['@type'];
    if (typeof t === 'string') return /product/i.test(t);
    if (Array.isArray(t)) return t.some((x) => typeof x === 'string' && /product/i.test(x));
    return false;
  };

  const asImageList = (v) => {
    if (typeof v === 'string') return [v];
    if (Array.isArray(v)) {
      return v
        .map((x) => (typeof x === 'string' ? x : x && typeof x === 'object' ? asString(x.url) : null))
        .filter(Boolean);
    }
    if (v && typeof v === 'object') {
      const u = asString(v.url);
      return u ? [u] : [];
    }
    return [];
  };

  const priceFromOffers = (offers) => {
    if (!offers) return null;
    const list = Array.isArray(offers) ? offers : [offers];
    for (const offer of list) {
      if (!offer || typeof offer !== 'object') continue;
      if (typeof offer.price === 'number' || typeof offer.price === 'string') return String(offer.price);
      if (offer.lowPrice != null) return String(offer.lowPrice);
    }
    return null;
  };

  const products = [];
  for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      const data = JSON.parse(script.textContent || '');
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        if (node['@graph'] && Array.isArray(node['@graph'])) {
          for (const g of node['@graph']) {
            if (isProductLike(g)) products.push(g);
          }
        } else if (isProductLike(node)) {
          products.push(node);
        }
      }
    } catch (e) {}
  }

  const product = products[0];
  let title = null;
  let price = null;
  let summary = null;
  let concise = null;
  const imageUrls = [];

  if (product) {
    title = asString(product.name);
    summary = asString(product.description);
    concise = title;
    price = priceFromOffers(product.offers);
    for (const img of asImageList(product.image)) imageUrls.push(img);
  }

  title = title || meta('og:title') || meta('twitter:title') || document.title || null;
  concise = concise || meta('og:description') || meta('description') || null;
  summary = summary || concise;
  price = price || meta('product:price:amount') || meta('og:price:amount') || null;

  const ogImage = meta('og:image');
  if (ogImage) imageUrls.push(ogImage);

  return {
    title,
    price,
    concise,
    summary,
    imageUrls,
    siteName: meta('og:site_name'),
  };
})()`;

const AMAZON_SCRIPT = `(() => {
  const text = (sel) => {
    const el = document.querySelector(sel);
    return el && el.textContent ? el.textContent.trim() : null;
  };
  const attr = (sel, name) => {
    const el = document.querySelector(sel);
    const v = el && el.getAttribute(name);
    return v ? v.trim() : null;
  };

  const title =
    text('#productTitle') || text('#title') || text('h1.a-size-large') || null;

  const price =
    text('#corePrice_feature_div .a-offscreen') ||
    text('#corePriceDisplay_desktop_feature_div .a-offscreen') ||
    text('.a-price .a-offscreen') ||
    text('#priceblock_ourprice') ||
    text('#priceblock_dealprice') ||
    attr('input[name="items[0.base][customerVisiblePrice][amount]"]', 'value') ||
    null;

  const featureBullets = Array.from(
    document.querySelectorAll('#feature-bullets li span.a-list-item'),
  )
    .map((el) => (el.textContent || '').replace(/\\s+/g, ' ').trim())
    .filter((t) => t && t.length > 3 && !/about this item/i.test(t));

  const about = text('#productDescription p') || text('#productDescription');
  const concise = featureBullets[0] || (about ? about.slice(0, 200) : null);
  const summary = featureBullets.length
    ? featureBullets.map((b) => '• ' + b).join('\\n')
    : about;

  const imageUrls = [
    attr('#landingImage', 'src'),
    attr('#imgTagWrapperId img', 'src'),
    attr('#landingImage', 'data-old-hires'),
  ].filter(Boolean);

  return { title, price, concise, summary: summary || null, imageUrls };
})()`;

async function extractAmazonFallbacks(page: Page): Promise<{
  title: string | null;
  price: string | null;
  concise: string | null;
  summary: string | null;
  imageUrls: string[];
}> {
  const host = new URL(page.url()).hostname;
  if (!/amazon\.|amzn\./i.test(host)) {
    return { title: null, price: null, concise: null, summary: null, imageUrls: [] };
  }
  return (await page.evaluate(AMAZON_SCRIPT)) as {
    title: string | null;
    price: string | null;
    concise: string | null;
    summary: string | null;
    imageUrls: string[];
  };
}
