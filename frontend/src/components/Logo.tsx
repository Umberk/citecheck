export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="rgb(var(--brand-600))" />
      <path d="M20.6 10.2a8 8 0 1 0 0 11.6" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <path
        d="m15.6 16 2.6 2.6 5-5.8"
        fill="none"
        stroke="#9fb7ff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark />
      {!compact && <span className="text-[15px] font-semibold tracking-tight text-ink">CiteCheck</span>}
    </span>
  );
}
