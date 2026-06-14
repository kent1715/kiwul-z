'use client'

import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Loader2,
  Film,
  Check,
  AlertTriangle,
  Download,
  Settings,
  ShieldCheck,
  Mic2,
  Captions,
  Music,
} from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import { useToast } from '@/hooks/use-toast'

type TimelineEdit = {
  voOffset: number
  voVolume: number
  subtitleEnabled: boolean
  subtitleText: string
}

export default function RenderStep() {
  const { currentProject, scenes } = useAppStore()
  const { toast } = useToast()

  const [renderProgress, setRenderProgress] = useState(0)
  const [rendering, setRendering] = useState(false)
  const [renderComplete, setRenderComplete] = useState(false)
  const [qcResult, setQcResult] = useState<Record<string, unknown> | null>(null)
  const [qcRunning, setQcRunning] = useState(false)

  const [timelineEdits, setTimelineEdits] = useState<Record<string, TimelineEdit>>({})
  const [musicFileName, setMusicFileName] = useState('')
  const [musicVolume, setMusicVolume] = useState(18)

  const scenesWithVideo = scenes.filter((s) => s.video_status === 'completed')
  const scenesWithAudio = scenes.filter((s) => s.tts_status === 'completed')
  const scenesWithImage = scenes.filter((s) => s.image_status === 'completed')

  const readinessScore = scenes.length > 0
    ? Math.round(((scenesWithImage.length + scenesWithVideo.length + scenesWithAudio.length) / (scenes.length * 3)) * 100)
    : 0

  const qualityChecks = [
    { label: 'Images generated', count: scenesWithImage.length, total: scenes.length, ok: scenesWithImage.length === scenes.length && scenes.length > 0 },
    { label: 'Videos generated', count: scenesWithVideo.length, total: scenes.length, ok: scenesWithVideo.length === scenes.length && scenes.length > 0 },
    { label: 'Voice-over ready', count: scenesWithAudio.length, total: scenes.length, ok: scenesWithAudio.length === scenes.length && scenes.length > 0 },
    { label: 'All scenes locked', count: scenes.filter((s) => s.locked).length, total: scenes.length, ok: scenes.filter((s) => s.locked).length === scenes.length && scenes.length > 0 },
  ]

  const allChecksPassed = qualityChecks.every((c) => c.ok)

  const orderedScenes = useMemo(() => {
    return [...scenes].sort((a, b) => a.scene_number - b.scene_number)
  }, [scenes])

  const totalTimelineDuration = useMemo(() => {
    return orderedScenes.reduce((sum, scene) => sum + (Number(scene.duration) || 0), 0)
  }, [orderedScenes])

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

  function getSceneStart(index: number) {
    return orderedScenes.slice(0, index).reduce((sum, scene) => sum + (Number(scene.duration) || 0), 0)
  }

  const timelinePayload = {
    duration: totalTimelineDuration,
    music: {
      file_name: musicFileName,
      volume: musicVolume / 100,
      fade_in: 1,
      fade_out: 2,
    },
    tracks: {
      video: orderedScenes.map((scene, index) => {
        const start = getSceneStart(index)
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
        const start = getSceneStart(index)
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
          src: scene.tts_path || '',
        }
      }),
      subtitles: orderedScenes
        .filter((scene) => timelineEdits[scene.id]?.subtitleEnabled !== false)
        .map((scene, index) => {
          const start = getSceneStart(index)
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

  async function startRender() {
    if (!currentProject) return

    try {
      setRendering(true)
      setRenderProgress(0)
      setRenderComplete(false)

      const res = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: currentProject.id, timeline: timelinePayload }),
      })

      if (res.ok) {
        const data = await res.json()

        if (data.progress !== undefined) {
          setRenderProgress(data.progress)
        } else {
          setRenderProgress(100)
        }

        setRenderComplete(true)
        toast({ title: 'Render complete!', description: 'Your video is ready for download.' })
      } else {
        const err = await res.json()
        toast({ title: 'Render failed', description: err.error || 'Failed to render video', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to render video', variant: 'destructive' })
    } finally {
      setRendering(false)
    }
  }

  async function runQC() {
    if (!currentProject) return

    try {
      setQcRunning(true)
      const res = await fetch(`/api/projects/${currentProject.id}/qc`, { method: 'POST' })

      if (res.ok) {
        const data = await res.json()
        setQcResult(data)
        toast({ title: 'QC complete', description: data.summary || 'Quality check finished.' })
      } else {
        toast({ title: 'Error', description: 'Failed to run QC', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to run QC', variant: 'destructive' })
    } finally {
      setQcRunning(false)
    }
  }

  const downloadUrl = currentProject ? `/api/assets/projects/${currentProject.id}/final/final.mp4` : null

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Film className="h-5 w-5 text-primary" />
          Final Render
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Combine all assets into the final video
        </p>
      </div>

      {/* Quality Check */}
      <Card className="mb-6 card-hover border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Quality Check
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {qualityChecks.map((check) => (
            <div key={check.label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {check.ok ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                )}
                <span className="text-sm">{check.label}</span>
              </div>
              <Badge variant={check.ok ? 'default' : 'secondary'} className="text-[10px]">
                {check.count}/{check.total}
              </Badge>
            </div>
          ))}

          <div className="pt-2 border-t mt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">Overall Readiness</span>
              <span className="text-sm font-bold text-primary">{readinessScore}%</span>
            </div>
            <Progress value={readinessScore} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Export Info */}
      <Card className="mb-6 card-hover border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Export Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Resolution</span>
              <p className="font-medium">{currentProject?.resolution || '1080x1920'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Aspect Ratio</span>
              <p className="font-medium">{currentProject?.aspect_ratio || '9:16'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Duration</span>
              <p className="font-medium">{currentProject?.duration_seconds || 50}s</p>
            </div>
            <div>
              <span className="text-muted-foreground">Format</span>
              <p className="font-medium">MP4 (H.264)</p>
            </div>
            <div>
              <span className="text-muted-foreground">Scenes</span>
              <p className="font-medium">{scenes.length}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Platform</span>
              <p className="font-medium">{currentProject?.target_platform?.replace(/,/g, ', ') || 'TikTok'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline Editor */}
      <Card className="mb-6 card-hover border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Film className="h-4 w-4" />
            Timeline Editor
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Sync video, voice-over, subtitle, and background music before final render.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {orderedScenes.length === 0 ? (
            <div className="text-sm text-muted-foreground border rounded-lg p-4 text-center">
              No scenes available for timeline.
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>0s</span>
                  <span>Total: {totalTimelineDuration || currentProject?.duration_seconds || 0}s</span>
                </div>

                <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                  <TimelineTrack
                    label="VIDEO"
                    scenes={orderedScenes}
                    totalDuration={totalTimelineDuration}
                    className="bg-primary/15"
                    getText={(scene) => `S${scene.scene_number}`}
                  />

                  <TimelineTrack
                    label="VO"
                    icon={<Mic2 className="h-3 w-3" />}
                    scenes={orderedScenes}
                    totalDuration={totalTimelineDuration}
                    className="bg-blue-500/15"
                    getText={(scene) => `VO ${scene.scene_number}`}
                  />

                  <TimelineTrack
                    label="SUB"
                    icon={<Captions className="h-3 w-3" />}
                    scenes={orderedScenes}
                    totalDuration={totalTimelineDuration}
                    className="bg-emerald-500/15"
                    getText={(scene) => {
                      const enabled = timelineEdits[scene.id]?.subtitleEnabled !== false
                      return enabled ? `SUB ${scene.scene_number}` : 'OFF'
                    }}
                  />

                  <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-3 items-center">
                    <div className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                      <Music className="h-3 w-3" />
                      MUSIC
                    </div>
                    <div className="flex h-9 items-center rounded-md border bg-purple-500/15 px-3 text-[10px]">
                      {musicFileName ? musicFileName : 'No background music selected'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {orderedScenes.map((scene, index) => {
                  const edit = timelineEdits[scene.id] || {
                    voOffset: 0,
                    voVolume: 100,
                    subtitleEnabled: true,
                    subtitleText: scene.vo || '',
                  }

                  const start = getSceneStart(index)
                  const duration = Number(scene.duration) || 0

                  return (
                    <div key={`edit-${scene.id}`} className="rounded-lg border bg-card p-3 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">Scene {scene.scene_number}</p>
                          <p className="text-xs text-muted-foreground">
                            {start}s - {start + duration}s
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-[10px]">
                          {scene.duration}s
                        </Badge>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">VO Offset</span>
                          <span className="font-medium">{(edit.voOffset / 10).toFixed(1)}s</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => updateTimelineEdit(scene.id, { voOffset: Math.max(edit.voOffset - 1, -20) })}
                          >
                            -0.1s
                          </Button>
                          <input
                            type="range"
                            min="-20"
                            max="20"
                            value={edit.voOffset}
                            onChange={(e) => updateTimelineEdit(scene.id, { voOffset: Number(e.target.value) })}
                            className="w-full"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => updateTimelineEdit(scene.id, { voOffset: Math.min(edit.voOffset + 1, 20) })}
                          >
                            +0.1s
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">VO Volume</span>
                          <span className="font-medium">{edit.voVolume}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="150"
                          value={edit.voVolume}
                          onChange={(e) => updateTimelineEdit(scene.id, { voVolume: Number(e.target.value) })}
                          className="w-full"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-xs font-medium">
                          <input
                            type="checkbox"
                            checked={edit.subtitleEnabled}
                            onChange={(e) => updateTimelineEdit(scene.id, { subtitleEnabled: e.target.checked })}
                          />
                          Subtitle aktif
                        </label>
                        <textarea
                          value={edit.subtitleText}
                          onChange={(e) => updateTimelineEdit(scene.id, { subtitleText: e.target.value })}
                          rows={2}
                          className="w-full rounded-md border bg-background p-2 text-xs"
                          placeholder="Subtitle text..."
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Music className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-semibold">Background Music</p>
                    <p className="text-xs text-muted-foreground">
                      Phase 1 stores file name and volume. Real upload and ffmpeg mixing will be connected in the next patch.
                    </p>
                  </div>
                </div>

                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => setMusicFileName(e.target.files?.[0]?.name || '')}
                  className="block w-full text-xs"
                />

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Music Volume</span>
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
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Render Progress */}
      {rendering && (
        <Card className="mb-6 border-primary/40">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="font-medium">Rendering in progress...</span>
            </div>
            <Progress value={renderProgress} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1">{Math.round(renderProgress)}% complete</p>
          </CardContent>
        </Card>
      )}

      {/* QC Result */}
      {qcResult && (
        <Card className="mb-6 border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              QC Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(qcResult).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
                  <span className="font-medium">{typeof value === 'boolean' ? (value ? 'Pass' : 'Fail') : String(value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button
          size="lg"
          onClick={startRender}
          disabled={rendering || scenes.length === 0}
          className="flex-1 gap-2"
        >
          {rendering ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Rendering...
            </>
          ) : (
            <>
              <Film className="h-5 w-5" />
              Start Render
            </>
          )}
        </Button>

        {renderComplete && downloadUrl && (
          <Button size="lg" variant="outline" className="gap-2" asChild>
            <a href={downloadUrl} download>
              <Download className="h-5 w-5" />
              Download
            </a>
          </Button>
        )}
      </div>

      {/* QC Button */}
      <div className="mt-3">
        <Button
          variant="outline"
          onClick={runQC}
          disabled={qcRunning || !currentProject}
          className="gap-2 w-full"
        >
          {qcRunning ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Running QC...
            </>
          ) : (
            <>
              <ShieldCheck className="h-4 w-4" />
              Run Quality Check
            </>
          )}
        </Button>
      </div>

      {!allChecksPassed && scenes.length > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-3 text-center">
          Some quality checks have not passed. You can still render, but the output may be incomplete.
        </p>
      )}
    </div>
  )
}

function TimelineTrack({
  label,
  icon,
  scenes,
  totalDuration,
  className,
  getText,
}: {
  label: string
  icon?: React.ReactNode
  scenes: Array<{
    id: string
    scene_number: number
    duration: number
  }>
  totalDuration: number
  className: string
  getText: (scene: { id: string; scene_number: number; duration: number }) => string
}) {
  return (
    <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-3 items-center">
      <div className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="flex h-9 overflow-hidden rounded-md border bg-background">
        {scenes.map((scene) => {
          const duration = Number(scene.duration) || 0
          const width = totalDuration > 0 ? (duration / totalDuration) * 100 : 0

          return (
            <div
              key={`${label}-${scene.id}`}
              className={`flex items-center justify-center border-r px-2 text-[10px] font-medium ${className}`}
              style={{ width: `${width}%` }}
              title={`Scene ${scene.scene_number} - ${duration}s`}
            >
              {getText(scene)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
