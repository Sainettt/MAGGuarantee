/**
 * Shared visual tokens for the transactional email fleet.
 *
 * These implement the customer's "Правила дизайна писем" (email design system)
 * — see docs/22-email-design.md. One flat, editorial template for every system
 * email: white 600px card on a warm-grey canvas, a single red accent, and
 * table-based / inline-styled markup for predictable Outlook + Gmail rendering.
 *
 * The whole fleet consumes this file + `MailLayout.tsx` (header, title block,
 * data sections, amount panel, status badge, CTA, footer). No template inlines
 * its own palette anymore.
 *
 * Palette anchor: MAGTRANS RED `#E02020` (docs/22-email-design.md §1). No CSS
 * flex/grid, no remote assets by default (the header logo is an opt-in
 * `MAIL_LOGO_URL`, otherwise a text wordmark).
 */
import type * as React from 'react';

export const colors = {
  /** Accent — button, error, one critical value per email. */
  brand: '#E02020',
  /** Accent on hover (links). */
  brandDark: '#B31616',
  /** Headings + field values. */
  ink: '#1C1B19',
  /** Field labels + paragraph copy. */
  text: '#6E6B66',
  /** Overlines (section super-headings) + footer. */
  muted: '#8A8783',
  /** Email background (the canvas the card sits on). */
  canvas: '#F2F1EF',
  /** Card surface. */
  surface: '#FFFFFF',
  /** Amount / summary panel fill. */
  panel: '#F7F6F4',
  /** Footer strip fill. */
  footer: '#FAFAF9',
  /** Hairlines + card border. */
  border: '#E3E1DD',
} as const;

/** Email-safe font stack — no web fonts (mail clients don't load them). */
export const fontFamily = 'Arial, Helvetica, sans-serif';

/**
 * Semantic tone carried through from the domain layer (e.g. a claim decision:
 * `success` = ZAAKCEPTOWANO, `danger` = ODRZUCONO). Drives the status badge and
 * the optional critical-value colour. The header is NEVER tinted by tone — the
 * new design uses a neutral header and conveys state through the badge.
 */
export type Tone = 'brand' | 'success' | 'danger' | 'warning' | 'neutral';

/** The four reference badge styles (docs/22-email-design.md §5), keyed by tone. */
export const badgeStyles: Record<Tone, { bg: string; border: string; fg: string }> = {
  // "Oczekuje na weryfikację" — amber.
  warning: { bg: '#FDF0E4', border: '#F2D9BF', fg: '#8A5A16' },
  // "Zatwierdzony" — green.
  success: { bg: '#E9F3EC', border: '#CBE2D3', fg: '#2A6B42' },
  // "Odrzucony" — red.
  danger: { bg: '#FCEBEB', border: '#F3CFCF', fg: '#B31616' },
  // "Wersja robocza" — neutral.
  neutral: { bg: '#F1F1EF', border: '#E0DEDA', fg: '#6E6B66' },
  // Brand-accent badge (rare; reuses the red family so it reads as "action").
  brand: { bg: '#FCEBEB', border: '#F3CFCF', fg: '#B31616' },
} as const;

/** Tone → colour for a single critical value (e.g. a shortfall in red). */
export const criticalColor = (tone: Tone): string =>
  tone === 'success' ? '#2A6B42' : colors.brand;

// ── base line-heights / sizes reused across helpers ─────────────────────────

/** Body <body> — the canvas. */
export const bodyStyle: React.CSSProperties = {
  margin: 0,
  padding: 0,
  backgroundColor: colors.canvas,
};

/** Section super-heading (red overline over a title). */
export const overlineStyle: React.CSSProperties = {
  margin: '0 0 8px 0',
  fontFamily,
  fontSize: 11,
  lineHeight: '14px',
  letterSpacing: 1.4,
  textTransform: 'uppercase',
  color: colors.brand,
};

/** Section super-heading in muted grey (data-section headings, footer eyebrow). */
export const eyebrowStyle: React.CSSProperties = {
  ...overlineStyle,
  color: colors.muted,
};

/** H1 — document number / email title. */
export const titleStyle: React.CSSProperties = {
  margin: 0,
  fontFamily,
  fontSize: 26,
  lineHeight: '32px',
  fontWeight: 'bold',
  color: colors.ink,
};

/** Paragraph body copy. */
export const paragraphStyle: React.CSSProperties = {
  margin: 0,
  fontFamily,
  fontSize: 14,
  lineHeight: '22px',
  color: colors.text,
};

/** Field label (left column of a data row). */
export const fieldLabelStyle: React.CSSProperties = {
  fontFamily,
  fontSize: 14,
  lineHeight: '20px',
  color: colors.text,
  verticalAlign: 'top',
};

/** Field value (right column of a data row). */
export const fieldValueStyle: React.CSSProperties = {
  fontFamily,
  fontSize: 14,
  lineHeight: '20px',
  color: colors.ink,
  fontWeight: 'bold',
  verticalAlign: 'top',
};

/** Big number in the summary panel. */
export const amountStyle: React.CSSProperties = {
  margin: 0,
  fontFamily,
  fontSize: 32,
  lineHeight: '38px',
  fontWeight: 'bold',
  color: colors.ink,
};

/** Footer text. */
export const footerStyle: React.CSSProperties = {
  margin: 0,
  fontFamily,
  fontSize: 12,
  lineHeight: '18px',
  color: colors.muted,
};

/** Red CTA — a table cell wrapping a block-level link (never an image). */
export const buttonStyle: React.CSSProperties = {
  display: 'block',
  padding: '13px 26px',
  fontFamily,
  fontSize: 14,
  lineHeight: '18px',
  fontWeight: 'bold',
  color: '#FFFFFF',
  textDecoration: 'none',
};

/**
 * Responsive rules injected into <Head>. Only classes attached to the
 * hand-written tables/cells (`.container`, `.px`, `.h1`, `.amount`) react to
 * them; everything else is fixed inline. Mirrors email-wniosek.html.
 */
export const headStyleBlock = `
  @media only screen and (max-width:620px){
    .container{width:100% !important;}
    .px{padding-left:20px !important;padding-right:20px !important;}
    .h1{font-size:22px !important;}
    .amount{font-size:28px !important;}
  }
`;
