import {
  buildFromListingTemplate,
  CATEGORIES,
  CONDITIONS,
  CONDITION_LABELS,
  DEFAULT_PICKUP_LINE,
  LISTING_TEMPLATES,
  listingAssistContextSchema,
  MAX_TITLE_LENGTH,
  listingAssistSuggestionsSchema,
  type ListingAssistContext,
  type ListingAssistSuggestions,
} from '@sell/core';
import type { AssistProfile } from '../types';

const CONDITION_KEYS_TEXT = CONDITIONS.map((c) => `- ${c}: ${CONDITION_LABELS[c]}`).join('\n');
const CATEGORY_KEYS_TEXT = CATEGORIES.map((c) => `- ${c.key}: ${c.label}`).join('\n');

/** Dependencies of the `listing` profile. */
export interface ListingProfileDeps {
  /** Returns the configured pickup line, read on every request. */
  getPickupLine(): string;
}

/**
 * Creates the `listing` profile, used by the item editor. The model asks
 * follow-up questions and suggests title, description, price, condition, and
 * category.
 */
export function createListingProfile(
  deps: ListingProfileDeps,
): AssistProfile<ListingAssistContext, ListingAssistSuggestions> {
  const getPickupLine = () => deps.getPickupLine().trim() || DEFAULT_PICKUP_LINE;

  return {
    name: 'listing',
    contextSchema: listingAssistContextSchema,
    suggestionsSchema: listingAssistSuggestionsSchema,
    normalizeSuggestions(s) {
      const pickupLine = getPickupLine();
      const description =
        s.description !== null && !s.description.includes(pickupLine)
          ? `${s.description.trimEnd()}\n\n${pickupLine}`
          : s.description;
      return { ...s, title: s.title?.trim().slice(0, MAX_TITLE_LENGTH) || null, description };
    },
    buildSystemPrompt(context) {
      const pickupLine = getPickupLine();
      const templates = LISTING_TEMPLATES.map(
        (t) =>
          `### ${t.label} (${t.hint})\n${buildFromListingTemplate(t.id, { pickupLine })}`,
      ).join('\n\n');

      return `You help a private seller write an honest, complete listing for local marketplaces such as Craigslist, OfferUp, and Facebook Marketplace.

## How to reply
- "reply" is plain text shown in a chat. Keep it short and friendly. Do not use markdown.
- When important facts are missing, ask one to three short follow-up questions in "reply". Examples: brand and model, age, condition, defects or wear, dimensions for large items, and included accessories.
- Never invent facts. Only use what the seller told you or what the current form values show. Do not add meetup times, selling points, or included items that the seller did not mention.
- When you suggest a price, explain it in one short sentence in "reply".

## How to suggest field values
- Put suggestions in "suggestions". Set a field to null when you do not have enough information, or when the current value is already good.
- title: Clear and specific, ${MAX_TITLE_LENGTH} characters or fewer. Lead with brand, item, and a key detail.
- description: Choose the listing template below that fits the item best. Fill in the [bracketed] placeholders with facts from the seller. Remove every line that you cannot fill with those facts, and do not leave [brackets]. For example, remove the "Meetup", "You'll need", "Includes", and optional lines unless the seller gave that information. The description must include this pickup line exactly: "${pickupLine}"
- priceCents: A fair used-market asking price in US cents, as an integer. For example, $45 is 4500. Estimate a price when you know the item and its condition, and use the original price and age when the seller gives them. Use null only when you cannot estimate. Put the same price in the description. If priceCents is null, write the price in the description as $__.
- condition: One of these keys:
${CONDITION_KEYS_TEXT}
- category: One of these keys:
${CATEGORY_KEYS_TEXT}

## Listing templates
${templates}

## Current form values
${JSON.stringify(context, null, 2)}`;
    },
  };
}
