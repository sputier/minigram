import type { SyncProgress } from '../types/telegram'

export default function SyncProgressBar({ active, mediaPending, mediaDone }: SyncProgress) {
  const total = mediaDone + mediaPending
  const visible = active || mediaPending > 0

  if (!visible) return null

  const indeterminate = total === 0
  const pct = indeterminate ? 0 : (mediaDone / total) * 100

  return (
    <div className="absolute inset-x-0 top-0 z-50 h-[2px] overflow-hidden bg-tg-accent/20">
      {indeterminate ? (
        <div className="h-full w-[30%] animate-sync-slide bg-tg-accent" />
      ) : (
        <div
          className="h-full bg-tg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  )
}
