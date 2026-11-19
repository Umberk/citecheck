const logoMark = `${import.meta.env.BASE_URL}logo-mark.png`;
const logoTile = `${import.meta.env.BASE_URL}logo-icon-512.png`;

export function LogoMark({
  size = 28,
  variant = "tile",
}: {
  size?: number;
  variant?: "tile" | "transparent";
}) {
  const src = variant === "transparent" ? logoMark : logoTile;
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      className="shrink-0 rounded-lg object-cover"
      draggable={false}
    />
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