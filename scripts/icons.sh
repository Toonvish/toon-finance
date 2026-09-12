#!/usr/bin/env sh
# Regenerates apps/web/public/icons/*.png from apps/web/public/favicon.svg.
# The maskable variants add the safe-zone padding the spec asks for (the mark
# sits in the central 80%) on a solid brand ground.
set -eu
cd "$(dirname "$0")/../apps/web/public"
rsvg-convert -w 192 -h 192 favicon.svg -o icons/icon-192.png
rsvg-convert -w 512 -h 512 favicon.svg -o icons/icon-512.png
rsvg-convert -w 180 -h 180 favicon.svg -o icons/apple-touch-icon.png
rsvg-convert -w 32 -h 32 favicon.svg -o icons/favicon-32.png
cat > /tmp/toon-finance-maskable.svg <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <rect width="48" height="48" fill="#0f6e70" />
  <g transform="translate(7.2 7.2) scale(0.7)">
    <g fill="none" stroke="#f5f3ef" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 17.5a4 4 0 0 1 4-4h20a4 4 0 0 1 4 4v15a4 4 0 0 1-4 4H13a4 4 0 0 1-4-4Z" />
      <path d="M9 17.5 30.2 10.6a2.6 2.6 0 0 1 3.4 2.4v.5" />
      <path d="M37 22.5h-7.5a3 3 0 0 0 0 6H37" />
      <circle cx="30.5" cy="25.5" r="1" fill="#f5f3ef" />
    </g>
  </g>
</svg>
SVG
rsvg-convert -w 192 -h 192 /tmp/toon-finance-maskable.svg -o icons/maskable-192.png
rsvg-convert -w 512 -h 512 /tmp/toon-finance-maskable.svg -o icons/maskable-512.png
rm /tmp/toon-finance-maskable.svg
ls -la icons
