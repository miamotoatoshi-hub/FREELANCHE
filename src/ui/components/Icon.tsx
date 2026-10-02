import type { SVGProps } from 'react';

/** Builds a gear outline from geometry, so the icon set stays original and consistent. */
function gearPath(teeth = 8, outer = 9.5, inner = 7, centre = 12): string {
  const step = (Math.PI * 2) / teeth;
  const half = step / 4; // half the angular width of a tooth
  const point = (radius: number, angle: number) =>
    `${(centre + radius * Math.cos(angle)).toFixed(2)} ${(centre + radius * Math.sin(angle)).toFixed(2)}`;
  const commands: string[] = [];
  for (let i = 0; i < teeth; i += 1) {
    const mid = i * step - Math.PI / 2;
    const parts = [
      point(inner, mid - half * 2),
      point(outer, mid - half),
      point(outer, mid + half),
      point(inner, mid + half * 2),
    ];
    commands.push(`${i === 0 ? 'M' : 'L'}${parts.join(' L')}`);
  }
  return `${commands.join(' ')} Z`;
}

const GEAR = gearPath();

const ICONS = {
  home: <path d="M4 11.2 12 4.5l8 6.7V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.2a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5.2H5.5A1.5 1.5 0 0 1 4 19v-7.8Z" />,
  history: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  insights: (
    <>
      <path d="M5 19.5V13" />
      <path d="M12 19.5V5" />
      <path d="M19 19.5v-9" />
    </>
  ),
  settings: (
    <>
      <path d={GEAR} />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  chevronLeft: <path d="m14.5 6-6 6 6 6" />,
  chevronRight: <path d="m9.5 6 6 6-6 6" />,
  chevronDown: <path d="m6 9.5 6 6 6-6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  more: (
    <>
      <circle cx="12" cy="5.5" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="18.5" r="1" fill="currentColor" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="3" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  list: <path d="M8.5 7h11M8.5 12h11M8.5 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01" />,
  trash: <path d="M5 7h14M10 7V5h4v2M7 7l.8 11.2A1.5 1.5 0 0 0 9.3 19.6h5.4a1.5 1.5 0 0 0 1.5-1.4L17 7M10.5 11v5M13.5 11v5" />,
  pencil: <path d="m5 19 .8-3.6L15.7 5.5a1.7 1.7 0 0 1 2.4 0l.4.4a1.7 1.7 0 0 1 0 2.4L8.6 18.2 5 19ZM14 7.2l2.8 2.8" />,
  download: <path d="M12 4.5v10M8 11l4 4 4-4M5 19.5h14" />,
  upload: <path d="M12 15.5v-10M8 9l4-4 4 4M5 19.5h14" />,
  arrowUp: <path d="M12 19V6M6.5 11.5 12 6l5.5 5.5" />,
  arrowDown: <path d="M12 5v13M6.5 12.5 12 18l5.5-5.5" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v4.5M12 16h.01" />
    </>
  ),
} as const;

export type IconName = keyof typeof ICONS;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

/** Arrows that point "forward/back" in reading order, so they flip in right-to-left layouts. */
const DIRECTIONAL: ReadonlySet<IconName> = new Set(['chevronLeft', 'chevronRight']);

/** Decorative by default (aria-hidden). Put the accessible name on the button that holds it. */
export function Icon({ name, size = 24, className, ...rest }: IconProps) {
  const classes = [DIRECTIONAL.has(name) ? 'icon--directional' : '', className].filter(Boolean).join(' ');
  return (
    <svg
      className={classes || undefined}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {ICONS[name]}
    </svg>
  );
}
