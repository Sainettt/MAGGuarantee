/**
 * Shared visual tokens for the Phase 9 React-Email templates.
 *
 * Extracted so the template fleet (account-*, login-code, carrier-decision,
 * internal-decision, carrier-submitted, daily-reminder, weekly-report) stays
 * DRY and visually consistent. The three pre-Phase-9 templates
 * (authorization-request, verification-digest, password-reset) inline their
 * own copies and are intentionally left untouched.
 *
 * Brand color (#dc2626) from docs/14-design-system.md §"MAGTRANS RED".
 * No images / no remote assets — keeps Outlook + Gmail rendering predictable.
 */
import type * as React from 'react';

export const colors = {
  brand: '#dc2626', // MAGTRANS RED
  ink: '#0f172a',
  inkMuted: '#475569',
  surface: '#ffffff',
  surfaceMuted: '#f8fafc',
  border: '#e2e8f0',
  success: '#16a34a',
  danger: '#dc2626',
  warning: '#d97706',
  neutral: '#475569',
} as const;

/** Header accent tone — carrier-decision picks this from the claim outcome. */
export type Tone = 'brand' | 'success' | 'danger' | 'warning' | 'neutral';

export const toneColor = (tone: Tone): string => colors[tone];

export const bodyStyle: React.CSSProperties = {
  backgroundColor: colors.surfaceMuted,
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  color: colors.ink,
  margin: 0,
  padding: '24px 0',
};

export const containerStyle: React.CSSProperties = {
  backgroundColor: colors.surface,
  maxWidth: 560,
  margin: '0 auto',
  borderRadius: 12,
  overflow: 'hidden',
  border: `1px solid ${colors.border}`,
};

export const sectionStyle: React.CSSProperties = {
  padding: '16px 32px',
};

export const hrStyle: React.CSSProperties = {
  borderColor: colors.border,
  margin: 0,
};

export const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: colors.inkMuted,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  margin: '0 0 4px',
};

export const valueStyle: React.CSSProperties = {
  fontSize: 15,
  color: colors.ink,
  margin: '0 0 12px',
  fontWeight: 500,
};

export const amountStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  margin: '0 0 4px',
};

export const headingStyle: React.CSSProperties = {
  fontSize: 20,
  margin: 0,
  color: colors.ink,
  fontWeight: 700,
};

export const footerStyle: React.CSSProperties = {
  fontSize: 12,
  color: colors.inkMuted,
  margin: 0,
};

export const buttonStyle = (tone: Tone = 'brand'): React.CSSProperties => ({
  backgroundColor: toneColor(tone),
  color: '#ffffff',
  borderRadius: 8,
  padding: '12px 24px',
  fontSize: 15,
  fontWeight: 600,
  textDecoration: 'none',
  display: 'inline-block',
});
