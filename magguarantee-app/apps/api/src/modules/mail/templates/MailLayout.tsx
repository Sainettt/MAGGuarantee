/**
 * Shared chrome for the Phase 9 email templates: branded header (tone-colored
 * top border), a slot for the body, a CTA helper, a label/value field helper,
 * and the standard auto-generated-mail footer. Keeps each template focused on
 * its own content. See `_theme.ts` for tokens.
 */
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

import {
  bodyStyle,
  buttonStyle,
  colors,
  containerStyle,
  footerStyle,
  headingStyle,
  hrStyle,
  labelStyle,
  sectionStyle,
  toneColor,
  valueStyle,
  type Tone,
} from './_theme';

export interface MailLayoutProps {
  /** Big H1 in the header. */
  title: string;
  /** Inbox preview snippet. */
  preview: string;
  /** Header accent (top border) color. Defaults to MAGTRANS RED. */
  tone?: Tone;
  children: React.ReactNode;
}

export function MailLayout({
  title,
  preview,
  tone = 'brand',
  children,
}: MailLayoutProps): React.ReactElement {
  return (
    <Html lang="pl">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section
            style={{
              borderTop: `4px solid ${toneColor(tone)}`,
              padding: '24px 32px 16px',
              backgroundColor: colors.surface,
            }}
          >
            <Heading as="h1" style={headingStyle}>
              {title}
            </Heading>
            <Text style={{ ...labelStyle, marginTop: 6 }}>MAGGuarantee</Text>
          </Section>

          <Hr style={hrStyle} />

          {children}

          <Hr style={hrStyle} />

          <Section style={sectionStyle}>
            <Text style={footerStyle}>
              Ta wiadomość została wygenerowana automatycznie przez system
              MAGGuarantee. Jeśli nie spodziewałeś się tego maila, zignoruj go.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

/** Label-over-value field row, matching the maksim-confirmation-request layout. */
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <>
      <Text style={labelStyle}>{label}</Text>
      <Text style={valueStyle}>{children}</Text>
    </>
  );
}

/** Centered CTA button + copyable link, matching maksim-confirmation-request. */
export function Cta({
  href,
  label,
  tone = 'brand',
}: {
  href: string;
  label: string;
  tone?: Tone;
}): React.ReactElement {
  return (
    <Section style={{ ...sectionStyle, textAlign: 'center' }}>
      <Button href={href} style={buttonStyle(tone)}>
        {label}
      </Button>
      <Text style={{ fontSize: 12, color: colors.inkMuted, margin: '12px 0 0' }}>
        Lub skopiuj link: {href}
      </Text>
    </Section>
  );
}
