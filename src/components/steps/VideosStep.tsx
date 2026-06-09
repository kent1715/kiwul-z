'use client'

import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sparkles,
  Loader2,
  Video,
  Play,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useToast } from '@/hooks/use-toast'

export default function VideosStep() {
  const { currentProject, scenes, setScenes, generating, setGenerating } = useAppStore()
  const { toast } = useToast()
  const [generatingScenes, setGeneratingScenes] = useState<Set<string>>(new Set())

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

  async function generateSceneVideo(sceneId: string) {
    try {
      setGeneratingScenes((prev) => new Set(prev).add(sceneId))
      const res = await fetch('/api/videos/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: currentProject?.id, sceneId }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.scene) {
          setScenes(scenes.map((s) => (s.id === sceneId ? { ...s, ...data.scene } : s)))
        }
        toast({ title: 'Video generated!' })
      } else {
        toast({ title: 'Error', description: 'Failed to generate video', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to generate video', variant: 'destructive' })
    } finally {
      setGeneratingScenes((prev) => {
        const next = new Set(prev)
        next.delete(sceneId)
        return next
      })
    }
  }

  async function generateAllVideos() {
    if (!currentProject) return
    try {
      setGenerating(true)
      const res = await fetch('/api/videos/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: currentProject.id }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.scenes) setScenes(data.scenes)
        toast({ title: 'Videos generated!', description: 'All scene videos have been created.' })
      } else {
        toast({ title: 'Error', description: 'Failed to generate videos', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to generate videos', variant: 'destructive' })
    } finally {
      setGenerating(false)
    }
  }

  const scenesWithVideo = scenes.filter((s) => s.video_path)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" />
            Scene Videos
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Generate animated videos for each scene
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={generateAllVideos} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate All
          </Button>
        </div>
      </div>

      {scenes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/5 flex items-center justify-center mb-4">
            <Video className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No scenes found</h3>
          <p className="text-muted-foreground text-sm max-w-sm">
            Generate a storyboard first to create scene videos.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {scenes.length > 0 && (
            <div className="flex items-center gap-3 mb-2">
              <Badge variant="secondary">
                {scenesWithVideo.length} / {scenes.length} videos
              </Badge>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {scenes
              .sort((a, b) => a.scene_number - b.scene_number)
              .map((scene) => (
                <Card key={scene.id} className="overflow-hidden card-hover border-border/50">
                  {/* Video Area */}
                  <div className="aspect-[9/16] max-h-48 relative bg-muted">
                    {scene.video_path ? (
                      <video
                        src={scene.video_path}
                        className="w-full h-full object-cover"
                        controls
                      />
                    ) : generatingScenes.has(scene.id) ? (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <span className="text-xs text-primary/70">Generating video...</span>
                      </div>
                    ) : scene.image_path ? (
                      <div className="w-full h-full relative">
                        <img
                          src={scene.image_path}
                          alt={`Scene ${scene.scene_number}`}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <Button
                            size="sm"
                            className="gap-1"
                            onClick={() => generateSceneVideo(scene.id)}
                            disabled={scene.locked}
                          >
                            <Sparkles className="h-3 w-3" /> Generate Video
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                        <Video className="h-8 w-8 text-muted-foreground/30" />
                        <span className="text-xs text-muted-foreground">No image yet</span>
                      </div>
                    )}
                  </div>

                  {/* Scene Info */}
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">Scene {scene.scene_number}</span>
                      <Badge variant="outline" className="text-[9px]">
                        {scene.start_time}-{scene.end_time}s
                      </Badge>
                    </div>
                    {scene.motion_prompt && (
                      <p className="text-[10px] text-muted-foreground line-clamp-2 mt-1">
                        <span className="font-medium">Motion:</span> {scene.motion_prompt}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
