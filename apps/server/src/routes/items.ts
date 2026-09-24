import type { FastifyInstance } from 'fastify';
import { itemInputSchema, itemUpdateSchema, photoOrderSchema, setListingUrlSchema, PLATFORMS, type Platform } from '@sell/core';
import {
  addPhoto,
  createItem,
  deleteItem,
  deletePhoto,
  getItem,
  listItems,
  reorderPhotos,
  updateItem,
  upsertListing,
  clearListing,
} from '../repo';
import { deleteItemDir, deletePhotoFile, savePhoto } from '../storage';

interface IdParams {
  id: string;
}
interface PhotoParams {
  id: string;
  photoId: string;
}
interface ListingParams {
  id: string;
  platform: string;
}

export async function itemRoutes(app: FastifyInstance): Promise<void> {
  app.get('/items', async () => listItems());

  app.post('/items', async (req, reply) => {
    const parsed = itemInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid item', details: parsed.error.issues });
    }
    return reply.code(201).send(createItem(parsed.data));
  });

  app.get<{ Params: IdParams }>('/items/:id', async (req, reply) => {
    const item = getItem(req.params.id);
    if (!item) return reply.code(404).send({ error: 'Item not found' });
    return item;
  });

  app.patch<{ Params: IdParams }>('/items/:id', async (req, reply) => {
    const parsed = itemUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid update', details: parsed.error.issues });
    }
    const item = updateItem(req.params.id, parsed.data);
    if (!item) return reply.code(404).send({ error: 'Item not found' });
    return item;
  });

  // Discard an item (and its files) without marking it sold.
  app.delete<{ Params: IdParams }>('/items/:id', async (req, reply) => {
    const result = deleteItem(req.params.id);
    if (!result) return reply.code(404).send({ error: 'Item not found' });
    deleteItemDir(req.params.id);
    return reply.code(204).send();
  });

  // Mark sold == remove from the data store (per spec). Same effect as delete,
  // but a distinct endpoint so the UI intent is clear.
  app.post<{ Params: IdParams }>('/items/:id/sold', async (req, reply) => {
    const result = deleteItem(req.params.id);
    if (!result) return reply.code(404).send({ error: 'Item not found' });
    deleteItemDir(req.params.id);
    return { ok: true };
  });

  // Upload one or more photos (multipart/form-data).
  app.post<{ Params: IdParams }>('/items/:id/photos', async (req, reply) => {
    const item = getItem(req.params.id);
    if (!item) return reply.code(404).send({ error: 'Item not found' });

    let saved = 0;
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        const buffer = await part.toBuffer();
        if (buffer.length === 0) continue;
        const filename = await savePhoto(item.id, buffer);
        addPhoto(item.id, filename);
        saved += 1;
      }
    }
    if (saved === 0) {
      return reply.code(400).send({ error: 'No image files were uploaded' });
    }
    return getItem(item.id);
  });

  app.delete<{ Params: PhotoParams }>('/items/:id/photos/:photoId', async (req, reply) => {
    const filename = deletePhoto(req.params.id, req.params.photoId);
    if (!filename) return reply.code(404).send({ error: 'Photo not found' });
    await deletePhotoFile(req.params.id, filename);
    return getItem(req.params.id);
  });

  app.put<{ Params: IdParams }>('/items/:id/photos/order', async (req, reply) => {
    const item = getItem(req.params.id);
    if (!item) return reply.code(404).send({ error: 'Item not found' });
    const parsed = photoOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid order', details: parsed.error.issues });
    }
    reorderPhotos(item.id, parsed.data.orderedIds);
    return getItem(item.id);
  });

  /** Paste a listing URL manually (e.g. OfferUp app-only listings). */
  app.put<{ Params: ListingParams }>('/items/:id/listings/:platform', async (req, reply) => {
    const platform = req.params.platform;
    if (!PLATFORMS.includes(platform as Platform)) {
      return reply.code(400).send({ error: 'Invalid platform' });
    }
    const item = getItem(req.params.id);
    if (!item) return reply.code(404).send({ error: 'Item not found' });
    const parsed = setListingUrlSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid URL', details: parsed.error.issues });
    }
    upsertListing(item.id, platform as Platform, {
      url: parsed.data.url,
      status: 'live',
      publishedAt: new Date().toISOString(),
      lastError: null,
    });
    return getItem(item.id);
  });

  /** Remove a saved listing link so automated publish can run again for that platform. */
  app.delete<{ Params: ListingParams }>('/items/:id/listings/:platform', async (req, reply) => {
    const platform = req.params.platform;
    if (!PLATFORMS.includes(platform as Platform)) {
      return reply.code(400).send({ error: 'Invalid platform' });
    }
    const item = getItem(req.params.id);
    if (!item) return reply.code(404).send({ error: 'Item not found' });
    if (!clearListing(req.params.id, platform as Platform)) {
      return reply.code(404).send({ error: 'Listing not found' });
    }
    return getItem(req.params.id);
  });
}
