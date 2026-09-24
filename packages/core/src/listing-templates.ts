/**
 * Marketplace listing description templates for common resale item types.
 * Platform-agnostic skeletons with clear placeholders sellers fill in.
 */

export const LISTING_TEMPLATE_IDS = [
  'standard_household',
  'large_household',
  'multi_item',
  'event_ticket',
] as const;

export type ListingTemplateId = (typeof LISTING_TEMPLATE_IDS)[number];

export interface ListingTemplate {
  id: ListingTemplateId;
  label: string;
  /** Short UI hint for when to use this template. */
  hint: string;
}

export const LISTING_TEMPLATES: ListingTemplate[] = [
  {
    id: 'standard_household',
    label: 'Standard household item',
    hint: 'Everyday goods — furniture (small/medium), kitchen, decor, electronics, etc.',
  },
  {
    id: 'large_household',
    label: 'Large household item',
    hint: 'Bulky pieces where dimensions, stairs/elevator, and pickup logistics matter.',
  },
  {
    id: 'multi_item',
    label: 'Multi-item / lot',
    hint: 'Bundles and lots with a clear inventory-style breakdown.',
  },
  {
    id: 'event_ticket',
    label: 'Event ticket',
    hint: 'Date, venue, section, transfer method, and face-value clarity.',
  },
];

const TEMPLATE_BY_ID = new Map(LISTING_TEMPLATES.map((t) => [t.id, t]));

export function getListingTemplate(id: string): ListingTemplate | undefined {
  return TEMPLATE_BY_ID.get(id as ListingTemplateId);
}

export interface BuildListingTemplateOpts {
  pickupLine?: string;
}

/**
 * Builds a scannable resale description skeleton for the given template.
 * Placeholders use [brackets] so sellers can find and replace them quickly.
 */
export function buildFromListingTemplate(
  id: ListingTemplateId,
  opts: BuildListingTemplateOpts = {},
): string {
  const pickup = (opts.pickupLine ?? 'Local pickup only').trim() || 'Local pickup only';

  switch (id) {
    case 'standard_household':
      return [
        '[Item] — [condition / key value] · $[__] OBO',
        '',
        'Details',
        '- What it is: [brand / model / size / color]',
        '- Condition: [new / like new / good / fair] — [honest wear notes]',
        '- Includes: [cables, hardware, original box, manuals — or “as shown”]',
        '- Known issues: [none / list defects]',
        '',
        'Logistics',
        `- ${pickup}`,
        '- Meetup: [neighborhood / days & times that work]',
        '',
        '[Optional: why you’re selling / why it’s a solid buy]',
      ].join('\n');

    case 'large_household':
      return [
        '[Item] — [condition] · $[__] OBO · must pick up',
        '',
        'Details',
        '- What it is: [brand / model / material / color]',
        '- Dimensions: [W × D × H] · Weight: [approx lbs]',
        '- Condition: [honest wear, stains, scratches, pet/smoke notes]',
        '- Includes: [cushions, shelves, hardware, original parts]',
        '- Known issues: [none / list defects]',
        '',
        'Pickup logistics (please read)',
        `- ${pickup}`,
        '- Access: [ground floor / elevator / # of stairs / narrow hallway]',
        '- You’ll need: [2 people / truck / dolly — be realistic]',
        '- Help available: [yes / no / for a small tip]',
        '- Meetup window: [days & times]',
        '',
        '[Optional: assembly required? disassembled for move?]',
      ].join('\n');

    case 'multi_item':
      return [
        '[Lot name] — [N] items · $[__] OBO for the lot',
        '',
        'What’s included',
        '1. [Item] — [condition] — [notes]',
        '2. [Item] — [condition] — [notes]',
        '3. [Item] — [condition] — [notes]',
        '',
        'Lot notes',
        '- Selling as a set: [yes / will split for $__ each]',
        '- Overall condition: [honest summary]',
        '- Known issues: [none / list defects]',
        '',
        'Logistics',
        `- ${pickup}`,
        '- Meetup: [neighborhood / days & times]',
        '- Prefer one pickup for the whole lot',
      ].join('\n');

    case 'event_ticket':
      return [
        '[Event] — [Day, Mon DD] @ [Venue] · $[__] OBO',
        '',
        'Ticket details',
        '- Section / row / seat: [e.g. 120 / Row F / Seat 8]',
        '- Quantity: [N]',
        '- Face value: $[__] each (selling at / under face)',
        '- Entry type: [mobile / PDF / will call / physical]',
        '',
        'Transfer',
        '- Method: [Ticketmaster / AXS / venue app / email PDF]',
        '- Timing: [immediate after payment / day-of]',
        '',
        'Notes',
        '- Reason for selling: [can’t attend / schedule change]',
        '- Not a scalper — [face / below face / firm]',
        '- No refunds after transfer completes',
        '',
        'Meetup / delivery',
        `- ${pickup}`,
        '- Prefer digital transfer; cash/meetup only if needed',
      ].join('\n');

    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}
