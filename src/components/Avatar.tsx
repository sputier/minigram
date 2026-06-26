import { useEffect, useRef, useState } from 'react'

interface AvatarProps {
  photoFileId?: number | null
  initials: string
  color: string
  className?: string
  title?: string
  version?: number
}

export default function Avatar({ photoFileId, initials, color, className = '', title, version = 0 }: AvatarProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  // Ref pour lire l'état d'échec dans l'effet sans l'ajouter aux deps
  // (évite de re-setter src pour les avatars qui s'affichent déjà correctement)
  const failedRef = useRef(false)

  const src = photoFileId ? `minigram-media://media?id=${photoFileId}&v=${retryCount}` : null

  const handleError = () => {
    failedRef.current = true
    setImgFailed(true)
  }

  useEffect(() => {
    if (!failedRef.current) return
    failedRef.current = false
    setImgFailed(false)
    setRetryCount((c) => c + 1)
  }, [version])

  if (src && !imgFailed) {
    return (
      <img
        src={src}
        onError={handleError}
        title={title}
        className={`flex-shrink-0 rounded-full object-cover ${className}`}
      />
    )
  }

  return (
    <div
      title={title}
      className={`flex flex-shrink-0 items-center justify-center rounded-full font-medium text-white ${className}`}
      style={{ backgroundColor: color }}
    >
      {initials}
    </div>
  )
}
