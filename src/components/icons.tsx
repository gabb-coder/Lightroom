/** Inline SVG icons traced from the design mockups. All are decorative. */

interface IconProps {
  size?: number;
}

export function LogoIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="9" cy="9" r="7.25" />
      <path d="M9 1.75L12.4 7.9M16.2 9.2L9.6 12.5M12.3 15.6L5.6 12M1.8 9.6L6.2 4.4M4.9 3L12.6 3.4" />
    </svg>
  );
}

export function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

const strokeProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function UndoIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" strokeWidth="1.5" {...strokeProps}>
      <path d="M6 4L3 7l3 3" />
      <path d="M3 7h7a3 3 0 010 6H8" />
    </svg>
  );
}

export function RedoIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" strokeWidth="1.5" {...strokeProps}>
      <path d="M10 4l3 3-3 3" />
      <path d="M13 7H6a3 3 0 000 6h2" />
    </svg>
  );
}

export function ImportIcon({ size = 14 }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" strokeWidth={size > 16 ? 1.1 : 1.6} {...strokeProps}>
      <path d="M8 2v8" />
      <path d="M5 7l3 3 3-3" />
      <path d="M2 11.5V14h12v-2.5" />
    </svg>
  );
}

export function BeforeAfterIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="3" width="12" height="10" rx="1" />
      <path d="M8 3v10" />
    </svg>
  );
}

export function CropIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" strokeWidth="1.5" {...strokeProps}>
      <path d="M4 1v11h11" />
      <path d="M1 4h11v11" />
    </svg>
  );
}

export function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill={filled ? '#d8d8d8' : 'none'} stroke="#b5b5b5" strokeWidth="1.2" strokeLinejoin="round">
      <path d="M8 1.6l1.95 4 4.35.55-3.2 3 .85 4.35L8 11.3l-3.95 2.2.85-4.35-3.2-3 4.35-.55z" />
    </svg>
  );
}

export function PickIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M4 14V2" />
      <path d="M4 2.5h8l-2 3 2 3H4" />
    </svg>
  );
}

export function RejectIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

export function PhotosIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M2 3h12v10H2zM2 10l3.5-3 3 2.5L11 7l3 3" />
    </svg>
  );
}

export function RecentIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM8 5v3l2 1.5" />
    </svg>
  );
}

export function CollectionIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <rect x="2" y="5" width="12" height="9" rx="1" />
      <path d="M4 3h8M6 1.5h4" strokeLinecap="round" />
    </svg>
  );
}
