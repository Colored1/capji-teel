import markUrl from '../assets/capji-icon.png'

export function Logo(): JSX.Element {
  return (
    <div className="flex items-center gap-3" dir="ltr">
      <img src={markUrl} alt="CAPJI" className="h-10 w-10 shrink-0 rounded-xl" draggable={false} />
      <div className="leading-tight">
        <div className="text-lg font-extrabold tracking-tight">
          CAPji <span className="text-brand">teel</span>
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-400">Creative • Media • Technology</div>
      </div>
    </div>
  )
}
