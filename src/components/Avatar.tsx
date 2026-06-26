import { useEffect, useState } from 'react'

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
  const src = photoFileId ? `minigram-media://media?id=${photoFileId}&v=${version}` : null

  useEffect(() => {
    setImgFailed(false)
  }, [src])

  if (src && !imgFailed) {
    return (
      <img
        src={src}
        onError={() => setImgFailed(true)}
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
