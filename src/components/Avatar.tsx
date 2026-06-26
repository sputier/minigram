import { useState } from 'react'

interface AvatarProps {
  photoFileId?: number | null
  initials: string
  color: string
  className?: string
  title?: string
}

export default function Avatar({ photoFileId, initials, color, className = '', title }: AvatarProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const src = photoFileId ? `minigram-media://media?id=${photoFileId}&v=0` : null

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
