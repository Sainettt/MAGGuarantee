/**
 * Shared chrome + building blocks for the transactional email fleet, matching
 * the customer's "Правила дизайна писем" (docs/22-email-design.md).
 *
 * Anatomy (top → bottom):
 *   Header      — logo/wordmark left, "MAGGuarantee" eyebrow right, hairline.
 *   TitleBlock  — red overline → H1 (doc number / title) → optional status badge.
 *   children    — data sections / amount panels / paragraphs (block-level <tr>s).
 *   Cta + Note  — one red button + one line of explanation (both optional).
 *   Footer      — company line, "wygenerowana automatycznie", and the reply
 *                 policy (no-reply by default; `replyExpected` flips it) on a
 *                 grey strip.
 *
 * We render the shell (doctype, <head>, preheader) with @react-email primitives
 * and hand-write every table inside so the markup is byte-faithful to the
 * reference: `role="presentation"` tables, inline styles, no flex/grid, no
 * remote assets by default. See `_theme.ts` for the tokens.
 */
import { Body, Head, Html, Preview } from '@react-email/components';
import * as React from 'react';

import {
  amountStyle,
  badgeStyles,
  bodyStyle,
  buttonStyle,
  colors,
  eyebrowStyle,
  fieldLabelStyle,
  fieldValueStyle,
  fontFamily,
  footerStyle,
  headStyleBlock,
  overlineStyle,
  paragraphStyle,
  titleStyle,
  type Tone,
} from './_theme';

/**
 * Optional hosted logo. When set (production), the header renders it as a
 * 170px-wide <img alt="MAGTRANS">; otherwise it falls back to a text wordmark
 * so dev/Mailhog and unit tests stay fully self-contained (no remote fetch).
 * Recommended prod value: https://www.magtrans.eu/img/logo.png
 */
const LOGO_URL = (process.env.MAIL_LOGO_URL ?? '').trim();

/** Footer identity line (docs/22-email-design.md §4.6). */
const FOOTER_COMPANY = 'MAGTRANS · rok założenia 1982 · Dębica, Polska';

export interface MailLayoutProps {
  /** Inbox preview snippet (hidden preheader). */
  preview: string;
  /** Red super-heading above the title (email theme), e.g. "Nowy wniosek". */
  overline?: string;
  /** H1 — document number (GWA/…) or plain title (e.g. "Konto utworzone"). */
  title: string;
  /** Status pill under the title. Omitted for auth/account emails. */
  badge?: { tone: Tone; label: string };
  /** Single red CTA. Omitted when the email has no action. */
  cta?: { href: string; label: string };
  /** One line under the CTA (or standalone) explaining what happens next. */
  note?: React.ReactNode;
  /**
   * Set ONLY by `maksim-confirmation-request`, the one email whose reply is
   * part of the flow (it carries a `Reply-To` at the pracownik who armed the
   * gate). Everywhere else the default stands: the sending address is an
   * unattended no-reply group, and the footer says so.
   */
  replyExpected?: boolean;
  /** Data sections / panels / paragraphs — each a block-level <tr>. */
  children: React.ReactNode;
}

export function MailLayout({
  preview,
  overline,
  title,
  badge,
  cta,
  note,
  replyExpected = false,
  children,
}: MailLayoutProps): React.ReactElement {
  return (
    <Html lang="pl">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <style>{headStyleBlock}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <table
          role="presentation"
          cellPadding={0}
          cellSpacing={0}
          border={0}
          width="100%"
          style={{ backgroundColor: colors.canvas }}
        >
          <tbody>
            <tr>
              <td align="center" style={{ padding: '32px 12px' }}>
                <table
                  role="presentation"
                  cellPadding={0}
                  cellSpacing={0}
                  border={0}
                  width={600}
                  className="container"
                  style={{
                    width: 600,
                    maxWidth: 600,
                    backgroundColor: colors.surface,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 4,
                  }}
                >
                  <tbody>
                    <Header />
                    <TitleBlock overline={overline} title={title} badge={badge} />
                    {children}
                    {cta ? <Cta href={cta.href} label={cta.label} /> : null}
                    {note ? <Note>{note}</Note> : null}
                    <Footer replyExpected={replyExpected} />
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </Body>
    </Html>
  );
}

// ── Header ──────────────────────────────────────────────────────────────────

