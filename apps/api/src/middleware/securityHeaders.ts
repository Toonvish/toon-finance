/**
 * Browser hardening headers for every response the API emits — JSON and, in
 * the single-origin container, the PWA it serves itself (middleware/
 * staticWeb.ts). Built on Hono's `secureHeaders`; the choices below are the
 * ones that differ from its defaults, each for a reason:
 *
 *   - NO `Strict-Transport-Security`. TLS is terminated by the `toon-edge`
 *     Caddy, which owns HSTS (`TOON_HSTS_MAX_AGE`) — and deliberately sets 0
 *     for an internal hostname with a self-signed certificate. An HSTS header
 *     pinned from inside the app would lock such a local stack out.
 *   - `Content-Security-Policy` with `script-src 'self'` plus the SHA-256 of
 *     every inline `<script>` in the BUILT `index.html`, computed once at boot
 *     from the very file we serve. The theme bootstrap in apps/web/index.html
 *     is inline on purpose (it must run before the first paint, module or
 *     not), so it is allow-listed by hash rather than by `'unsafe-inline'`.
 *     No nonce: `index.html` is a static file, not a template.
 *   - `style-src 'self'`, no `'unsafe-inline'`: the built app has ONE
 *     external stylesheet, zero `<style>` elements and zero `style=""`
 *     attributes. React's `style={{…}}` and the theme bootstrap write
 *     `element.style` through the CSSOM, which CSP does not block — only an
 *     attribute set via `setAttribute("style", …)` would be, and nothing does
 *     that. Likewise `img-src 'self'`: no `data:`/`blob:` image anywhere.
 *     Everything is `'self'`: no CDN, no third-party font, no analytics.
 *   - `frame-ancestors 'none'` + `X-Frame-Options: DENY`: nothing here is
 *     meant to be embedded, and a framed ledger is a clickjacking target.
 *   - `Cross-Origin-Resource-Policy: same-origin`, `Referrer-Policy:
 *     strict-origin-when-cross-origin` (an invite or reset URL carries its
 *     token in the path — the default `no-referrer` would also be fine, but
 *     same-origin navigations need the referrer for nothing here either way,
 *     so keep the more common value and never leak the path cross-origin).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { MiddlewareHandler } from "hono";
import { secureHeaders } from "hono/secure-headers";

/** `'sha256-…'` sources for every inline `<script>` body found in `html`. */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(re)) {
    const body = match[1] ?? "";
    if (body.trim().length === 0) continue;
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(body);
    hashes.push(`'sha256-${hasher.digest("base64")}'`);
  }
  return hashes;
}

/** Reads the built index.html (if any) and returns its inline-script hashes. */
function scriptHashesFor(webDistDir: string | null): string[] {
  if (webDistDir === null) return [];
  const indexPath = join(webDistDir, "index.html");
  if (!existsSync(indexPath)) return [];
  return inlineScriptHashes(readFileSync(indexPath, "utf8"));
}

export function securityHeaders(webDistDir: string | null): MiddlewareHandler {
  const scriptSrc = ["'self'", ...scriptHashesFor(webDistDir)];
  return secureHeaders({
    strictTransportSecurity: false,
    referrerPolicy: "strict-origin-when-cross-origin",
    xFrameOptions: "DENY",
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc,
      styleSrc: ["'self'"],
      imgSrc: ["'self'"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      manifestSrc: ["'self'"],
      workerSrc: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      objectSrc: ["'none'"],
    },
  });
}
