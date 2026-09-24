import type { ReactNode } from 'react';
import type { ItemStatus, JobPlatformStatus, ListingStatus } from '@sell/core';

type Color = 'green' | 'amber' | 'red' | 'blue' | '';

export function Badge({ color, children }: { color?: Color; children: ReactNode }) {
  return (
    <span className={`badge ${color ?? ''}`}>
      <span className="dot" />
      {children}
    </span>
  );
}

const ITEM_STATUS_META: Record<ItemStatus, { label: string; color: Color }> = {
  draft: { label: 'Draft', color: '' },
  publishing: { label: 'Publishing', color: 'blue' },
  listed: { label: 'Listed', color: 'green' },
  partial: { label: 'Partially listed', color: 'amber' },
  sold: { label: 'Sold', color: 'green' },
};

export function ItemStatusBadge({ status }: { status: ItemStatus }) {
  const meta = ITEM_STATUS_META[status];
  return <Badge color={meta.color}>{meta.label}</Badge>;
}

const LISTING_COLOR: Record<ListingStatus, Color> = {
  pending: 'blue',
  live: 'green',
  failed: 'red',
};

export function listingColor(status: ListingStatus): Color {
  return LISTING_COLOR[status];
}

const PLATFORM_COLOR: Record<JobPlatformStatus, Color> = {
  pending: '',
  running: 'blue',
  awaiting_user: 'amber',
  live: 'green',
  failed: 'red',
  skipped: '',
};

const PLATFORM_LABEL: Record<JobPlatformStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  awaiting_user: 'Needs you',
  live: 'Live',
  failed: 'Failed',
  skipped: 'Skipped',
};

export function jobPlatformColor(status: JobPlatformStatus): Color {
  return PLATFORM_COLOR[status];
}
export function jobPlatformLabel(status: JobPlatformStatus): string {
  return PLATFORM_LABEL[status];
}
