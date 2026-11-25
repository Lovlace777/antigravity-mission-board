export function BrandMark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} shrink-0`}
      aria-hidden="true"
    >
      <rect
        width="32"
        height="32"
        rx="8"
        className="fill-[#1C1917] dark:fill-[#242421]"
      />
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="7.5"
        className="stroke-[#1C1917]/20 dark:stroke-white/14"
      />
      {/* Warm monochrome 3-column Kanban monogram */}
      <rect x="7.5" y="12.5" width="4" height="12" rx="1.4" fill="#F6F5F1" />
      <rect x="14" y="8.5" width="4" height="16" rx="1.4" fill="#D6D3CD" />
      <rect x="20.5" y="15.5" width="4" height="9" rx="1.4" fill="#8C867E" />
      {/* Quiet sage telemetry dot */}
      <circle cx="22.5" cy="10.2" r="2.1" fill="#22C55E" />
    </svg>
  );
}
