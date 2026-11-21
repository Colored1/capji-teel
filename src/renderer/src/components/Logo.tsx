export function Logo(): JSX.Element {
  return (
    <div className="flex items-center gap-3" dir="ltr">
      <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden="true">
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2ee6d6" />
            <stop offset="1" stopColor="#0f8a82" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="38" height="38" rx="10" fill="url(#lg)" />
        <rect x="13" y="8" width="14" height="24" rx="3" fill="none" stroke="#070a10" strokeWidth="2.4" />
        <path d="M17 27h6" stroke="#070a10" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M17 14c2-2 4-2 6 0M15 11c3.5-3.5 6.5-3.5 10 0" stroke="#070a10" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      </svg>
      <div className="leading-tight">
        <div className="text-lg font-extrabold tracking-tight">
          CAPji <span className="text-brand">teel</span>
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-400">Mobile Service Toolkit</div>
      </div>
    </div>
  )
}
