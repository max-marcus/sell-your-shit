import { z } from 'zod';

/**
 * Shared domain types and validation schemas used by the server, the web UI,
 * and the marketplace publishers. Keeping these in one package means the API
 * contract is defined exactly once.
 */

// ---------------------------------------------------------------------------
// Platforms
// ---------------------------------------------------------------------------

export const PLATFORMS = ['craigslist', 'offerup', 'facebook'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  craigslist: 'Craigslist',
  offerup: 'OfferUp',
  facebook: 'Facebook Marketplace',
};

// ---------------------------------------------------------------------------
// Item condition
// ---------------------------------------------------------------------------

export const CONDITIONS = ['new', 'like_new', 'good', 'fair', 'salvage'] as const;
export type Condition = (typeof CONDITIONS)[number];

export const CONDITION_LABELS: Record<Condition, string> = {
  new: 'New',
  like_new: 'Like new',
  good: 'Good',
  fair: 'Fair',
  salvage: 'For parts / not working',
};

// ---------------------------------------------------------------------------
// Statuses
// ---------------------------------------------------------------------------

/** Lifecycle of an item in the local inventory. */
export const ITEM_STATUSES = ['draft', 'publishing', 'listed', 'partial', 'sold'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** State of a single marketplace listing for an item. */
export const LISTING_STATUSES = ['pending', 'live', 'failed'] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

// ---------------------------------------------------------------------------
// Categories + per-platform mapping
// ---------------------------------------------------------------------------

export interface CategoryDef {
  key: string;
  label: string;
  /** Visible text Craigslist shows in its "for sale by owner" category picker. */
  craigslist: string;
  /** Category label used by Facebook Marketplace. */
  facebook: string;
  /** Category label used by OfferUp. */
  offerup: string;
}

export const CATEGORIES: CategoryDef[] = [
  { key: 'furniture', label: 'Furniture', craigslist: 'furniture - by owner', facebook: 'Furniture', offerup: 'Furniture' },
  { key: 'electronics', label: 'Electronics', craigslist: 'electronics - by owner', facebook: 'Electronics', offerup: 'Electronics & Media' },
  { key: 'appliances', label: 'Appliances', craigslist: 'appliances - by owner', facebook: 'Appliances', offerup: 'Home & Garden' },
  { key: 'household', label: 'Household items', craigslist: 'household items - by owner', facebook: 'Household', offerup: 'Home & Garden' },
  { key: 'clothing', label: 'Clothing & accessories', craigslist: 'clothing & accessories - by owner', facebook: 'Apparel', offerup: 'Clothing, Shoes & Accessories' },
  { key: 'toys', label: 'Toys & games', craigslist: 'toys & games - by owner', facebook: 'Toys & Games', offerup: 'Toys, Games & Hobbies' },
  { key: 'tools', label: 'Tools', craigslist: 'tools - by owner', facebook: 'Tools', offerup: 'Tools & Machinery' },
  { key: 'sporting', label: 'Sporting goods', craigslist: 'sporting goods - by owner', facebook: 'Sporting Goods', offerup: 'Sports & Outdoors' },
  { key: 'bikes', label: 'Bicycles', craigslist: 'bicycles - by owner', facebook: 'Bicycles', offerup: 'Bicycles' },
  { key: 'baby', label: 'Baby & kids', craigslist: 'baby & kid stuff - by owner', facebook: 'Baby Products', offerup: 'Baby & Kids' },
  { key: 'garden', label: 'Farm & garden', craigslist: 'farm & garden - by owner', facebook: 'Garden', offerup: 'Home & Garden' },
  { key: 'auto_parts', label: 'Auto parts', craigslist: 'auto parts - by owner', facebook: 'Auto Parts & Accessories', offerup: 'Auto Parts & Accessories' },
  { key: 'music', label: 'Musical instruments', craigslist: 'musical instruments - by owner', facebook: 'Musical Instruments', offerup: 'Musical Instruments' },
  { key: 'books', label: 'Books & media', craigslist: 'books & magazines - by owner', facebook: 'Books, Films & Music', offerup: 'Electronics & Media' },
  { key: 'general', label: 'General / other', craigslist: 'general for sale - by owner', facebook: 'Miscellaneous', offerup: 'General' },
];

const CATEGORY_BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));

/** Always returns a category, falling back to "general" for unknown keys. */
export function getCategory(key: string): CategoryDef {
  return CATEGORY_BY_KEY.get(key) ?? CATEGORIES[CATEGORIES.length - 1]!;
}

/** Every category key, typed for `z.enum`. */
export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key) as [string, ...string[]];

// ---------------------------------------------------------------------------
// Records (DB-backed + API-serialized shapes)
// ---------------------------------------------------------------------------

