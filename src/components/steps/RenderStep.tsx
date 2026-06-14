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
  Save,
} from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import { useToast } from '@/hooks/use-toast'
import TimelineEditor from '@/components/timeline/TimelineEditor'
import type { TimelinePayload, TimelineScene } from '@/components/timeline/timeline-types'

export default function RenderStep() {
  const { currentProject, scenes } = useAppStore()
  const { toast } = useToast()

  const [renderProgress, setRenderProgress] = useState(0)
  const [rendering, setRendering] = useState(false)
  const [renderComplete, setRenderComplete] = useState(false)
  const [qcResult, setQcResult] = useState<Record<string, unknown> | null>(null)
  const [qcRunning, setQcRunning] = useState(false)
  const [fetchedScenes, setFetchedScenes] = useState<TimelineScene[]>([])
  const [timelinePayload, setTimelinePayload] = useState<TimelinePayload | null>(null)
  const [savedTimeline, setSavedTimeline] = useState<TimelinePayload | null>(null)
  const [savingTimeline, setSavingTimeline] = useState(false)
  const [timelineDirty, setTimelineDirty] = useState(false)

  useEffect(() => {
    if (!currentProject?.id) return
    if (scenes.length > 0) return

    let cancelled = false

    async function fetchProjectScenes() {
      try {
        const res = await fetch(`/api/scenes?project_id=${encodeURIComponent(currentProject.id)}`)
        if (!res.ok) return

        const data = await res.json()
        if (!cancelled && Array.isArray(data)) {
          setFetchedScenes(data)
        }
      } catch {
        // Render page should stay usable even if this fetch fails.
      }
    }

    fetchProjectScenes()

    return () => {
      cancelled = true
    }
  }, [currentProject?.id, scenes.length])

  useEffect(() => {
    if (!currentProject?.id) return

    let cancelled = false

    async function loadTimeline() {
      try {
        const res = await fetch(`/api/render/timeline?project_id=${encodeURIComponent(currentProject.id)}`)
        if (!res.ok) return

        const data = await res.json()
        if (!cancelled && data?.success && data.timeline) {
          setSavedTimeline(data.timeline)
          setTimelineDirty(false)
        }
      } catch {
        // Timeline load should not block render page.
      }
    }

    loadTimeline()

    return () => {
      cancelled = true
    }
  }, [currentProject?.id])

  function handleTimelineChange(payload: TimelinePayload) {
    setTimelinePayload(payload)
    setTimelineDirty(true)
  }

  async function saveTimeline() {
    if (!currentProject?.id || !timelinePayload) return

    try {
      setSavingTimeline(true)

      const res = await fetch('/api/render/timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: currentProject.id,
          timeline: timelinePayload,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        toast({
          title: 'Save failed',
          description: data.error || 'Failed to save timeline',
          variant: 'destructive',
        })
        return
      }

      setSavedTimeline(timelinePayload)
      setTimelineDirty(false)
      toast({
        title: 'Timeline saved',
        description: 'Timeline settings have been saved to this project.',
      })
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to save timeline',
        variant: 'destructive',
      })
    } finally {
      setSavingTimeline(false)
    }
  }

  const effectiveScenes = useMemo<TimelineScene[]>(() => {
    return scenes.length > 0 ? (scenes as TimelineScene[]) : fetchedScenes
  }, [scenes, fetchedScenes])

  const scenesWithVideo = effectiveScenes.filter((s) => s.video_status === 'completed')
  const scenesWithAudio = effectiveScenes.filter((s) => s.tts_status === 'completed')
  const scenesWithImage = effectiveScenes.filter((s) => s.image_status === 'completed')

  const readinessScore = effectiveScenes.length > 0
    ? Math.round(((scenesWithImage.length + scenesWithVideo.length + scenesWithAudio.length) / (effectiveScenes.length * 3)) * 100)
    : 0

  const qualityChecks = [
    { label: 'Images generated', count: scenesWithImage.length, total: effectiveScenes.length, ok: scenesWithImage.length === effectiveScenes.length && effectiveScenes.length > 0 },
    { label: 'Videos generated', count: scenesWithVideo.length, total: effectiveScenes.length, ok: scenesWithVideo.length === effectiveScenes.length && effectiveScenes.length > 0 },
    { label: 'Voice-over ready', count: scenesWithAudio.length, total: effectiveScenes.length, ok: scenesWithAudio.length === effectiveScenes.length && effectiveScenes.length > 0 },
    {
      label: 'All scenes locked',
      count: effectiveScenes.filter((s) => s.locked).length,
      total: effectiveScenes.length,
      ok: effectiveScenes.filter((s) => s.locked).length === effectiveScenes.length && effectiveScenes.length > 0,
    },
  ]

  const allChecksPassed = qualityChecks.every((c) => c.ok)

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
    <div className="p-6 max-w-6xl mx-auto">
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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
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
              <p className="font-medium">{effectiveScenes.length}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Platform</span>
              <p className="font-medium">{currentProject?.target_platform?.replace(/,/g, ', ') || 'TikTok'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <TimelineEditor
        scenes={effectiveScenes}
        projectDuration={currentProject?.duration_seconds || undefined}
        initialTimeline={savedTimeline}
        onTimelineChange={handleTimelineChange}
      />

      <Card className="mb-6 border-border/50">
        <CardContent className="p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold">Timeline Save</p>
            <p className="text-xs text-muted-foreground">
              {timelineDirty
                ? 'You have unsaved timeline changes.'
                : savedTimeline
                  ? 'Timeline is saved.'
                  : 'No saved timeline yet.'}
            </p>
          </div>

          <Button
            type="button"
            onClick={saveTimeline}
            disabled={savingTimeline || !timelinePayload || !currentProject}
            className="gap-2"
          >
            {savingTimeline ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Timeline
              </>
            )}
          </Button>
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
          disabled={rendering || effectiveScenes.length === 0}
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

      {!allChecksPassed && effectiveScenes.length > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-3 text-center">
          Some quality checks have not passed. You can still render, but the output may be incomplete.
        </p>
      )}
    </div>
  )
}


