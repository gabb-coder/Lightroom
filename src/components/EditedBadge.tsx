/** Sliders glyph marking an edited photo (design: grid cell and filmstrip). */
export function EditedIcon({ size = 12, color = '#9e9e9e' }: { size?: number; color?: string }) {
  return (
    <svg role="img" aria-label="Edited" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 5h12M2 11h12" />
      <circle cx="6" cy="5" r="1.8" fill="#262626" />
      <circle cx="10" cy="11" r="1.8" fill="#262626" />
    </svg>
  );
}