export interface Photo {
  id: string;
  itemId: string;
  filename: string;
  sortOrder: number;
  /** Server-populated URL the web UI can load directly. */
  url: string;
}

export interface Listing {
  id: string;
  itemId: string;
  platform: Platform;
  url: string | null;
  externalId: string | null;
  status: ListingStatus;
  publishedAt: string | null;
  lastError: string | null;
}

export interface Item {
  id: string;
  title: string;
  description: string;
  priceCents: number;
  condition: Condition;
  category: string;
  status: ItemStatus;
  createdAt: string;
  updatedAt: string;
  photos: Photo[];
  listings: Listing[];
}

// ---------------------------------------------------------------------------
// Validation schemas (request bodies / config files)
// ---------------------------------------------------------------------------

export const itemInputSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(120),
  description: z.string().max(8000).default(''),
  priceCents: z.number().int().min(0).max(100_000_00),
  condition: z.enum(CONDITIONS),
  category: z.enum(CATEGORY_KEYS),
});
export type ItemInput = z.infer<typeof itemInputSchema>;

export const itemUpdateSchema = itemInputSchema.partial();
export type ItemUpdate = z.infer<typeof itemUpdateSchema>;

/** Current item editor values, sent with each `listing` assist message. */
export const listingAssistContextSchema = z.object({
  title: z.string().max(200),
  description: z.string().max(8000),
  priceCents: z.number().int().min(0).nullable(),
  condition: z.enum(CONDITIONS),
  category: z.enum(CATEGORY_KEYS),
});
export type ListingAssistContext = z.infer<typeof listingAssistContextSchema>;

/**
 * Item editor values that the `listing` assist profile suggests. Every field is
 * nullable, not optional, because strict Structured Outputs need every field.
 */
export const listingAssistSuggestionsSchema = z.object({
  title: z
    .string()
    .nullable()
    .describe('Listing title, 120 characters or fewer. Null if not enough information.'),
  description: z
    .string()
    .nullable()
    .describe('Full listing description based on a listing template. Null if not enough information.'),
  priceCents: z
    .number()
    .int()
    .nullable()
    .describe('Suggested asking price in US cents, for example 4500 for $45. Null if unsure.'),
  condition: z.enum(CONDITIONS).nullable().describe('Item condition. Null if unknown.'),
  category: z.enum(CATEGORY_KEYS).nullable().describe('Category key. Null if unsure.'),
});
export type ListingAssistSuggestions = z.infer<typeof listingAssistSuggestionsSchema>;

export const publishRequestSchema = z.object({
  platforms: z.array(z.enum(PLATFORMS)).min(1, 'Select at least one platform'),
});
export type PublishRequest = z.infer<typeof publishRequestSchema>;

export const photoOrderSchema = z.object({
  orderedIds: z.array(z.string()).min(1),
});

export const setListingUrlSchema = z.object({
  url: z.string().url(),
});
export type SetListingUrl = z.infer<typeof setListingUrlSchema>;

export const scrapeRetailSchema = z.object({
  url: z.string().url(),
});
export type ScrapeRetailRequest = z.infer<typeof scrapeRetailSchema>;

export interface RetailScrapeResult {
  url: string;
  title: string | null;
  retailPriceCents: number | null;
  /** One-line blurb for the listing. */
  concise: string | null;
  /** Longer product summary from the retail page. */
  summary: string | null;
  imageUrls: string[];
  siteName: string | null;
}

// ---------------------------------------------------------------------------
// Config + secrets
// ---------------------------------------------------------------------------

export const locationSchema = z.object({
  city: z.string().default(''),
  state: z.string().default(''),
  zip: z.string().default(''),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});
export type AppLocation = z.infer<typeof locationSchema>;

export const listingDefaultsSchema = z.object({
  /** Inserted into every generated listing description. */
  pickupLine: z.string().default('Local pickup only'),
  /**
   * When scraping a retail link, suggest asking price as this fraction of
   * retail (e.g. 0.5 = half). Set to 0 to leave asking price blank.
   */
  askingPriceFraction: z.number().min(0).max(1).default(0.5),
});
export type ListingDefaults = z.infer<typeof listingDefaultsSchema>;

export const appConfigSchema = z.object({
  location: locationSchema.default({ city: '', state: '', zip: '' }),
  listing: listingDefaultsSchema.default({
    pickupLine: 'Local pickup only',
    askingPriceFraction: 0.5,
  }),
  publish: z
    .object({
      headless: z.boolean().default(false),
      slowMoMs: z.number().int().min(0).default(50),
      timeoutMs: z.number().int().min(1000).default(120_000),
    })
    .default({ headless: false, slowMoMs: 50, timeoutMs: 120_000 }),
  maxPhotos: z.number().int().min(1).max(48).default(12),
});
export type AppConfig = z.infer<typeof appConfigSchema>;

