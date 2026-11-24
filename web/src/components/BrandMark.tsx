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
        className="fill-[#11151E] dark:fill-[#131823]"
      />
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="7.5"
        className="stroke-zinc-800/80 dark:stroke-[#2A3346]"
      />
      {/* Minimal orbital radar arc */}
      <path
        d="M5.5 19.5C7.8 11.2 16.5 6.8 25.8 9.2"
        stroke="#38BDF8"
        strokeOpacity="0.45"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      {/* 3 crisp Kanban bars */}
      <rect x="7.2" y="13.2" width="4.4" height="11.6" rx="1.5" fill="#F1F5F9" />
      <rect x="13.8" y="9.8" width="4.4" height="15" rx="1.5" fill="#38BDF8" />
      <rect x="20.4" y="15.8" width="4.4" height="9" rx="1.5" fill="#94A3B8" />
      {/* Live status dot */}
      <circle cx="24.2" cy="9.4" r="2.2" fill="#10B981" />
    </svg>
  );
}
