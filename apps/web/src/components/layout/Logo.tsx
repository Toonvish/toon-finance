import { cn } from "@/lib/cn";

export interface LogoProps {
  className?: string;
  /** Renders without the rounded brand tile (for use on coloured surfaces). */
  bare?: boolean;
  title?: string;
}

/**
 * App mark: a wallet with a coin — the same construction as toon-recipe's pot mark
 * (48-unit grid, rounded brand tile, 2.6 rounded strokes in `--brand-fg`), so the
 * two household apps sit next to each other on a home screen as siblings. Inline
 * SVG so it needs no network request and follows the current text colour when
 * `bare` is set. `public/favicon.svg` and the PNG icons are this drawing with the
 * light-theme hex values baked in — change one, regenerate the others
 * (`scripts/icons.sh`).
 */
export function Logo({ className, bare = false, title = "Finanzen" }: LogoProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label={title}
      className={cn("shrink-0", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      {bare ? null : <rect width="48" height="48" rx="12" fill="var(--brand)" />}
      <g
        fill="none"
        stroke={bare ? "currentColor" : "var(--brand-fg)"}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* wallet body */}
        <path d="M9 17.5a4 4 0 0 1 4-4h20a4 4 0 0 1 4 4v15a4 4 0 0 1-4 4H13a4 4 0 0 1-4-4Z" />
        {/* flap */}
        <path d="M9 17.5 30.2 10.6a2.6 2.6 0 0 1 3.4 2.4v.5" />
        {/* clasp pocket */}
        <path d="M37 22.5h-7.5a3 3 0 0 0 0 6H37" />
        <circle cx="30.5" cy="25.5" r="0.9" fill={bare ? "currentColor" : "var(--brand-fg)"} />
      </g>
    </svg>
  );
}
