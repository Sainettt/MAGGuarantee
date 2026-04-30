// (public) — login + verify. No header, no role guard. Children render the
// LoginScreen wrapper themselves so they can adjust their own positioning
// of toggles + ornaments per design system.

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
