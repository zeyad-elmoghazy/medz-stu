/**
 * Renders a JSON-LD structured-data block. Server component.
 * `<` is escaped so a string value can never close the script tag
 * (the XSS-safe pattern from the Next.js JSON-LD guide).
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
