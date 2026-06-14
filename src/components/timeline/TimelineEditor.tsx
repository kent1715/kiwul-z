'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Captions,
  Film,
  Image as ImageIcon,
  Mic2,
  Music,
  Pause,
  Play,
  Scissors,
  Volume2,
} from 'lucide-react'
import type { TimelineEdit, TimelinePayload, TimelineScene } from './timeline-types'

type TimelineEditorProps = {
  scenes: TimelineScene[]
  projectDuration?: number
  onTimelineChange?: (payload: TimelinePayload) => void
}

export default function TimelineEditor({
  scenes,
  projectDuration,
  onTimelineChange,
}: TimelineEditorProps) {
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null)
  const [timelineEdits, setTimelineEdits] = useState<Record<string, TimelineEdit>>({})
  const [musicFileName, setMusicFileName] = useState('')
  const [musicVolume, setMusicVolume] = useState(18)
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)

  const previewVideoRef = useRef<HTMLVideoElement | null>(null)

  const orderedScenes = useMemo(() => {
    return [...scenes].sort((a, b) => {
      const partDiff = Number(a.part_number || 1) - Number(b.part_number || 1)
      if (partDiff !== 0) return partDiff
      return Number(a.scene_number || 0) - Number(b.scene_number || 0)
    })
  }, [scenes])

  const totalDuration = useMemo(() => {
    const sum = orderedScenes.reduce((acc, scene) => acc + (Number(scene.duration) || 0), 0)
    return sum || Number(projectDuration) || 0
  }, [orderedScenes, projectDuration])

  useEffect(() => {
    setTimelineEdits((prev) => {
      const next: Record<string, TimelineEdit> = { ...prev }
      const validIds = new Set(orderedScenes.map((scene) => scene.id))

      orderedScenes.forEach((scene) => {
        if (!next[scene.id]) {
          next[scene.id] = {
            voOffset: 0,
            voVolume: 100,
            subtitleEnabled: true,
            subtitleText: scene.vo || '',
          }
        } else if (!next[scene.id].subtitleText && scene.vo) {
          next[scene.id] = {
            ...next[scene.id],
            subtitleText: scene.vo,
          }
        }
      })

      Object.keys(next).forEach((id) => {
        if (!validIds.has(id)) delete next[id]
      })

      return next
    })
  }, [orderedScenes])

  useEffect(() => {
    if (orderedScenes.length === 0) {
      setSelectedSceneId(null)
      setPlayhead(0)
      return
    }

    const exists = selectedSceneId
      ? orderedScenes.some((scene) => scene.id === selectedSceneId)
      : false

    if (!exists) {
      setSelectedSceneId(orderedScenes[0].id)
      setPlayhead(getSceneStart(orderedScenes, 0))
    }
  }, [orderedScenes, selectedSceneId])

  const selectedScene = selectedSceneId
    ? orderedScenes.find((scene) => scene.id === selectedSceneId) || orderedScenes[0]
    : orderedScenes[0]

  const selectedSceneIndex = selectedScene
    ? orderedScenes.findIndex((scene) => scene.id === selectedScene.id)
    : -1

  const selectedSceneStart = selectedSceneIndex >= 0 ? getSceneStart(orderedScenes, selectedSceneIndex) : 0
  const selectedSceneDuration = selectedScene ? Number(selectedScene.duration) || 0 : 0

  const selectedEdit = selectedScene
    ? timelineEdits[selectedScene.id] || {
        voOffset: 0,
        voVolume: 100,
        subtitleEnabled: true,
        subtitleText: selectedScene.vo || '',
      }
    : null

  const timelinePayload = useMemo<TimelinePayload>(() => {
    return {
      duration: totalDuration,
      music: {
        file_name: musicFileName,
        volume: musicVolume / 100,
        fade_in: 1,
        fade_out: 2,
      },
      tracks: {
        video: orderedScenes.map((scene, index) => {
          const start = getSceneStart(orderedScenes, index)
          const duration = Number(scene.duration) || 0

          return {
            scene_id: scene.id,
            scene_number: scene.scene_number,
            start,
            end: start + duration,
            duration,
            src: scene.video_path || '',
          }
        }),
        voice: orderedScenes.map((scene, index) => {
          const edit = timelineEdits[scene.id]
          const start = getSceneStart(orderedScenes, index)
          const duration = Number(scene.duration) || 0
          const offset = (edit?.voOffset || 0) / 10

          return {
            scene_id: scene.id,
            scene_number: scene.scene_number,
            start: start + offset,
            end: start + duration + offset,
            offset,
            volume: (edit?.voVolume ?? 100) / 100,
            text: scene.vo || '',
            src: scene.audio_path || scene.tts_path || '',
          }
        }),
        subtitles: orderedScenes
          .filter((scene) => timelineEdits[scene.id]?.subtitleEnabled !== false)
          .map((scene, index) => {
            const start = getSceneStart(orderedScenes, index)
            const duration = Number(scene.duration) || 0

            return {
              scene_id: scene.id,
              scene_number: scene.scene_number,
              start,
              end: start + duration,
              text: timelineEdits[scene.id]?.subtitleText || scene.vo || '',
            }
          }),
      },
    }
  }, [orderedScenes, timelineEdits, musicFileName, musicVolume, totalDuration])

  useEffect(() => {
    onTimelineChange?.(timelinePayload)
  }, [timelinePayload, onTimelineChange])

  function updateTimelineEdit(sceneId: string, patch: Partial<TimelineEdit>) {
    setTimelineEdits((prev) => ({
      ...prev,
      [sceneId]: {
        ...(prev[sceneId] || {
          voOffset: 0,
          voVolume: 100,
          subtitleEnabled: true,
          subtitleText: '',
        }),
        ...patch,
      },
    }))
  }

  function selectScene(scene: TimelineScene, index: number) {
    setSelectedSceneId(scene.id)
    setPlayhead(getSceneStart(orderedScenes, index))
    setPlaying(false)

    const video = previewVideoRef.current
    if (video) {
      video.pause()
      video.currentTime = 0
    }
  }

  async function playSelectedScene() {
    if (!selectedScene?.video_path || !previewVideoRef.current) return

    try {
      const video = previewVideoRef.current
      video.currentTime = 0
      setPlaying(true)
      await video.play()
    } catch {
      setPlaying(false)
    }
  }

  function pauseSelectedScene() {
    const video = previewVideoRef.current
    if (video) video.pause()
    setPlaying(false)
  }

  function handleVideoTimeUpdate() {
    const video = previewVideoRef.current
    if (!video || !selectedScene) return
    setPlayhead(selectedSceneStart + video.currentTime)
  }

  function handleTimelineClick(event: React.MouseEvent<HTMLDivElement>) {
    if (totalDuration <= 0 || orderedScenes.length === 0) return

    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const ratio = Math.min(Math.max(x / rect.width, 0), 1)
    const time = ratio * totalDuration

    const index = findSceneIndexAtTime(orderedScenes, time)
    const scene = orderedScenes[index]
    if (scene) selectScene(scene, index)

    setPlayhead(time)
  }

  if (orderedScenes.length === 0) {
    return (
      <Card className="mb-6 card-hover border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Scissors className="h-4 w-4" />
            Timeline Editor
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Sync video, voice-over, subtitle, and background music before final render.
          </p>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground border rounded-lg p-4 text-center">
            No scenes available for timeline.
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="mb-6 card-hover border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Scissors className="h-4 w-4" />
          Timeline Editor
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Premiere-like v1: preview scene, inspect VO/subtitle, and prepare timeline data for final render.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* Viewer */}
          <div className="rounded-lg border bg-card p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">
                  Program Viewer
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatTime(playhead)} / {formatTime(totalDuration)}
                </p>
              </div>
              {selectedScene && (
                <Badge variant="secondary" className="text-[10px]">
                  Scene {selectedScene.scene_number}
                </Badge>
              )}
            </div>

            <div className="relative aspect-[9/16] overflow-hidden rounded-lg border bg-black">
              {selectedScene?.video_path ? (
                <video
                  key={selectedScene.id}
                  ref={previewVideoRef}
                  src={selectedScene.video_path}
                  className="h-full w-full object-cover"
                  playsInline
                  onTimeUpdate={handleVideoTimeUpdate}
                  onEnded={() => setPlaying(false)}
                />
              ) : selectedScene?.image_path ? (
                <img
                  src={selectedScene.image_path}
                  alt={`Scene ${selectedScene.scene_number}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground">
                  <ImageIcon className="h-9 w-9 opacity-40" />
                  <span>Belum ada image/video preview</span>
                </div>
              )}

              {selectedEdit?.subtitleEnabled && selectedEdit.subtitleText && (
                <div className="absolute bottom-5 left-3 right-3 rounded bg-black/75 px-3 py-2 text-center text-sm font-semibold text-white shadow">
                  {selectedEdit.subtitleText}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                onClick={playing ? pauseSelectedScene : playSelectedScene}
                disabled={!selectedScene?.video_path}
                className="flex-1 gap-2"
              >
                {playing ? (
                  <>
                    <Pause className="h-4 w-4" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Play Scene
                  </>
                )}
              </Button>
            </div>

            {!selectedScene?.video_path && (
              <p className="text-[11px] text-muted-foreground text-center">
                Play aktif setelah video scene selesai digenerate.
              </p>
            )}
          </div>

          {/* Timeline + Inspector */}
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>0s</span>
                <span>Total: {formatTime(totalDuration)}</span>
              </div>

              <div className="relative space-y-2" onClick={handleTimelineClick}>
                <TimelinePlayhead playhead={playhead} totalDuration={totalDuration} />

                <TrackRow
                  label="VIDEO"
                  icon={<Film className="h-3 w-3" />}
                  scenes={orderedScenes}
                  totalDuration={totalDuration}
                  selectedSceneId={selectedScene?.id}
                  className="bg-primary/20"
                  getText={(scene) => `S${scene.scene_number}`}
                  onSelect={selectScene}
                />

                <TrackRow
                  label="VO"
                  icon={<Mic2 className="h-3 w-3" />}
                  scenes={orderedScenes}
                  totalDuration={totalDuration}
                  selectedSceneId={selectedScene?.id}
                  className="bg-blue-500/20"
                  getText={(scene) => `VO${scene.scene_number}`}
                  onSelect={selectScene}
                />

                <TrackRow
                  label="SUB"
                  icon={<Captions className="h-3 w-3" />}
                  scenes={orderedScenes}
                  totalDuration={totalDuration}
                  selectedSceneId={selectedScene?.id}
                  className="bg-emerald-500/20"
                  getText={(scene) => {
                    const enabled = timelineEdits[scene.id]?.subtitleEnabled !== false
                    return enabled ? `SUB${scene.scene_number}` : 'OFF'
                  }}
                  onSelect={selectScene}
                />

                <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-3 items-center">
                  <div className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                    <Music className="h-3 w-3" />
                    MUSIC
                  </div>
                  <div className="h-9 rounded-md border bg-purple-500/20 px-3 text-[10px] flex items-center">
                    {musicFileName || 'No background music selected'}
                  </div>
                </div>
              </div>
            </div>

            {selectedScene && selectedEdit && (
              <div className="rounded-lg border bg-card p-3 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      Inspector — Scene {selectedScene.scene_number}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatTime(selectedSceneStart)} - {formatTime(selectedSceneStart + selectedSceneDuration)}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    {selectedScene.duration}s
                  </Badge>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <InfoBlock label="Action" value={selectedScene.action || 'No action'} />
                  <InfoBlock label="VO" value={selectedScene.vo || 'No voice-over'} italic />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">VO Offset</span>
                    <span className="font-medium">{(selectedEdit.voOffset / 10).toFixed(1)}s</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        updateTimelineEdit(selectedScene.id, {
                          voOffset: Math.max(selectedEdit.voOffset - 1, -20),
                        })
                      }
                    >
                      -0.1s
                    </Button>
                    <input
                      type="range"
                      min="-20"
                      max="20"
                      value={selectedEdit.voOffset}
                      onChange={(e) =>
                        updateTimelineEdit(selectedScene.id, {
                          voOffset: Number(e.target.value),
                        })
                      }
                      className="w-full"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        updateTimelineEdit(selectedScene.id, {
                          voOffset: Math.min(selectedEdit.voOffset + 1, 20),
                        })
                      }
                    >
                      +0.1s
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Volume2 className="h-3 w-3" />
                      VO Volume
                    </span>
                    <span className="font-medium">{selectedEdit.voVolume}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="150"
                    value={selectedEdit.voVolume}
                    onChange={(e) =>
                      updateTimelineEdit(selectedScene.id, {
                        voVolume: Number(e.target.value),
                      })
                    }
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs font-medium">
                    <input
                      type="checkbox"
                      checked={selectedEdit.subtitleEnabled}
                      onChange={(e) =>
                        updateTimelineEdit(selectedScene.id, {
                          subtitleEnabled: e.target.checked,
                        })
                      }
                    />
                    Subtitle aktif
                  </label>
                  <textarea
                    value={selectedEdit.subtitleText}
                    onChange={(e) =>
                      updateTimelineEdit(selectedScene.id, {
                        subtitleText: e.target.value,
                      })
                    }
                    rows={3}
                    className="w-full rounded-md border bg-background p-2 text-xs"
                    placeholder="Subtitle text..."
                  />
                </div>

                <div className="rounded-md border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Music className="h-3 w-3" />
                      Music Volume
                    </span>
                    <span className="font-medium">{musicVolume}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={musicVolume}
                    onChange={(e) => setMusicVolume(Number(e.target.value))}
                    className="w-full"
                  />
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) => setMusicFileName(e.target.files?.[0]?.name || '')}
                    className="block w-full text-xs"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function TrackRow({
  label,
  icon,
  scenes,
  totalDuration,
  selectedSceneId,
  className,
  getText,
  onSelect,
}: {
  label: string
  icon: React.ReactNode
  scenes: TimelineScene[]
  totalDuration: number
  selectedSceneId?: string
  className: string
  getText: (scene: TimelineScene) => string
  onSelect: (scene: TimelineScene, index: number) => void
}) {
  return (
    <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-3 items-center">
      <div className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="flex h-9 overflow-hidden rounded-md border bg-background">
        {scenes.map((scene, index) => {
          const duration = Number(scene.duration) || 0
          const width = totalDuration > 0 ? (duration / totalDuration) * 100 : 0
          const selected = selectedSceneId === scene.id

          return (
            <button
              key={`${label}-${scene.id}`}
              type="button"
              className={`flex h-full items-center justify-center border-r px-2 text-[10px] font-medium transition hover:brightness-125 ${className} ${selected ? 'ring-2 ring-primary ring-inset' : ''}`}
              style={{ width: `${width}%` }}
              title={`Scene ${scene.scene_number} - ${duration}s`}
              onClick={(event) => {
                event.stopPropagation()
                onSelect(scene, index)
              }}
            >
              {getText(scene)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TimelinePlayhead({
  playhead,
  totalDuration,
}: {
  playhead: number
  totalDuration: number
}) {
  const left = totalDuration > 0 ? Math.min(Math.max((playhead / totalDuration) * 100, 0), 100) : 0

  return (
    <div
      className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-red-500"
      style={{ left: `calc(80px + 0.75rem + ${left}% * (1 - 0.0))` }}
    >
      <div className="-ml-1.5 h-3 w-3 rounded-full bg-red-500" />
    </div>
  )
}

function InfoBlock({
  label,
  value,
  italic,
}: {
  label: string
  value: string
  italic?: boolean
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-2">
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <p className={`text-sm ${italic ? 'italic' : ''}`}>
        {value}
      </p>
    </div>
  )
}

function getSceneStart(scenes: TimelineScene[], index: number) {
  return scenes.slice(0, index).reduce((sum, scene) => sum + (Number(scene.duration) || 0), 0)
}

function findSceneIndexAtTime(scenes: TimelineScene[], time: number) {
  let cursor = 0

  for (let i = 0; i < scenes.length; i++) {
    const duration = Number(scenes[i].duration) || 0
    if (time >= cursor && time < cursor + duration) return i
    cursor += duration
  }

  return Math.max(scenes.length - 1, 0)
}

function formatTime(seconds: number) {
  const safe = Math.max(Number(seconds) || 0, 0)
  const mins = Math.floor(safe / 60)
  const secs = Math.floor(safe % 60)
  const tenths = Math.floor((safe % 1) * 10)

  if (safe < 60) return `${secs}.${tenths}s`
  return `${mins}:${String(secs).padStart(2, '0')}.${tenths}`
}