function Header(): React.ReactElement {
  return (
    <tr>
      <td
        className="px"
        style={{
          padding: '24px 32px 20px 32px',
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <table
          role="presentation"
          cellPadding={0}
          cellSpacing={0}
          border={0}
          width="100%"
        >
          <tbody>
            <tr>
              <td align="left" valign="middle" width={220} style={{ width: 220 }}>
                {LOGO_URL ? (
                  <img
                    src={LOGO_URL}
                    width={170}
                    alt="MAGTRANS"
                    style={{
                      display: 'block',
                      border: 0,
                      outline: 'none',
                      width: 170,
                      height: 'auto',
                    }}
                  />
                ) : (
                  <span
                    style={{
                      fontFamily,
                      fontSize: 22,
                      lineHeight: '26px',
                      fontWeight: 'bold',
                      letterSpacing: 0.5,
                      color: colors.brand,
                    }}
                  >
                    MAGTRANS
                  </span>
                )}
              </td>
              <td align="right" valign="middle" style={eyebrowStyle}>
                MAGGuarantee
              </td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
  );
}

// ── Title block (overline + H1 + badge) ─────────────────────────────────────

function TitleBlock({
  overline,
  title,
  badge,
}: {
  overline?: string;
  title: string;
  badge?: { tone: Tone; label: string };
}): React.ReactElement {
  return (
    <tr>
      <td className="px" style={{ padding: '28px 32px 24px 32px' }}>
        {overline ? <p style={overlineStyle}>{overline}</p> : null}
        <h1 className="h1" style={{ ...titleStyle, marginBottom: badge ? 14 : 0 }}>
          {title}
        </h1>
        {badge ? <StatusBadge tone={badge.tone} label={badge.label} /> : null}
      </td>
    </tr>
  );
}

// ── Status badge ────────────────────────────────────────────────────────────

/** Inline status pill (docs/22-email-design.md §5). Also exported standalone. */
export function StatusBadge({
  tone,
  label,
}: {
  tone: Tone;
  label: string;
}): React.ReactElement {
  const s = badgeStyles[tone];
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} border={0}>
      <tbody>
        <tr>
          <td
            {...({ bgcolor: s.bg } as Record<string, string>)}
            style={{
              backgroundColor: s.bg,
              border: `1px solid ${s.border}`,
              borderRadius: 3,
              padding: '5px 10px',
              fontFamily,
              fontSize: 12,
              lineHeight: '14px',
              fontWeight: 'bold',
              letterSpacing: 0.3,
              color: s.fg,
            }}
          >
            {label}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * Inline variant of `StatusBadge` — a `<span>` pill that can sit inside a line
 * of text (e.g. a per-row marker in a digest list), where the block-level
 * `<table>` badge would be invalid markup inside a `<p>`. Same `badgeStyles`
 * tokens (docs/22-email-design.md §5), tighter size to sit in a 14px row.
 * Clients that drop span padding/borders (Outlook desktop) still show the
 * coloured label text.
 */
export function InlineBadge({
  tone,
  label,
}: {
  tone: Tone;
  label: string;
}): React.ReactElement {
  const s = badgeStyles[tone];
  return (
    <span
      style={{
        display: 'inline-block',
        backgroundColor: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: 3,
        padding: '1px 6px',
        fontFamily,
        fontSize: 11,
        lineHeight: '14px',
        fontWeight: 'bold',
        letterSpacing: 0.3,
        color: s.fg,
        verticalAlign: 'middle',
      }}
    >
      {label}
    </span>
  );
}

// ── Data section (super-heading + label/value rows) ─────────────────────────

/**
 * A hairline-topped block: a grey super-heading followed by `FieldRow`s.
 * Children must be `<FieldRow>`s (each a `<tr>` in the inner two-column table).
 */
export function DataSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <tr>
      <td className="px" style={{ padding: '0 32px 6px 32px' }}>
        <table
          role="presentation"
          cellPadding={0}
          cellSpacing={0}
          border={0}
          width="100%"
          style={{ borderTop: `1px solid ${colors.border}` }}
        >
          <tbody>
            <tr>
              <td colSpan={2} style={{ ...eyebrowStyle, padding: '18px 0 10px 0' }}>
                {heading}
              </td>
            </tr>
            {children}
          </tbody>
        </table>
      </td>
    </tr>
  );
}

/** One "label → value" row inside a `DataSection`. */
export function FieldRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: React.ReactNode;
  /** Override the value colour (e.g. a shortfall in brand red). */
  valueColor?: string;
}): React.ReactElement {
  return (
    <tr>
      <td width={180} style={{ ...fieldLabelStyle, width: 180, padding: '0 12px 8px 0' }}>
        {label}
      </td>
      <td
        style={{
          ...fieldValueStyle,
          padding: '0 0 8px 0',
          ...(valueColor ? { color: valueColor } : {}),
        }}
      >
        {value}
      </td>
    </tr>
  );
}

// ── Amount / summary panel ──────────────────────────────────────────────────

/** Grey panel spotlighting one key figure (docs/22-email-design.md §4.4). */
export function AmountPanel({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: React.ReactNode;
  valueColor?: string;
}): React.ReactElement {
  return (
    <tr>
      <td className="px" style={{ padding: '4px 32px 0 32px' }}>
        <table
          role="presentation"
          cellPadding={0}
          cellSpacing={0}
          border={0}
          width="100%"
          bgcolor={colors.panel}
          style={{
            backgroundColor: colors.panel,
            border: `1px solid ${colors.border}`,
            borderRadius: 4,
          }}
        >
          <tbody>
            <tr>
              <td style={{ padding: '18px 20px' }}>
                <p style={{ ...eyebrowStyle, margin: '0 0 6px 0' }}>{label}</p>
                <p
                  className="amount"
                  style={{ ...amountStyle, ...(valueColor ? { color: valueColor } : {}) }}
                >
                  {value}
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
  );
}

