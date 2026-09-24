import { useEffect, useRef, useState } from 'react';
import {
  PLATFORMS,
  PLATFORM_LABELS,
  type Item,
  type JobState,
  type Platform,
  type SettingsResponse,
} from '@sell/core';
import { api, subscribeJob } from '../api';
import { Badge, jobPlatformColor, jobPlatformLabel, listingColor } from './StatusBadge';

/** Platforms that run browser automation; OfferUp is manual URL only. */
const AUTOMATED_PLATFORMS: Platform[] = ['craigslist', 'facebook'];

interface Props {
  item: Item;
  settings: SettingsResponse;
  onComplete: () => void;
}

function ConfirmModal({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  busy,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-title">{title}</h3>
        <p>{message}</p>
        <div className="modal-actions">
          <button className="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Removing…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ManualListingUrl({
  platform,
  itemId,
  onSaved,
}: {
  platform: Platform;
  itemId: string;
  onSaved: () => void;
}) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!url.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await api.setListingUrl(itemId, platform, url.trim());
      setUrl('');
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div className="field">
        <label htmlFor={`url-${platform}`}>Paste {PLATFORM_LABELS[platform]} listing URL</label>
        <div className="row" style={{ gap: 8 }}>
          <input
            id={`url-${platform}`}
            type="url"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button className="btn small" onClick={save} disabled={busy || !url.trim()}>
            Save
          </button>
        </div>
      </div>
      {err && <p className="error-text">{err}</p>}
    </div>
  );
}

function ListingLinkRow({
  platform,
  url,
  onRemove,
}: {
  platform: Platform;
  url: string;
  onRemove: () => void;
}) {
  return (
    <div className="listing-link" style={{ marginTop: 8 }}>
      <a href={url} target="_blank" rel="noreferrer">
        {url}
      </a>
      <button className="btn small danger" style={{ marginLeft: 'auto' }} onClick={onRemove}>
        Remove link
      </button>
    </div>
  );
}

export function PublishPanel({ item, settings, onComplete }: Props) {
  const [selected, setSelected] = useState<Record<Platform, boolean>>({
    craigslist: true,
    offerup: false,
    facebook: true,
  });
  const [job, setJob] = useState<JobState | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Platform | null>(null);
  const [removing, setRemoving] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => () => unsubRef.current?.(), []);

  useEffect(() => {
    if (!job || job.status === 'done') return;
    const interval = setInterval(() => {
      void api
        .getJob(job.id)
        .then((state) => {
          setJob(state);
          if (state.status === 'done') {
            setPublishing(false);
            onComplete();
          }
        })
        .catch(() => {
          setPublishing(false);
          onComplete();
        });
    }, 2000);
    return () => clearInterval(interval);
  }, [job, onComplete]);

  useEffect(() => {
    if (publishing && item.status !== 'publishing') {
      setPublishing(false);
    }
  }, [item.status, publishing]);

  const running = job?.status === 'running' || job?.status === 'queued';

  async function publish() {
    const platforms = AUTOMATED_PLATFORMS.filter((p) => selected[p]);
    if (platforms.length === 0) {
      setError('Pick at least one platform.');
      return;
    }
    if (item.photos.length === 0) {
      setError('Add at least one photo before publishing.');
      return;
    }
    setError(null);
    setPublishing(true);
    try {
      const created = await api.publish(item.id, platforms);
      setJob(created);
      unsubRef.current?.();
      unsubRef.current = subscribeJob(created.id, (state) => {
        setJob(state);
        if (state.status === 'done') {
          setPublishing(false);
          onComplete();
        }
      });
    } catch (err) {
      setError((err as Error).message);
      setPublishing(false);
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await api.removeListingUrl(item.id, removeTarget);
      setRemoveTarget(null);
      onComplete();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRemoving(false);
    }
  }

  function renderPlatform(platform: Platform) {
    const listing = item.listings.find((l) => l.platform === platform);
    const jobState = job?.platforms.find((p) => p.platform === platform);
    const isMock = settings.mockMode || !settings.configured[platform];
    const hasLink = Boolean(listing?.url);
    const isOfferUp = platform === 'offerup';
    const canAutomate = AUTOMATED_PLATFORMS.includes(platform);
    const showManualInput =
      isOfferUp ? !hasLink : listing?.status === 'failed' && !hasLink;

    return (
      <div
        key={platform}
        style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 10 }}
      >
        <div className="platform-row" style={{ borderBottom: 'none' }}>
          {canAutomate ? (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={selected[platform]}
                disabled={running || hasLink}
                onChange={(e) => setSelected((s) => ({ ...s, [platform]: e.target.checked }))}
              />
              <span className="name">{PLATFORM_LABELS[platform]}</span>
            </label>
          ) : (
            <span className="name" style={{ fontWeight: 600 }}>
              {PLATFORM_LABELS[platform]}
            </span>
          )}
          <div className="meta">
            {hasLink && <Badge color="green">linked</Badge>}
            {isMock && canAutomate && <Badge color="amber">mock</Badge>}
            {jobState ? (
              <Badge color={jobPlatformColor(jobState.status)}>
                {jobPlatformLabel(jobState.status)}
              </Badge>
            ) : listing && !hasLink ? (
              <Badge color={listingColor(listing.status)}>{listing.status}</Badge>
            ) : null}
          </div>
        </div>

        {isOfferUp && (
          <p className="hint" style={{ margin: '6px 0 0', fontSize: 13 }}>
            OfferUp only allows personal sellers to create listings in the mobile app — paste the
            listing URL here after you post from your phone.
          </p>
        )}

        {hasLink && listing?.url && (
          <ListingLinkRow
            platform={platform}
            url={listing.url}
            onRemove={() => setRemoveTarget(platform)}
          />
        )}

        {showManualInput && (
          <ManualListingUrl platform={platform} itemId={item.id} onSaved={onComplete} />
        )}

        {canAutomate && hasLink && (
          <p className="hint" style={{ margin: '6px 0 0', fontSize: 12 }}>
            Remove the link above to publish again on {PLATFORM_LABELS[platform]}.
          </p>
        )}

        {listing?.status === 'failed' && listing.lastError && !hasLink && (
          <p className="error-text" style={{ marginTop: 8 }}>
            {listing.lastError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>Publish</h2>

      {PLATFORMS.map(renderPlatform)}

      <div style={{ marginTop: 16 }}>
        <button className="btn primary" onClick={publish} disabled={publishing || running}>
          {publishing || running ? (
            <>
              <span className="spinner" /> Publishing…
            </>
          ) : (
            'Publish to selected'
          )}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {job && job.logs.length > 0 && (
        <div className="log">
          {job.logs.map((entry, i) => (
            <div key={i} className="line">
              <span className="ts">{new Date(entry.ts).toLocaleTimeString()} </span>
              {entry.platform ? `[${entry.platform}] ` : ''}
              {entry.message}
            </div>
          ))}
        </div>
      )}

      {removeTarget && (
        <ConfirmModal
          title="Remove listing link?"
          message={`Remove the ${PLATFORM_LABELS[removeTarget]} link for this item? You can publish or paste a new link afterward.`}
          confirmLabel="Remove link"
          busy={removing}
          onConfirm={() => void confirmRemove()}
          onCancel={() => !removing && setRemoveTarget(null)}
        />
      )}
    </div>
  );
}
