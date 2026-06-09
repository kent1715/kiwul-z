'use client'

import { useAppStore, type Scene } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sparkles,
  RefreshCw,
  Loader2,
  Image as ImageIcon,
  Lock,
  Unlock,
  LockOpen,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useToast } from '@/hooks/use-toast'

export default function ImagesStep() {
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

  async function generateAllImages() {
    if (!currentProject) return
    try {
      setGenerating(true)
      const res = await fetch('/api/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: currentProject.id }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.scenes) setScenes(data.scenes)
        toast({ title: 'Images generated!', description: 'All scene images have been created.' })
      } else {
        const err = await res.json()
        toast({ title: 'Error', description: err.error || 'Failed to generate images', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to generate images', variant: 'destructive' })
    } finally {
      setGenerating(false)
    }
  }

  async function generateSceneImage(sceneId: string) {
    try {
      setGeneratingScenes((prev) => new Set(prev).add(sceneId))
      const res = await fetch(`/api/images/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: currentProject?.id, sceneId }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.scene) {
          setScenes(scenes.map((s) => (s.id === sceneId ? { ...s, ...data.scene } : s)))
        }
        toast({ title: 'Image generated!' })
      } else {
        toast({ title: 'Error', description: 'Failed to generate image', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to generate image', variant: 'destructive' })
    } finally {
      setGeneratingScenes((prev) => {
        const next = new Set(prev)
        next.delete(sceneId)
        return next
      })
    }
  }

  async function toggleLock(scene: Scene) {
    try {
      const res = await fetch(`/api/scenes/${scene.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locked: !scene.locked }),
      })
      if (res.ok) {
        setScenes(scenes.map((s) => (s.id === scene.id ? { ...s, locked: !s.locked } : s)))
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to toggle lock', variant: 'destructive' })
    }
  }

  const scenesWithImages = scenes.filter((s) => s.image_path)
  const scenesWithoutImages = scenes.filter((s) => !s.image_path)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-primary" />
            Scene Images
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Generate and manage images for each scene
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={generateAllImages} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate All
          </Button>
        </div>
      </div>

      {scenes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No scenes found</h3>
          <p className="text-muted-foreground text-sm max-w-sm">
            Generate a storyboard first to create scene images.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {scenes.length > 0 && (
            <div className="flex items-center gap-3 mb-2">
              <Badge variant="secondary">
                {scenesWithImages.length} / {scenes.length} images
              </Badge>
              {scenesWithoutImages.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {scenesWithoutImages.length} scenes need images
                </span>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {scenes
              .sort((a, b) => a.scene_number - b.scene_number)
              .map((scene) => (
                <Card
                  key={scene.id}
                  className={`overflow-hidden group ${scene.locked ? 'ring-2 ring-amber-400/50' : ''}`}
                >
                  {/* Image Area */}
                  <div className="aspect-[9/16] max-h-48 relative bg-muted">
                    {scene.image_path ? (
                      <img
                        src={scene.image_path}
                        alt={`Scene ${scene.scene_number}`}
                        className="w-full h-full object-cover"
                      />
                    ) : generatingScenes.has(scene.id) ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                        <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => generateSceneImage(scene.id)}
                          disabled={scene.locked}
                        >
                          <Sparkles className="h-3 w-3" /> Generate
                        </Button>
                      </div>
                    )}

                    {/* Overlay on hover */}
                    {scene.image_path && (
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="gap-1"
                          onClick={() => generateSceneImage(scene.id)}
                          disabled={scene.locked || generatingScenes.has(scene.id)}
                        >
                          <RefreshCw className="h-3 w-3" /> Regenerate
                        </Button>
                      </div>
                    )}

                    {/* Lock indicator */}
                    <button
                      onClick={() => toggleLock(scene)}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70 transition-colors"
                    >
                      {scene.locked ? (
                        <Lock className="h-3.5 w-3.5 text-amber-400" />
                      ) : (
                        <Unlock className="h-3.5 w-3.5 text-white/70" />
                      )}
                    </button>
                  </div>

                  {/* Scene Info */}
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">
                        Scene {scene.scene_number}
                      </span>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-[9px]">
                          {scene.start_time}-{scene.end_time}s
                        </Badge>
                        {scene.locked && (
                          <Lock className="h-3 w-3 text-amber-500" />
                        )}
                      </div>
                    </div>
                    {scene.image_prompt && (
                      <p className="text-[10px] text-muted-foreground line-clamp-2 mt-1">
                        {scene.image_prompt}
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