// ── Code / credential panel ─────────────────────────────────────────────────

/**
 * Centered monospace panel for a one-time code (2FA / password reset) or a
 * temporary credential. `variant` picks the fill: `ink`/`brand` are inverse
 * (white text on a dark/red fill) for high-emphasis codes; `light` is a soft
 * panel with ink text for a copyable credential.
 */
export function CodePanel({
  value,
  variant = 'ink',
  size = 32,
  letterSpacing = 8,
}: {
  value: string;
  variant?: 'ink' | 'brand' | 'light';
  size?: number;
  letterSpacing?: number;
}): React.ReactElement {
  const fill =
    variant === 'brand'
      ? { bg: colors.brand, fg: '#FFFFFF', border: colors.brand }
      : variant === 'light'
        ? { bg: colors.panel, fg: colors.ink, border: colors.border }
        : { bg: colors.ink, fg: '#FFFFFF', border: colors.ink };
  return (
    <tr>
      <td className="px" style={{ padding: '8px 32px 16px 32px' }}>
        <table
          role="presentation"
          cellPadding={0}
          cellSpacing={0}
          border={0}
          width="100%"
          bgcolor={fill.bg}
          style={{
            backgroundColor: fill.bg,
            border: `1px solid ${fill.border}`,
            borderRadius: 6,
          }}
        >
          <tbody>
            <tr>
              <td
                align="center"
                style={{
                  padding: '18px 16px',
                  fontFamily:
                    "'Courier New', Consolas, Menlo, monospace",
                  fontSize: size,
                  lineHeight: `${Math.round(size * 1.1)}px`,
                  fontWeight: 'bold',
                  letterSpacing,
                  color: fill.fg,
                }}
              >
                {value}
              </td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
  );
}

// ── Free-text blocks ────────────────────────────────────────────────────────

/** A padded content row for paragraphs / custom markup (lists, tables). */
export function Block({
  children,
  pad = '0 32px 12px 32px',
}: {
  children: React.ReactNode;
  /** Override the cell padding (shorthand). */
  pad?: string;
}): React.ReactElement {
  return (
    <tr>
      <td className="px" style={{ padding: pad }}>
        {children}
      </td>
    </tr>
  );
}

/** A single body paragraph as its own block-level row. */
export function Paragraph({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}): React.ReactElement {
  return (
    <Block>
      <p style={{ ...paragraphStyle, ...style }}>{children}</p>
    </Block>
  );
}

// ── CTA + note ──────────────────────────────────────────────────────────────

/** Single red button (a table cell wrapping a block-level link, never an image). */
export function Cta({
  href,
  label,
}: {
  href: string;
  label: string;
}): React.ReactElement {
  return (
    <tr>
      <td className="px" align="left" style={{ padding: '24px 32px 8px 32px' }}>
        <table role="presentation" cellPadding={0} cellSpacing={0} border={0}>
          <tbody>
            <tr>
              <td
                {...({ bgcolor: colors.brand } as Record<string, string>)}
                style={{ backgroundColor: colors.brand, borderRadius: 3 }}
              >
                <a href={href} style={buttonStyle}>
                  {label}
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
  );
}

/** One explanatory line, typically under the CTA. */
export function Note({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <tr>
      <td
        className="px"
        style={{
          padding: '6px 32px 28px 32px',
          fontFamily,
          fontSize: 13,
          lineHeight: '19px',
          color: colors.text,
        }}
      >
        {children}
      </td>
    </tr>
  );
}

// ── Footer ──────────────────────────────────────────────────────────────────

function Footer({ replyExpected }: { replyExpected: boolean }): React.ReactElement {
  return (
    <tr>
      <td
        className="px"
        style={{
          padding: '18px 32px 24px 32px',
          borderTop: `1px solid ${colors.border}`,
          backgroundColor: colors.footer,
        }}
      >
        <p style={{ ...footerStyle, margin: '0 0 4px 0' }}>{FOOTER_COMPANY}</p>
        <p style={{ ...footerStyle, margin: '0 0 4px 0' }}>
          Wiadomość wygenerowana automatycznie przez system MAGGuarantee. Jeśli nie
          spodziewałeś się tej wiadomości, zignoruj ją.
        </p>
        {/*
          The sending address is an unattended no-reply group that rejects
          inbound mail — a reply bounces. Say so, so nobody writes into the void
          expecting an answer; every action lives in the app instead. The one
          email that DOES want a reply flips this and points at its Reply-To.
        */}
        <p style={{ ...footerStyle, fontWeight: 600 }}>
          {replyExpected
            ? 'Odpowiedz na tę wiadomość — odpowiedź trafi bezpośrednio do pracownika prowadzącego ten wniosek.'
            : 'Nie odpowiadaj na tę wiadomość — skrzynka nie jest obsługiwana. Wszystko załatwisz w systemie MAGGuarantee.'}
        </p>
      </td>
    </tr>
  );
}
