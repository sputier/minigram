import { useEffect, useRef, useState } from 'react'

interface AvatarProps {
  photoFileId?: number | null
  initials: string
  color: string
  className?: string
  title?: string
  onClick?: () => void
  // fileId spécifique qui vient de se télécharger — Avatar ne réessaie QUE
  // si c'est exactement son propre photoFileId, évitant les faux retries
  // (et le clignotement) provoqués par d'autres médias qui se téléchargent.
  latestReadyFileId?: number | null
}

export default function Avatar({
  photoFileId,
  initials,
  color,
  className = '',
  title,
  onClick,
  latestReadyFileId,
}: AvatarProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const failedRef = useRef(false)

  const src = photoFileId ? `minigram-media://media?id=${photoFileId}&v=${retryCount}` : null

  const handleError = () => {
    failedRef.current = true
    setImgFailed(true)
  }

  useEffect(() => {
    if (!failedRef.current) return
    if (latestReadyFileId == null || latestReadyFileId !== photoFileId) return
    failedRef.current = false
    setImgFailed(false)
    setRetryCount((c) => c + 1)
  }, [latestReadyFileId, photoFileId])

  if (src && !imgFailed) {
    return (
      <img
        src={src}
        onError={handleError}
        title={title}
        onClick={onClick}
        className={`flex-shrink-0 rounded-full object-cover ${className}`}
      />
    )
  }

  return (
    <div
      title={title}
      onClick={onClick}
      className={`flex flex-shrink-0 items-center justify-center rounded-full font-medium text-white ${className}`}
      style={{ backgroundColor: color }}
    >
      {initials}
    </div>
  )
}
