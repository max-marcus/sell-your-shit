import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PLATFORM_LABELS, formatPrice, type Item } from '@sell/core';
import { api } from '../api';
import { Badge, ItemStatusBadge, listingColor } from '../components/StatusBadge';

export function InventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setItems(await api.listItems());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function markSold(item: Item) {
    if (!confirm(`Mark "${item.title}" as sold? This removes it and its photos from the local store.`)) {
      return;
    }
    await api.markSold(item.id);
    void load();
  }

  return (
    <>
      <div className="page-header">
        <h1>Inventory</h1>
        <Link to="/items/new" className="btn primary">
          + New item
        </Link>
      </div>

      {error && <div className="banner warn">{error}</div>}

      {loading ? (
        <div className="empty">
          <span className="spinner" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="empty">
          <p>No items yet.</p>
          <Link to="/items/new" className="btn primary">
            Add your first item
          </Link>
        </div>
      ) : (
        <div className="grid">
          {items.map((item) => {
            const cover = item.photos[0]?.url;
            return (
              <div key={item.id} className="card">
                <Link to={`/items/${item.id}`}>
                  <div className="thumb" style={cover ? { backgroundImage: `url(${cover})` } : undefined}>
                    {!cover && 'No photos'}
                  </div>
                </Link>
                <div className="body">
                  <div className="title">{item.title}</div>
                  <div className="price">{formatPrice(item.priceCents)}</div>
                  <div className="row">
                    <ItemStatusBadge status={item.status} />
                  </div>
                  {item.listings.length > 0 && (
                    <div className="row">
                      {item.listings.map((l) => (
                        <Badge key={l.platform} color={listingColor(l.status)}>
                          {PLATFORM_LABELS[l.platform].split(' ')[0]}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="actions">
                    <Link to={`/items/${item.id}`} className="btn small">
                      Edit
                    </Link>
                    <button className="btn small danger" onClick={() => markSold(item)}>
                      Mark sold
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
