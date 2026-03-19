'use client'

import { useRef, useState, useEffect } from 'react'
import { Play, Pause, RotateCcw, RotateCw, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AudioPlayerProps {
  src: string
  title: string
}

export function AudioPlayer({ src, title }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const updateTime = () => {
      if (!isDragging) {
        setCurrentTime(audio.currentTime)
      }
    }

    const updateDuration = () => {
      setDuration(audio.duration)
      setIsLoading(false)
    }

    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }

    const handleError = (e: Event) => {
      console.error('Audio error:', e)
      setError('Unable to load audio file. Please try again later.')
      setIsLoading(false)
      setIsPlaying(false)
    }

    const handleCanPlay = () => {
      setIsLoading(false)
      setError(null)
    }

    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('loadedmetadata', updateDuration)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)
    audio.addEventListener('canplay', handleCanPlay)

    return () => {
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('loadedmetadata', updateDuration)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
      audio.removeEventListener('canplay', handleCanPlay)
    }
  }, [isDragging])

  const togglePlayPause = () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
    } else {
      audio.play()
    }
    setIsPlaying(!isPlaying)
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    if (!audio) return

    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = x / rect.width
    const newTime = percentage * duration

    audio.currentTime = newTime
    setCurrentTime(newTime)
  }

  const handleMouseDown = () => {
    setIsDragging(true)
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const skip = (seconds: number) => {
    const audio = audioRef.current
    if (!audio) return

    audio.currentTime = Math.max(0, Math.min(audio.currentTime + seconds, duration))
  }

  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00'
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const progressPercentage = duration ? (currentTime / duration) * 100 : 0

  return (
    <div className="w-full bg-gray-50 rounded-lg p-6">
      <audio ref={audioRef} src={src} preload="metadata" crossOrigin="anonymous" />

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-800 font-medium">Audio playback error</p>
            <p className="text-xs text-red-600 mt-1">{error}</p>
            <p className="text-xs text-red-600 mt-1">URL: {src}</p>
          </div>
        </div>
      )}

      {/* Loading Message */}
      {isLoading && !error && (
        <div className="mb-4 text-center text-sm text-gray-600">
          Loading audio...
        </div>
      )}

      {/* Progress Bar */}
      <div className="mb-4">
        <div
          className="relative w-full h-2 bg-gray-300 rounded-full cursor-pointer group"
          onClick={handleSeek}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div
            className="absolute top-0 left-0 h-full bg-[#dd1969] rounded-full transition-all"
            style={{ width: `${progressPercentage}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-[#dd1969] rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `calc(${progressPercentage}% - 8px)` }}
          />
        </div>
      </div>

      {/* Time Display */}
      <div className="flex justify-between text-sm text-gray-600 mb-4">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* Controls */}
      {!error && (
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => skip(-15)}
            className="hover:bg-gray-200"
            title="Rewind 15 seconds"
            disabled={isLoading}
          >
            <RotateCcw className="w-5 h-5" />
          </Button>

          <Button
            size="icon"
            onClick={togglePlayPause}
            className="w-12 h-12 rounded-full bg-[#dd1969] hover:bg-[#c01559]"
            disabled={isLoading}
          >
            {isPlaying ? (
              <Pause className="w-6 h-6 text-white fill-white" />
            ) : (
              <Play className="w-6 h-6 text-white fill-white ml-1" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => skip(15)}
            className="hover:bg-gray-200"
            title="Forward 15 seconds"
            disabled={isLoading}
          >
            <RotateCw className="w-5 h-5" />
          </Button>
        </div>
      )}

      {/* Fallback Link if Error */}
      {error && (
        <div className="text-center">
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-6 py-3 bg-[#dd1969] hover:bg-[#c01559] text-white font-semibold rounded-lg transition-colors"
          >
            Open Audio File
          </a>
        </div>
      )}

      {/* Title */}
      {!error && (
        <p className="text-center text-sm text-gray-700 mt-4 font-medium">
          {title}
        </p>
      )}
    </div>
  )
}
