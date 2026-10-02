// BugBot handoff contract.
//
// Wire surface for `GET /api/v1/integrations/bugbot/handoff?kind=&locale=` per
// docs/13-api-design.md#external-integrations and
// docs/16-jobs-and-integrations.md#bugbot-handoff.
//
// BugBot is a separate MAGTRANS service that collects bug reports and ideas.
// Our users have no account there: the API signs a short-lived one-time token
// for the signed-in user and answers with the URL the browser opens in a new
// tab. Only `kind` and `locale` come from the request — everything that says
// WHO the user is comes from the server-side session.

import { z } from 'zod';

/** Which BugBot form to open. `idea` is admin-only on our side (403 otherwise). */
export const BugbotHandoffKindSchema = z.enum(['bug', 'idea']);
export type BugbotHandoffKind = z.infer<typeof BugbotHandoffKindSchema>;

/** Languages the BugBot forms are rendered in — same pair as our UI. */
export const BugbotHandoffLocaleSchema = z.enum(['pl', 'en']);
export type BugbotHandoffLocale = z.infer<typeof BugbotHandoffLocaleSchema>;

/** Query string of `GET /integrations/bugbot/handoff`. */
export const BugbotHandoffQuerySchema = z
  .object({
    kind: BugbotHandoffKindSchema.default('bug'),
    locale: BugbotHandoffLocaleSchema.default('pl'),
  })
  .strict();
export type BugbotHandoffQuery = z.infer<typeof BugbotHandoffQuerySchema>;

/**
 * `url` carries the one-time token in its query string: valid for 60 seconds,
 * accepted by BugBot once. Never log it, never cache it.
 */
export const BugbotHandoffResponseSchema = z.object({
  url: z.string().url(),
});
export type BugbotHandoffResponse = z.infer<typeof BugbotHandoffResponseSchema>;
