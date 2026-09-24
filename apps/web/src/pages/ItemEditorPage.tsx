import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  buildFromListingTemplate,
  buildListingDescription,
  CATEGORIES,
  CONDITIONS,
  CONDITION_LABELS,
  LISTING_TEMPLATES,
  type Condition,
  type Item,
  type ListingTemplateId,
  type SettingsResponse,
} from '@sell/core';
import { api } from '../api';
import { PhotoManager } from '../components/PhotoManager';
import { PublishPanel } from '../components/PublishPanel';

const DEFAULT_CONDITION: Condition = 'good';
const DEFAULT_CATEGORY = CATEGORIES[CATEGORIES.length - 1]!.key; // "general"
const DEFAULT_TEMPLATE: ListingTemplateId = 'standard_household';

function descriptionFromTemplate(templateId: ListingTemplateId, pickupLine: string): string {
  return buildFromListingTemplate(templateId, { pickupLine });
}

function isLikelyBlankDescription(text: string, pickupLine: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  // Unedited retail skeleton or any of the listing templates count as blank for nudge purposes.
  const baselines = [
    buildListingDescription({ pickupLine }),
    ...LISTING_TEMPLATES.map((t) => descriptionFromTemplate(t.id, pickupLine)),
  ];
  return baselines.some((b) => b.trim() === trimmed);
}

