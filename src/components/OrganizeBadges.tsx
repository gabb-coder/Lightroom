import type { ColorLabel } from '../db/db';
import { labelInfo } from '../model/organize';

/** Filled flag shown on picked photos (design/Library.dc.html). */
export function PickedBadge() {
  return (
    <svg role="img" aria-label="Picked" width="12" height="12" viewBox="0 0 16 16" fill="#e2e2e2" stroke="#e2e2e2" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M4 14V2" fill="none" />
      <path d="M4 2.5h8l-2 3 2 3H4" />
    </svg>
  );
}

export function RejectedBadge() {
  return (
    <svg role="img" aria-label="Rejected" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#9e9e9e" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

export function LabelDot({ label, size = 10 }: { label: ColorLabel; size?: number }) {
  const info = labelInfo(label);
  return (
    <span
      role="img"
      aria-label={`${info?.name ?? label} label`}
      style={{ width: size, height: size, borderRadius: '50%', background: info?.color, flex: 'none' }}
    />
  );
}

/** "★★★" or the design's "·  ·  ·" placeholder for no rating. */
export function RatingText({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={className} aria-label={rating ? `${rating} star rating` : 'No rating'}>
      {rating ? '★'.repeat(rating) : '·  ·  ·'}
    </span>
  );
}
