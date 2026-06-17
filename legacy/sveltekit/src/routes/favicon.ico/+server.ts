const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#111827"/>
  <path d="M17 18h30l-5 8H12l5-8Z" fill="#79F2C0"/>
  <path d="M22 30h30l-5 8H17l5-8Z" fill="#FFD84D"/>
  <path d="M17 42h30l-5 8H12l5-8Z" fill="#FF6B8A"/>
</svg>`;

export function GET() {
  return new Response(favicon, {
    headers: {
      "cache-control": "public, max-age=31536000, immutable",
      "content-type": "image/svg+xml",
    },
  });
}