export function ItemEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  const [item, setItem] = useState<Item | null>(null);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [condition, setCondition] = useState<Condition>(DEFAULT_CONDITION);
  const [category, setCategory] = useState<string>(DEFAULT_CATEGORY);
  const [description, setDescription] = useState('');
  const [retailUrl, setRetailUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [scrapeNote, setScrapeNote] = useState<string | null>(null);
  const [retailPriceCents, setRetailPriceCents] = useState<number | null>(null);
  const [templateSeeded, setTemplateSeeded] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ListingTemplateId>(DEFAULT_TEMPLATE);

  useEffect(() => {
    void api
      .getSettings()
      .then((s) => {
        setSettings(s);
        if (isNew && !templateSeeded) {
          setDescription(descriptionFromTemplate(DEFAULT_TEMPLATE, s.listing.pickupLine));
          setTemplateSeeded(true);
        }
      })
      .catch(() => undefined);
  }, [isNew, templateSeeded]);

  function applyTemplate(nextId: ListingTemplateId) {
    const pickupLine = settings?.listing.pickupLine ?? 'Local pickup only';
    const hasEdits = !isLikelyBlankDescription(description, pickupLine);
    if (
      hasEdits &&
      !confirm('Replace the current description with this template? Your edits will be lost.')
    ) {
      return;
    }
    setSelectedTemplate(nextId);
    setDescription(descriptionFromTemplate(nextId, pickupLine));
  }

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .getItem(id)
      .then((loaded) => {
        setItem(loaded);
        setTitle(loaded.title);
        setPrice((loaded.priceCents / 100).toString());
        setCondition(loaded.condition);
        setCategory(loaded.category);
        setDescription(loaded.description);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  function rebuildDescription(opts: {
    askingPriceCents?: number | null;
    retailPriceCents?: number | null;
    concise?: string | null;
    summary?: string | null;
    retailUrl?: string | null;
  }) {
    const pickupLine = settings?.listing.pickupLine ?? 'Local pickup only';
    setDescription(
      buildListingDescription({
        askingPriceCents: opts.askingPriceCents,
        retailPriceCents: opts.retailPriceCents ?? retailPriceCents,
        concise: opts.concise,
        summary: opts.summary,
        retailUrl: opts.retailUrl ?? (retailUrl.trim() || null),
        pickupLine,
      }),
    );
  }

  async function fetchRetail() {
    const url = retailUrl.trim();
    if (!url) {
      setError('Paste a retail product URL first.');
      return;
    }
    setScraping(true);
    setError(null);
    setScrapeNote(null);
    try {
      const result = await api.scrapeRetail(url);
      setRetailUrl(result.url);
      setRetailPriceCents(result.retailPriceCents);

      if (result.title) setTitle(result.title.slice(0, 120));

      const fraction = settings?.listing.askingPriceFraction ?? 0.5;
      let askingCents: number | null = null;
      if (result.retailPriceCents != null && fraction > 0) {
        askingCents = Math.round((result.retailPriceCents * fraction) / 100) * 100;
        setPrice(String(askingCents / 100));
      }

      rebuildDescription({
        askingPriceCents: askingCents,
        retailPriceCents: result.retailPriceCents,
        concise: result.concise ?? result.title,
        summary: result.summary,
        retailUrl: result.url,
      });

      const bits: string[] = [];
      if (result.siteName) bits.push(result.siteName);
      if (result.retailPriceCents != null) {
        bits.push(`retail $${(result.retailPriceCents / 100).toFixed(2)}`);
      }
      if (askingCents != null) bits.push(`suggested ask $${(askingCents / 100).toFixed(0)}`);
      setScrapeNote(
        bits.length > 0
          ? `Filled from ${bits.join(' · ')}. Review and edit before saving.`
          : 'Fetched the page — review the fields and fill anything missing.',
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setScraping(false);
    }
  }

  async function save() {
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    const priceCents = Math.round((parseFloat(price) || 0) * 100);
    const payload = { title: title.trim(), description, priceCents, condition, category };
    setSaving(true);
    setError(null);
    try {
      if (!id) {
        const created = await api.createItem(payload);
        navigate(`/items/${created.id}`);
      } else {
        setItem(await api.updateItem(id, payload));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function discard() {
    if (!item) return;
    if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
    await api.deleteItem(item.id);
    navigate('/');
  }

  if (loading) {
    return (
      <div className="empty">
        <span className="spinner" /> Loading…
      </div>
    );
  }

  const detailsForm = (
    <div className="panel">
      <h2>Details</h2>
      <div className="form" style={{ maxWidth: 'none' }}>
        <div className="field">
          <label htmlFor="retailUrl">Retail product link</label>
          <div className="row" style={{ gap: 8 }}>
            <input
              id="retailUrl"
              type="url"
              value={retailUrl}
              placeholder="https://www.amazon.com/dp/…"
              onChange={(e) => setRetailUrl(e.target.value)}
            />
            <button
              className="btn"
              onClick={() => void fetchRetail()}
              disabled={scraping || !retailUrl.trim()}
            >
              {scraping ? (
                <>
                  <span className="spinner" /> Fetching…
                </>
              ) : (
                'Fetch details'
              )}
            </button>
          </div>
          <span className="hint">
            Opens the page, pulls title / retail price / description, and fills the template below.
            Works best with a direct product URL.
          </span>
          {scrapeNote && (
            <p className="hint" style={{ color: 'var(--green)', margin: 0 }}>
              {scrapeNote}
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            type="text"
            value={title}
            maxLength={120}
            placeholder="e.g. IKEA desk, white, good condition"
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="field row-2">
          <div className="field">
            <label htmlFor="price">Asking price (USD)</label>
            <input
              id="price"
              type="number"
              min={0}
              step="1"
              value={price}
              placeholder="0"
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="condition">Condition</label>
            <select id="condition" value={condition} onChange={(e) => setCondition(e.target.value as Condition)}>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {CONDITION_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="category">Category</label>
          <select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <span className="hint">Mapped to each marketplace's closest category when publishing.</span>
        </div>
        <div className="field">
          <label htmlFor="listingTemplate">Listing template</label>
          <select
            id="listingTemplate"
            value={selectedTemplate}
            onChange={(e) => applyTemplate(e.target.value as ListingTemplateId)}
          >
            {LISTING_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <span className="hint">
            {LISTING_TEMPLATES.find((t) => t.id === selectedTemplate)?.hint ??
              'Pick a template, then replace the [placeholders].'}{' '}
            Fetching a retail link still fills the price / retail skeleton.
          </span>
        </div>
        <div className="field">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            value={description}
            placeholder={descriptionFromTemplate(
              selectedTemplate,
              settings?.listing.pickupLine ?? 'Local pickup only',
            )}
            onChange={(e) => setDescription(e.target.value)}
            style={{ minHeight: 280 }}
          />
          <span className="hint">
            Replace [bracketed] placeholders. Lead with what it is + condition, call out wear
            honestly, and keep pickup / meetup clear.
          </span>
        </div>
        <div className="row">
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : isNew ? 'Create item' : 'Save changes'}
          </button>
          {!isNew && (
            <button className="btn danger" onClick={discard}>
              Delete
            </button>
          )}
        </div>
        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );

  return (
    <>
      <div className="page-header">
        <h1>{isNew ? 'New item' : 'Edit item'}</h1>
        <Link to="/" className="btn">
          ← Inventory
        </Link>
      </div>

      {isNew ? (
        <>
          <div className="banner">
            Paste a retail link to auto-fill details, or fill the form manually — then add photos
            and publish.
          </div>
          {detailsForm}
        </>
      ) : (
        <div className="split">
          <div style={{ display: 'grid', gap: 24 }}>
            {detailsForm}
            {item && settings && (
              <div className="panel">
                <PhotoManager item={item} maxPhotos={settings.maxPhotos} onChange={setItem} />
              </div>
            )}
          </div>
          <div>
            {item && settings ? (
              <PublishPanel item={item} settings={settings} onComplete={() => void api.getItem(item.id).then(setItem)} />
            ) : (
              <div className="panel">Loading settings…</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