export const craigslistSecretsSchema = z.object({
  email: z.string(),
  password: z.string(),
  /** Craigslist region slug, e.g. "sfbay", "newyork", "seattle". */
  area: z.string(),
  /** Optional sub-area code (e.g. "sfc" for SF proper) when a region has them. */
  subarea: z.string().optional(),
  postalCode: z.string().optional(),
  /** Fallback Craigslist category text when an item's mapped category is missing. */
  defaultCategory: z.string().optional(),
});
export type CraigslistSecrets = z.infer<typeof craigslistSecretsSchema>;

export const offerupSecretsSchema = z.object({
  email: z.string(),
  password: z.string(),
});
export type OfferUpSecrets = z.infer<typeof offerupSecretsSchema>;

export const facebookSecretsSchema = z.object({
  email: z.string(),
  password: z.string(),
});
export type FacebookSecrets = z.infer<typeof facebookSecretsSchema>;

export const secretsSchema = z.object({
  craigslist: craigslistSecretsSchema.optional(),
  offerup: offerupSecretsSchema.optional(),
  facebook: facebookSecretsSchema.optional(),
});
export type Secrets = z.infer<typeof secretsSchema>;

// ---------------------------------------------------------------------------
// Publish jobs (shared between server job manager and the web UI)
// ---------------------------------------------------------------------------

export type JobStatus = 'queued' | 'running' | 'done';
export type JobPlatformStatus =
  | 'pending'
  | 'running'
  | 'awaiting_user'
  | 'live'
  | 'failed'
  | 'skipped';

export interface JobPlatformState {
  platform: Platform;
  status: JobPlatformStatus;
  url: string | null;
  externalId: string | null;
  error: string | null;
  /** True when the mock publisher was used (no real credentials configured). */
  usedMock: boolean;
}

export interface JobLogEntry {
  ts: string;
  platform: Platform | null;
  message: string;
}

export interface JobState {
  id: string;
  itemId: string;
  status: JobStatus;
  platforms: JobPlatformState[];
  logs: JobLogEntry[];
  createdAt: string;
  finishedAt: string | null;
}

export interface SettingsResponse {
  location: AppLocation;
  listing: ListingDefaults;
  publish: AppConfig['publish'];
  maxPhotos: number;
  /** Which platforms have credentials configured in secrets.json. */
  configured: Record<Platform, boolean>;
  /** When true, all publishing is simulated regardless of credentials. */
  mockMode: boolean;
  /** True when `OPENROUTER_API_KEY` is set, so AI assist chats work. */
  aiAssistConfigured: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

export interface ListingDescriptionParts {
  askingPriceCents?: number | null;
  retailPriceCents?: number | null;
  concise?: string | null;
  summary?: string | null;
  retailUrl?: string | null;
  pickupLine?: string;
}

/**
 * Builds the standard listing description:
 *   $XX OBO
 *   Retail: $YY
 *   <concise>
 *   Local pickup only
 *   <summary>
 *   <retail url>
 */
export function buildListingDescription(parts: ListingDescriptionParts): string {
  const pickup = (parts.pickupLine ?? 'Local pickup only').trim();
  const lines: string[] = [];

  if (parts.askingPriceCents != null && parts.askingPriceCents > 0) {
    lines.push(`${formatPrice(parts.askingPriceCents)} OBO`);
  } else {
    lines.push('$__ OBO');
  }

  if (parts.retailPriceCents != null && parts.retailPriceCents > 0) {
    lines.push(`Retail: ${formatPrice(parts.retailPriceCents)}`);
  } else {
    lines.push('Retail: $__');
  }

  lines.push((parts.concise ?? '').trim() || '…');
  lines.push(pickup);

  const summary = (parts.summary ?? '').trim();
  if (summary) {
    lines.push('');
    lines.push(summary);
  }

  const retailUrl = (parts.retailUrl ?? '').trim();
  if (retailUrl) {
    lines.push('');
    lines.push(retailUrl);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Listing templates (manual entry skeletons)
// ---------------------------------------------------------------------------

export {
  LISTING_TEMPLATE_IDS,
  LISTING_TEMPLATES,
  buildFromListingTemplate,
  getListingTemplate,
  type BuildListingTemplateOpts,
  type ListingTemplate,
  type ListingTemplateId,
} from './listing-templates';

// ---------------------------------------------------------------------------
// AI assist chat (generic contract)
// ---------------------------------------------------------------------------

export {
  assistRequestSchema,
  chatMessageSchema,
  type AssistRequest,
  type AssistResponse,
  type AssistStatusResponse,
  type ChatMessage,
} from './assist';
