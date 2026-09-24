import type {
  Item,
  ItemInput,
  ItemUpdate,
  JobState,
  Platform,
  RetailScrapeResult,
  SettingsResponse,
} from '@sell/core';

const JSON_HEADERS = { 'content-type': 'application/json' };

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // non-JSON error body
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  listItems: () => http<Item[]>('/api/items'),
  getItem: (id: string) => http<Item>(`/api/items/${id}`),
  createItem: (input: ItemInput) =>
    http<Item>('/api/items', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) }),
  updateItem: (id: string, patch: ItemUpdate) =>
    http<Item>(`/api/items/${id}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(patch) }),
  deleteItem: (id: string) => http<void>(`/api/items/${id}`, { method: 'DELETE' }),
  markSold: (id: string) => http<{ ok: boolean }>(`/api/items/${id}/sold`, { method: 'POST' }),
  uploadPhotos: (id: string, files: File[]) => {
    const form = new FormData();
    for (const file of files) form.append('photos', file);
    return http<Item>(`/api/items/${id}/photos`, { method: 'POST', body: form });
  },
  deletePhoto: (id: string, photoId: string) =>
    http<Item>(`/api/items/${id}/photos/${photoId}`, { method: 'DELETE' }),
  reorderPhotos: (id: string, orderedIds: string[]) =>
    http<Item>(`/api/items/${id}/photos/order`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ orderedIds }),
    }),
  publish: (id: string, platforms: Platform[]) =>
    http<JobState>(`/api/items/${id}/publish`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ platforms }),
    }),
  getJob: (id: string) => http<JobState>(`/api/jobs/${id}`),
  setListingUrl: (itemId: string, platform: Platform, url: string) =>
    http<Item>(`/api/items/${itemId}/listings/${platform}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ url }),
    }),
  removeListingUrl: (itemId: string, platform: Platform) =>
    http<Item>(`/api/items/${itemId}/listings/${platform}`, { method: 'DELETE' }),
  scrapeRetail: (url: string) =>
    http<RetailScrapeResult>('/api/scrape-retail', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ url }),
    }),
  getSettings: () => http<SettingsResponse>('/api/settings'),
};

/** Subscribes to a publish job's live updates via Server-Sent Events. */
export function subscribeJob(jobId: string, onState: (state: JobState) => void): () => void {
  const source = new EventSource(`/api/jobs/${jobId}/events`);
  source.onmessage = (event) => {
    try {
      onState(JSON.parse(event.data) as JobState);
    } catch {
      // ignore malformed frames
    }
  };
  return () => source.close();
}
