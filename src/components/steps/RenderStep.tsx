'use client'

import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Sparkles,
  Loader2,
  Film,
  Check,
  AlertTriangle,
  Download,
  Settings,
  ShieldCheck,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useToast } from '@/hooks/use-toast'

export default function RenderStep() {
  const { currentProject, scenes, generating, setGenerating } = useAppStore()
  const { toast } = useToast()
  const [renderProgress, setRenderProgress] = useState(0)
  const [rendering, setRendering] = useState(false)
  const [renderComplete, setRenderComplete] = useState(false)
  const [qcResult, setQcResult] = useState<Record<string, unknown> | null>(null)
  const [qcRunning, setQcRunning] = useState(false)

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

  async function startRender() {
    if (!currentProject) return
    try {
      setRendering(true)
      setRenderProgress(0)
      setRenderComplete(false)

      const res = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: currentProject.id }),
      })

      if (res.ok) {
        const data = await res.json()
        // If the API returns progress info, use it; otherwise mark complete
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
    <div className="p-6 max-w-2xl mx-auto">
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
                  <span className="font-medium">{typeof value === 'boolean' ? (value ? '✓ Pass' : '✗ Fail') : String(value)}</span>
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
