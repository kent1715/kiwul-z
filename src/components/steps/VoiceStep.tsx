'use client'

import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import {
  Sparkles,
  Loader2,
  Mic,
  Play,
  Pause,
  Volume2,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useToast } from '@/hooks/use-toast'

export default function VoiceStep() {
  const { currentProject, scenes, setScenes, generating, setGenerating } = useAppStore()
  const { toast } = useToast()
  const [generatingScenes, setGeneratingScenes] = useState<Set<string>>(new Set())
  const [speed, setSpeed] = useState(1.0)
  const [playingScene, setPlayingScene] = useState<string | null>(null)

  useEffect(() => {
    if (currentProject) {
      fetchScenes()
    }
  }, [currentProject])

  async function fetchScenes() {
    if (!currentProject) return
    try {
      const res = await fetch(`/api/scenes?project_id=${currentProject.id}`)
      if (res.ok) {
        const data = await res.json()
        setScenes(data)
      }
    } catch {
      // silently fail
    }
  }

  async function generateAllVoice() {
    if (!currentProject) return
    try {
      setGenerating(true)
      const res = await fetch('/api/voice/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: currentProject.id, speed }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.scenes) setScenes(data.scenes)
        toast({ title: 'Voice-over generated!', description: 'All scene audio has been created.' })
      } else {
        toast({ title: 'Error', description: 'Failed to generate voice-over', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to generate voice-over', variant: 'destructive' })
    } finally {
      setGenerating(false)
    }
  }

  async function generateSceneVoice(sceneId: string) {
    try {
      setGeneratingScenes((prev) => new Set(prev).add(sceneId))
      const res = await fetch('/api/voice/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: currentProject?.id, sceneId, speed }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.scene) {
          setScenes(scenes.map((s) => (s.id === sceneId ? { ...s, ...data.scene } : s)))
        }
        toast({ title: 'Voice generated!' })
      } else {
        toast({ title: 'Error', description: 'Failed to generate voice', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to generate voice', variant: 'destructive' })
    } finally {
      setGeneratingScenes((prev) => {
        const next = new Set(prev)
        next.delete(sceneId)
        return next
      })
    }
  }

  const scenesWithAudio = scenes.filter((s) => s.audio_path)
  const scenesWithVo = scenes.filter((s) => s.vo)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Mic className="h-5 w-5 text-primary" />
            Voice-Over
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Generate TTS audio for each scene
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Speed: {speed.toFixed(1)}x</span>
            <Slider
              value={[speed]}
              onValueChange={([v]) => setSpeed(v)}
              min={0.5}
              max={2.0}
              step={0.1}
              className="w-24"
            />
          </div>
          <Button onClick={generateAllVoice} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate All
          </Button>
        </div>
      </div>

      {scenes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/5 flex items-center justify-center mb-4">
            <Mic className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No scenes found</h3>
          <p className="text-muted-foreground text-sm max-w-sm">
            Generate a storyboard first to create voice-over audio.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {scenes.length > 0 && (
            <div className="flex items-center gap-3 mb-2">
              <Badge variant="secondary">
                {scenesWithAudio.length} / {scenesWithVo.length} audio files
              </Badge>
            </div>
          )}

          <div className="space-y-3">
            {scenes
              .sort((a, b) => a.scene_number - b.scene_number)
              .map((scene) => (
                <Card key={scene.id} className="card-hover border-border/50">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      {/* Scene Number */}
                      <div className="w-12 h-12 rounded-lg bg-primary/5 flex items-center justify-center shrink-0">
                        <span className="font-bold text-primary">{scene.scene_number}</span>
                      </div>

                      {/* VO Text */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">Scene {scene.scene_number}</span>
                          <Badge variant="outline" className="text-[9px]">
                            {scene.start_time}-{scene.end_time}s
                          </Badge>
                        </div>
                        {scene.vo ? (
                          <p className="text-sm text-muted-foreground line-clamp-3">{scene.vo}</p>
                        ) : (
                          <p className="text-xs text-muted-foreground italic">No voice-over text</p>
                        )}

                        {/* Audio Player Placeholder */}
                        {scene.audio_path ? (
                          <div className="flex items-center gap-2 mt-2 bg-primary/5 rounded-lg p-2">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => setPlayingScene(playingScene === scene.id ? null : scene.id)}
                            >
                              {playingScene === scene.id ? (
                                <Pause className="h-3.5 w-3.5" />
                              ) : (
                                <Play className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <div className="flex-1 h-1 bg-muted rounded-full">
                              <div className="h-1 bg-primary rounded-full w-0" />
                            </div>
                            <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        ) : null}
                      </div>

                      {/* Generate Button */}
                      <Button
                        size="sm"
                        variant={scene.audio_path ? 'outline' : 'default'}
                        className="gap-1 shrink-0"
                        onClick={() => generateSceneVoice(scene.id)}
                        disabled={generatingScenes.has(scene.id) || !scene.vo}
                      >
                        {generatingScenes.has(scene.id) ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : scene.audio_path ? (
                          <Sparkles className="h-3.5 w-3.5" />
                        ) : (
                          <Mic className="h-3.5 w-3.5" />
                        )}
                        {scene.audio_path ? 'Regenerate' : 'Generate'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
