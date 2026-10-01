import { useEffect, useState } from 'react';
import { PLATFORMS, PLATFORM_LABELS, type SettingsResponse } from '@sell/core';
import { api } from '../api';
import { Badge } from '../components/StatusBadge';

export function SettingsPage() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiAssistConfigured, setAiAssistConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    api.getSettings().then(setSettings).catch((err) => setError((err as Error).message));
    api
      .getAssistStatus()
      .then((s) => setAiAssistConfigured(s.configured))
      .catch(() => setAiAssistConfigured(false));
  }, []);

  if (error) return <div className="banner warn">{error}</div>;
  if (!settings) {
    return (
      <div className="empty">
        <span className="spinner" /> Loading…
      </div>
    );
  }

  const { location, publish } = settings;

  return (
    <>
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      {settings.mockMode && (
        <div className="banner warn">
          Mock mode is on (<code>MOCK_PUBLISH=1</code>). All publishing is simulated — no real
          listings are created.
        </div>
      )}

      <div className="panel" style={{ marginBottom: 20 }}>
        <h2>Marketplace credentials</h2>
        <p className="hint" style={{ color: 'var(--muted)', marginTop: 0 }}>
          Configured in <code>secrets.json</code> at the project root. Platforms without credentials
          fall back to the mock publisher.
        </p>
        {PLATFORMS.map((p) => (
          <div key={p} className="platform-row">
            <span className="name">{PLATFORM_LABELS[p]}</span>
            <div className="meta">
              {settings.configured[p] ? (
                <Badge color="green">configured</Badge>
              ) : (
                <Badge color="amber">not configured (mock)</Badge>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="panel" style={{ marginBottom: 20 }}>
        <h2>AI assist</h2>
        <p className="hint" style={{ color: 'var(--muted)', marginTop: 0 }}>
          Chat in the item editor to fill in listing details. Set <code>OPENROUTER_API_KEY</code> in{' '}
          <code>.env</code> at the project root, then restart the server.
        </p>
        <div className="platform-row">
          <span className="name">OpenRouter</span>
          <div className="meta">
            {aiAssistConfigured === null ? null : aiAssistConfigured ? (
              <Badge color="green">configured</Badge>
            ) : (
              <Badge color="amber">not configured (AI assist unavailable)</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 20 }}>
        <h2>Location</h2>
        <p className="hint" style={{ color: 'var(--muted)', marginTop: 0 }}>
          Edit <code>config.json</code> at the project root to change these.
        </p>
        <dl style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8, margin: 0 }}>
          <dt className="hint">City</dt>
          <dd style={{ margin: 0 }}>{location.city || <em className="hint">not set</em>}</dd>
          <dt className="hint">State</dt>
          <dd style={{ margin: 0 }}>{location.state || <em className="hint">not set</em>}</dd>
          <dt className="hint">ZIP</dt>
          <dd style={{ margin: 0 }}>{location.zip || <em className="hint">not set</em>}</dd>
        </dl>
      </div>

      <div className="panel" style={{ marginBottom: 20 }}>
        <h2>Listing defaults</h2>
        <p className="hint" style={{ color: 'var(--muted)', marginTop: 0 }}>
          Used when generating descriptions from a retail link. Edit <code>config.json</code>.
        </p>
        <dl style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8, margin: 0 }}>
          <dt className="hint">Pickup line</dt>
          <dd style={{ margin: 0 }}>{settings.listing.pickupLine}</dd>
          <dt className="hint">Ask vs retail</dt>
          <dd style={{ margin: 0 }}>
            {Math.round(settings.listing.askingPriceFraction * 100)}% of retail (suggested)
          </dd>
        </dl>
      </div>

      <div className="panel">
        <h2>Publishing</h2>
        <dl style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8, margin: 0 }}>
          <dt className="hint">Browser</dt>
          <dd style={{ margin: 0 }}>{publish.headless ? 'Headless' : 'Visible'}</dd>
          <dt className="hint">Slow-mo</dt>
          <dd style={{ margin: 0 }}>{publish.slowMoMs} ms</dd>
          <dt className="hint">Timeout</dt>
          <dd style={{ margin: 0 }}>{Math.round(publish.timeoutMs / 1000)} s</dd>
          <dt className="hint">Max photos</dt>
          <dd style={{ margin: 0 }}>{settings.maxPhotos}</dd>
        </dl>
      </div>
    </>
  );
}
