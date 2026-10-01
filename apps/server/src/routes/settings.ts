import type { FastifyInstance } from 'fastify';
import type { SettingsResponse } from '@sell/core';
import { loadConfig, loadSecrets, isMockMode, configuredPlatforms } from '../config';

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/settings', async (): Promise<SettingsResponse> => {
    const config = loadConfig();
    const secrets = loadSecrets();
    return {
      location: config.location,
      listing: config.listing,
      publish: config.publish,
      maxPhotos: config.maxPhotos,
      configured: configuredPlatforms(secrets),
      mockMode: isMockMode(),
    };
  });
}
