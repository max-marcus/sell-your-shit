import { randomUUID } from 'node:crypto';
import type {
  Condition,
  Item,
  ItemInput,
  ItemStatus,
  ItemUpdate,
  Listing,
  ListingStatus,
  Photo,
  Platform,
} from '@sell/core';
import { db } from './db';

interface ItemRow {
  id: string;
  title: string;
  description: string;
  price_cents: number;
  condition: string;
  category: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface PhotoRow {
  id: string;
  item_id: string;
  filename: string;
  sort_order: number;
}

interface ListingRow {
  id: string;
  item_id: string;
  platform: string;
  url: string | null;
  external_id: string | null;
  status: string;
  published_at: string | null;
  last_error: string | null;
}

export function photoUrl(itemId: string, filename: string): string {
  return `/api/photos/${itemId}/${encodeURIComponent(filename)}`;
}

function mapPhoto(row: PhotoRow): Photo {
  return {
    id: row.id,
    itemId: row.item_id,
    filename: row.filename,
    sortOrder: row.sort_order,
    url: photoUrl(row.item_id, row.filename),
  };
}

function mapListing(row: ListingRow): Listing {
  return {
    id: row.id,
    itemId: row.item_id,
    platform: row.platform as Platform,
    url: row.url,
    externalId: row.external_id,
    status: row.status as ListingStatus,
    publishedAt: row.published_at,
    lastError: row.last_error,
  };
}

function mapItem(row: ItemRow, photos: Photo[], listings: Listing[]): Item {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priceCents: row.price_cents,
    condition: row.condition as Condition,
    category: row.category,
    status: row.status as ItemStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    photos,
    listings,
  };
}

const photosForItem = db.prepare<[string], PhotoRow>(
  'SELECT * FROM photos WHERE item_id = ? ORDER BY sort_order ASC, id ASC',
);
const listingsForItem = db.prepare<[string], ListingRow>(
  'SELECT * FROM listings WHERE item_id = ? ORDER BY platform ASC',
);

