// ─── Icônes SVG maison — remplace les émojis « chrome UI » ────────────────────
// Style unique : trait 2px, coins ronds, currentColor. Les émojis restent réservés
// au CONTENU (modules, badges, parties TOEIC) ; l'interface parle en icônes.

function Base({ size = 16, className = "", children, filled = false, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const PlayIcon = (p) => (
  <Base {...p} filled><path d="M7 4.5v15a.8.8 0 0 0 1.2.7l12-7.5a.8.8 0 0 0 0-1.4l-12-7.5A.8.8 0 0 0 7 4.5Z" stroke="none" /></Base>
);

export const PauseIcon = (p) => (
  <Base {...p} filled><rect x="6" y="4.5" width="4" height="15" rx="1" stroke="none" /><rect x="14" y="4.5" width="4" height="15" rx="1" stroke="none" /></Base>
);

export const StarIcon = ({ filled = true, ...p }) => (
  <Base {...p} filled={filled}>
    <path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5L2.6 9.3l6.5-.9L12 2.5Z" stroke={filled ? "none" : "currentColor"} />
  </Base>
);

export const FlameIcon = (p) => (
  <Base {...p} filled>
    <path d="M12 22c4.4 0 7-2.9 7-6.6 0-2.8-1.6-5-3-6.7-.8-1-2-.5-2 .8 0 .9-.6 1.4-1.2 1-.9-.7-1.3-2.4-1.3-4.3 0-1.7-1.4-2.4-2.4-1.2C7.2 7.3 5 10.6 5 15.4 5 19.1 7.6 22 12 22Z" stroke="none" />
  </Base>
);

export const ClockIcon = (p) => (
  <Base {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Base>
);

export const MapIcon = (p) => (
  <Base {...p}><path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z" /><path d="M9 4v14M15 6v14" /></Base>
);

export const ChartIcon = (p) => (
  <Base {...p}><path d="M4 20h16" /><path d="M6.5 20v-6M12 20V9M17.5 20V4.5" /></Base>
);

export const TargetIcon = (p) => (
  <Base {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" /></Base>
);

export const CheckIcon = (p) => (
  <Base {...p} strokeWidth="3"><path d="M4.5 12.5l5 5 10-11" /></Base>
);

export const XIcon = (p) => (
  <Base {...p} strokeWidth="3"><path d="M6 6l12 12M18 6L6 18" /></Base>
);

export const HomeIcon = (p) => (
  <Base {...p}><path d="M3.5 10.5 12 3l8.5 7.5" /><path d="M6 9.5V20h12V9.5" /></Base>
);

export const RefreshIcon = (p) => (
  <Base {...p}><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 3v4.5h-4.5" /></Base>
);

export const BulbIcon = (p) => (
  <Base {...p}><path d="M9 18h6M10 21h4" /><path d="M12 3a6.5 6.5 0 0 0-4 11.6c.8.7 1.3 1.5 1.5 2.4h5c.2-.9.7-1.7 1.5-2.4A6.5 6.5 0 0 0 12 3Z" /></Base>
);

export const SpeakerIcon = (p) => (
  <Base {...p}><path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a9 9 0 0 1 0 12" /></Base>
);

export const LockIcon = (p) => (
  <Base {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Base>
);

export const ArrowLeftIcon = (p) => (
  <Base {...p}><path d="M19 12H5" /><path d="M11 6l-6 6 6 6" /></Base>
);

export const ArrowRightIcon = (p) => (
  <Base {...p}><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></Base>
);

export const HourglassIcon = (p) => (
  <Base {...p}><path d="M6 3h12M6 21h12" /><path d="M7 3c0 4 3 5.5 5 7 2-1.5 5-3 5-7M7 21c0-4 3-5.5 5-7 2 1.5 5 3 5 7" /></Base>
);
