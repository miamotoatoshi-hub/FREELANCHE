/** The Freelanche mark: a rising line ending in a dot, on a rounded tile. */
export function LogoMark({ size = 72, animated = false }: { size?: number; animated?: boolean }) {
  return (
    <svg
      className={animated ? 'logo logo--animated' : 'logo'}
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role="img"
      aria-label="Freelanche"
    >
      <rect width="96" height="96" rx="26" className="logo__tile" />
      <path className="logo__line" d="M22 66 40 48l12 11 22-25" />
      <circle className="logo__dot" cx="74" cy="34" r="6.5" />
    </svg>
  );
}