function hydrate(row: ItemRow): Item {
  const photos = photosForItem.all(row.id).map(mapPhoto);
  const listings = listingsForItem.all(row.id).map(mapListing);
  return mapItem(row, photos, listings);
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export function listItems(): Item[] {
  const rows = db
    .prepare<[], ItemRow>('SELECT * FROM items ORDER BY datetime(created_at) DESC')
    .all();
  return rows.map(hydrate);
}

export function getItem(id: string): Item | null {
  const row = db.prepare<[string], ItemRow>('SELECT * FROM items WHERE id = ?').get(id);
  return row ? hydrate(row) : null;
}

export function createItem(input: ItemInput): Item {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO items (id, title, description, price_cents, condition, category, status, created_at, updated_at)
     VALUES (@id, @title, @description, @price_cents, @condition, @category, 'draft', @now, @now)`,
  ).run({
    id,
    title: input.title,
    description: input.description,
    price_cents: input.priceCents,
    condition: input.condition,
    category: input.category,
    now,
  });
  return getItem(id)!;
}

export function updateItem(id: string, patch: ItemUpdate): Item | null {
  const existing = db.prepare<[string], ItemRow>('SELECT * FROM items WHERE id = ?').get(id);
  if (!existing) return null;

  const fields: string[] = [];
  const params: Record<string, unknown> = { id, now: new Date().toISOString() };
  const set = (col: string, key: string, value: unknown) => {
    fields.push(`${col} = @${key}`);
    params[key] = value;
  };

  if (patch.title !== undefined) set('title', 'title', patch.title);
  if (patch.description !== undefined) set('description', 'description', patch.description);
  if (patch.priceCents !== undefined) set('price_cents', 'price_cents', patch.priceCents);
  if (patch.condition !== undefined) set('condition', 'condition', patch.condition);
  if (patch.category !== undefined) set('category', 'category', patch.category);

  fields.push('updated_at = @now');
  db.prepare(`UPDATE items SET ${fields.join(', ')} WHERE id = @id`).run(params);
  return getItem(id);
}

export function setItemStatus(id: string, status: ItemStatus): void {
  db.prepare('UPDATE items SET status = ?, updated_at = ? WHERE id = ?').run(
    status,
    new Date().toISOString(),
    id,
  );
}

/** Recompute status for items left in `publishing` after a crash or killed browser. */
export function recoverStalePublishingItems(): number {
  const rows = db
    .prepare<[], { id: string }>("SELECT id FROM items WHERE status = 'publishing'")
    .all();
  for (const { id } of rows) {
    const listings = listingsForItem.all(id);
    const live = listings.filter((l) => l.status === 'live').length;
    const total = listings.length;
    if (total > 0 && live === total) setItemStatus(id, 'listed');
    else if (live > 0) setItemStatus(id, 'partial');
    else setItemStatus(id, 'draft');
  }
  return rows.length;
}

/** Deletes the item and (via cascade) its photos + listings. Returns the
 * filenames that were attached so the caller can remove the files on disk. */
export function deleteItem(id: string): { filenames: string[] } | null {
  const row = db.prepare<[string], ItemRow>('SELECT * FROM items WHERE id = ?').get(id);
  if (!row) return null;
  const filenames = photosForItem.all(id).map((p) => p.filename);
  db.prepare('DELETE FROM items WHERE id = ?').run(id);
  return { filenames };
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

export function addPhoto(itemId: string, filename: string): Photo {
  const id = randomUUID();
  const next =
    (db
      .prepare<[string], { n: number }>(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM photos WHERE item_id = ?',
      )
      .get(itemId)?.n) ?? 0;
  db.prepare('INSERT INTO photos (id, item_id, filename, sort_order) VALUES (?, ?, ?, ?)').run(
    id,
    itemId,
    filename,
    next,
  );
  return { id, itemId, filename, sortOrder: next, url: photoUrl(itemId, filename) };
}

export function getPhoto(itemId: string, photoId: string): Photo | null {
  const row = db
    .prepare<[string, string], PhotoRow>('SELECT * FROM photos WHERE id = ? AND item_id = ?')
    .get(photoId, itemId);
  return row ? mapPhoto(row) : null;
}

export function deletePhoto(itemId: string, photoId: string): string | null {
  const photo = getPhoto(itemId, photoId);
  if (!photo) return null;
  db.prepare('DELETE FROM photos WHERE id = ? AND item_id = ?').run(photoId, itemId);
  return photo.filename;
}

export function reorderPhotos(itemId: string, orderedIds: string[]): void {
  const update = db.prepare('UPDATE photos SET sort_order = ? WHERE id = ? AND item_id = ?');
  const tx = db.transaction((ids: string[]) => {
    ids.forEach((photoId, index) => update.run(index, photoId, itemId));
  });
  tx(orderedIds);
}

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------

export interface ListingUpsert {
  url?: string | null;
  externalId?: string | null;
  status: ListingStatus;
  publishedAt?: string | null;
  lastError?: string | null;
}

export function upsertListing(itemId: string, platform: Platform, data: ListingUpsert): Listing {
  const existing = db
    .prepare<[string, string], ListingRow>(
      'SELECT * FROM listings WHERE item_id = ? AND platform = ?',
    )
    .get(itemId, platform);

  if (existing) {
    db.prepare(
      `UPDATE listings SET url = @url, external_id = @externalId, status = @status,
         published_at = @publishedAt, last_error = @lastError
       WHERE id = @id`,
    ).run({
      id: existing.id,
      url: data.url ?? null,
      externalId: data.externalId ?? null,
      status: data.status,
      publishedAt: data.publishedAt ?? null,
      lastError: data.lastError ?? null,
    });
    return mapListing(
      db.prepare<[string], ListingRow>('SELECT * FROM listings WHERE id = ?').get(existing.id)!,
    );
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO listings (id, item_id, platform, url, external_id, status, published_at, last_error)
     VALUES (@id, @itemId, @platform, @url, @externalId, @status, @publishedAt, @lastError)`,
  ).run({
    id,
    itemId,
    platform,
    url: data.url ?? null,
    externalId: data.externalId ?? null,
    status: data.status,
    publishedAt: data.publishedAt ?? null,
    lastError: data.lastError ?? null,
  });
  return mapListing(db.prepare<[string], ListingRow>('SELECT * FROM listings WHERE id = ?').get(id)!);
}

/** Removes a platform listing so the item can be published there again. */
export function clearListing(itemId: string, platform: Platform): boolean {
  const result = db
    .prepare('DELETE FROM listings WHERE item_id = ? AND platform = ?')
    .run(itemId, platform);
  return result.changes > 0;
}
