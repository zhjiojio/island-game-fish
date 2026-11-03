import { useState } from 'react'
import type { StoryMedia } from '../story/types'

interface MediaStageProps {
  media: StoryMedia
  title: string
  muted: boolean
  onReady: () => void
}

export function MediaStage({ media, title, muted, onReady }: MediaStageProps) {
  const [failed, setFailed] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  if (media.kind !== 'video') {
    return (
      <div className="media-stage media-stage--still">
        <img src={media.src} alt={`${title}剧情画面`} />
      </div>
    )
  }

  if (failed) {
    return (
      <div className="media-stage media-stage--fallback">
        <img src={media.poster ?? media.src} alt={`${title}剧情画面`} />
        <div className="media-fallback" role="status">
          <strong>片段暂时无法播放</strong>
          <span>你仍可阅读剧情摘要并继续改写命运。</span>
          <div className="media-fallback__actions">
            <button
              type="button"
              onClick={() => {
                setFailed(false)
                setRetryKey((value) => value + 1)
              }}
            >
              重试片段
            </button>
            <button type="button" onClick={onReady}>
              看剧情摘要并继续
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="media-stage">
      <video
        key={retryKey}
        data-testid="story-video"
        src={media.src}
        poster={media.poster}
        muted={muted}
        playsInline
        autoPlay
        onEnded={onReady}
        onError={() => setFailed(true)}
      />
      <button className="media-skip" type="button" onClick={onReady}>
        跳过片段，进入抉择
      </button>
    </div>
  )
}
