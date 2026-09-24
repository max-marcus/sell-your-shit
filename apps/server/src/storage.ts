import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { photosDir } from './paths';

/** Largest edge (px) we keep. Marketplaces downscale anyway; smaller = faster uploads. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 82;

function itemDir(itemId: string): string {
  return join(photosDir, itemId);
}

export function photoFilePath(itemId: string, filename: string): string {
  return join(itemDir(itemId), filename);
}

/**
 * Normalizes an uploaded image to a reasonably sized JPEG and writes it to
 * disk. Returns the stored filename. Falls back to writing the original bytes
 * if sharp can't decode the input (e.g. an unusual format).
 */
export async function savePhoto(itemId: string, input: Buffer): Promise<string> {
  mkdirSync(itemDir(itemId), { recursive: true });
  const filename = `${randomUUID()}.jpg`;
  const dest = photoFilePath(itemId, filename);
  await sharp(input)
    .rotate() // respect EXIF orientation
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toFile(dest);
  return filename;
}

export async function deletePhotoFile(itemId: string, filename: string): Promise<void> {
  try {
    await unlink(photoFilePath(itemId, filename));
  } catch {
    // File may already be gone — ignore.
  }
}

export function deleteItemDir(itemId: string): void {
  const dir = itemDir(itemId);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}
