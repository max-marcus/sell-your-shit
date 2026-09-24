import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import PQueue from 'p-queue';
import {
  PLATFORM_LABELS,
  type Item,
  type JobLogEntry,
  type JobPlatformState,
  type JobState,
  type Platform,
} from '@sell/core';
import { getPublisher } from '@sell/publishers';
import { loadConfig, loadSecrets, isMockMode, configuredPlatforms } from './config';
import { profilesDir, debugDir } from './paths';
import { photoFilePath } from './storage';
import { getItem, setItemStatus, upsertListing, recoverStalePublishingItems } from './repo';

/** Runs publish jobs one at a time and streams state updates to subscribers. */
class JobManager {
  private jobs = new Map<string, JobState>();
  private emitter = new EventEmitter();
  private queue = new PQueue({ concurrency: 1 });

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  get(id: string): JobState | undefined {
    return this.jobs.get(id);
  }

  subscribe(id: string, listener: (job: JobState) => void): () => void {
    const handler = (jobId: string) => {
      if (jobId === id) {
        const job = this.jobs.get(id);
        if (job) listener(job);
      }
    };
    this.emitter.on('update', handler);
    return () => this.emitter.off('update', handler);
  }

  private emit(id: string): void {
    this.emitter.emit('update', id);
  }

  private log(job: JobState, message: string, platform: Platform | null = null): void {
    const entry: JobLogEntry = { ts: new Date().toISOString(), platform, message };
    job.logs.push(entry);
    this.emit(job.id);
  }

  private platformState(job: JobState, platform: Platform): JobPlatformState {
    return job.platforms.find((p) => p.platform === platform)!;
  }

  /** Creates a job for an item and enqueues it. Returns the initial state. */
  enqueue(item: Item, platforms: Platform[]): JobState {
    const job: JobState = {
      id: randomUUID(),
      itemId: item.id,
      status: 'queued',
      platforms: platforms.map((platform) => ({
        platform,
        status: 'pending',
        url: null,
        externalId: null,
        error: null,
        usedMock: false,
      })),
      logs: [],
      createdAt: new Date().toISOString(),
      finishedAt: null,
    };
    this.jobs.set(job.id, job);
    void this.queue.add(() => this.run(job.id));
    return job;
  }

  private async run(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const config = loadConfig();
    const secrets = loadSecrets();
    const configured = configuredPlatforms(secrets);
    const mockGlobal = isMockMode();

    job.status = 'running';
    this.emit(jobId);
    setItemStatus(job.itemId, 'publishing');

    let liveCount = 0;

    try {
      for (const ps of job.platforms) {
        const platform = ps.platform;
        const item = getItem(job.itemId);
        if (!item) {
          ps.status = 'failed';
          ps.error = 'Item was deleted before publishing.';
          this.emit(jobId);
          continue;
        }

        const useMock = mockGlobal || !configured[platform];
        ps.usedMock = useMock;
        ps.status = 'running';
        this.log(job, `Starting ${PLATFORM_LABELS[platform]}${useMock ? ' (mock)' : ''}…`, platform);

        const publisher = getPublisher(platform, { mock: useMock });
        const photoPaths = item.photos.map((p) => photoFilePath(item.id, p.filename));

        try {
          const result = await publisher.publish({
            item,
            photoPaths,
            config,
            secrets: (secrets[platform] ?? {}) as Record<string, unknown>,
            profileDir: join(profilesDir, platform),
            debugDir,
            onProgress: (message) => this.log(job, message, platform),
            onAwaitingUser: (message) => {
              ps.status = 'awaiting_user';
              this.log(job, message, platform);
            },
          });

          ps.status = 'live';
          ps.url = result.url;
          ps.externalId = result.externalId ?? null;
          ps.error = null;
          liveCount += 1;
          upsertListing(item.id, platform, {
            url: result.url,
            externalId: result.externalId ?? null,
            status: 'live',
            publishedAt: new Date().toISOString(),
            lastError: null,
          });
          this.log(job, `Done: ${result.url}`, platform);
        } catch (err) {
          const message = (err as Error).message || 'Unknown error';
          ps.status = 'failed';
          ps.error = message;
          upsertListing(item.id, platform, {
            status: 'failed',
            lastError: message,
          });
          this.log(job, `Failed: ${message}`, platform);
        }
        this.emit(jobId);
      }
    } finally {
      const total = job.platforms.length;
      liveCount = job.platforms.filter((p) => p.status === 'live').length;
      if (liveCount === total) setItemStatus(job.itemId, 'listed');
      else if (liveCount > 0) setItemStatus(job.itemId, 'partial');
      else setItemStatus(job.itemId, 'draft');

      job.status = 'done';
      job.finishedAt = new Date().toISOString();
      this.log(job, `Finished: ${liveCount}/${total} platform(s) live.`);
      this.emit(jobId);
    }
  }
}

export const jobManager = new JobManager();

/** Call on server boot to fix items stuck mid-publish from a prior crash. */
export function recoverStaleJobs(): number {
  return recoverStalePublishingItems();
}
