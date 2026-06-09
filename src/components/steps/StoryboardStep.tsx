'use client'

import { useAppStore, type Scene } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Sparkles,
  RefreshCw,
  Edit,
  Check,
  Loader2,
  LayoutGrid,
  Clock,
  Eye,
} from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import { useToast } from '@/hooks/use-toast'

export default function StoryboardStep() {
  const { currentProject, storyboard, setStoryboard, scenes, setScenes, generating, setGenerating } = useAppStore()
  const { toast } = useToast()
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null)
  const [editSceneData, setEditSceneData] = useState<Partial<Scene>>({})

  useEffect(() => {
    if (currentProject) {
      fetchStoryboard()
    }
  }, [currentProject])

  async function fetchStoryboard() {
    if (!currentProject) return
    try {
      const [sbRes, scRes] = await Promise.all([
        fetch(`/api/storyboard?project_id=${currentProject.id}`),
        fetch(`/api/scenes?project_id=${currentProject.id}`),
      ])
      if (sbRes.ok) {
        const sbData = await sbRes.json()
        // GET returns array of storyboards with scenes; take the first one
        const sb = Array.isArray(sbData) ? sbData[0] : sbData.storyboard || sbData
        if (sb) setStoryboard(sb)
        // Also extract scenes from storyboard if available
        if (sb?.scenes) setScenes(sb.scenes)
      }
      if (scRes.ok) {
        const scData = await scRes.json()
        setScenes(scData)
      }
    } catch {
      // silently fail
    }
  }

  async function generateStoryboard() {
    if (!currentProject) return
    try {
      setGenerating(true)
      const res = await fetch('/api/storyboard/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: currentProject.id }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.storyboard) setStoryboard(data.storyboard)
        if (data.scenes) setScenes(data.scenes)
        toast({ title: 'Storyboard generated!', description: `${data.scenes?.length || 0} scenes created.` })
      } else {
        const err = await res.json()
        toast({ title: 'Error', description: err.error || 'Failed to generate storyboard', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to generate storyboard', variant: 'destructive' })
    } finally {
      setGenerating(false)
    }
  }

  async function saveScene(id: string) {
    try {
      const res = await fetch(`/api/scenes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editSceneData),
      })
      if (res.ok) {
        const updated = await res.json()
        setScenes(scenes.map((s) => (s.id === id ? { ...s, ...updated } : s)))
        setEditingSceneId(null)
        setEditSceneData({})
        toast({ title: 'Scene updated' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to update scene', variant: 'destructive' })
    }
  }

  function startEditing(scene: Scene) {
    setEditingSceneId(scene.id)
    setEditSceneData({ action: scene.action, vo: scene.vo, image_prompt: scene.image_prompt, motion_prompt: scene.motion_prompt })
  }

  // Group scenes by part
  const parts = useMemo(() => {
    const grouped: Record<number, Scene[]> = {}
    scenes.forEach((scene) => {
      const part = scene.part_number || 1
      if (!grouped[part]) grouped[part] = []
      grouped[part].push(scene)
    })
    return Object.entries(grouped).sort(([a], [b]) => Number(a) - Number(b))
  }, [scenes])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary" />
            Storyboard
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Plan your scenes with timing, actions, and prompts
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={generateStoryboard} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Regenerate
          </Button>
          <Button onClick={generateStoryboard} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate
          </Button>
        </div>
      </div>

      {generating && scenes.length === 0 ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : scenes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/5 flex items-center justify-center mb-4">
            <LayoutGrid className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No storyboard yet</h3>
          <p className="text-muted-foreground text-sm max-w-sm mb-4">
            Generate a storyboard to break your script into timed scenes with visual prompts.
          </p>
          <Button onClick={generateStoryboard} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate Storyboard
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {storyboard && (
            <Card>
              <CardContent className="p-4 flex items-center gap-4 text-sm">
                <Badge variant="secondary" className="gap-1">
                  <Clock className="h-3 w-3" />
                  {storyboard.duration_total}s total
                </Badge>
                <span className="text-muted-foreground">{storyboard.format}</span>
                {storyboard.music_style && (
                  <span className="text-muted-foreground">Music: {storyboard.music_style}</span>
                )}
              </CardContent>
            </Card>
          )}

          {parts.map(([partNum, partScenes]) => (
            <div key={partNum}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-primary/5 flex items-center justify-center text-xs font-bold text-primary">
                  {partNum}
                </div>
                <h3 className="font-semibold text-sm">Part {partNum}</h3>
                <Badge variant="outline" className="text-[10px]">
                  {partScenes.length} scenes
                </Badge>
              </div>

              <div className="space-y-3">
                {partScenes
                  .sort((a, b) => a.scene_number - b.scene_number)
                  .map((scene) => (
                    <Card key={scene.id} className="overflow-hidden card-hover border-border/50">
                      <div className="flex">
                        {/* Scene Number & Time */}
                        <div className="w-24 bg-primary/5 p-3 flex flex-col items-center justify-center border-r border-border/30 shrink-0">
                          <span className="text-lg font-bold text-primary">
                            {scene.scene_number}
                          </span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 mt-1">
                            <Clock className="h-2.5 w-2.5" />
                            {scene.start_time}-{scene.end_time}s
                          </span>
                          <Badge variant="secondary" className="text-[9px] mt-1">
                            {scene.duration}s
                          </Badge>
                        </div>

                        {/* Scene Content */}
                        <CardContent className="flex-1 p-4 space-y-2">
                          {editingSceneId === scene.id ? (
                            <div className="space-y-2">
                              <div>
                                <label className="text-[10px] font-medium text-muted-foreground">Action</label>
                                <Textarea
                                  value={editSceneData.action || ''}
                                  onChange={(e) => setEditSceneData({ ...editSceneData, action: e.target.value })}
                                  rows={2}
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-medium text-muted-foreground">VO</label>
                                <Textarea
                                  value={editSceneData.vo || ''}
                                  onChange={(e) => setEditSceneData({ ...editSceneData, vo: e.target.value })}
                                  rows={2}
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-medium text-muted-foreground">Image Prompt</label>
                                <Textarea
                                  value={editSceneData.image_prompt || ''}
                                  onChange={(e) => setEditSceneData({ ...editSceneData, image_prompt: e.target.value })}
                                  rows={2}
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-medium text-muted-foreground">Motion Prompt</label>
                                <Input
                                  value={editSceneData.motion_prompt || ''}
                                  onChange={(e) => setEditSceneData({ ...editSceneData, motion_prompt: e.target.value })}
                                />
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" onClick={() => saveScene(scene.id)} className="gap-1">
                                  <Check className="h-3 w-3" /> Save
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setEditingSceneId(null)}>
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {scene.action && (
                                <div>
                                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Action</span>
                                  <p className="text-sm">{scene.action}</p>
                                </div>
                              )}
                              {scene.vo && (
                                <div>
                                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">VO</span>
                                  <p className="text-sm italic">{scene.vo}</p>
                                </div>
                              )}
                              {scene.image_prompt && (
                                <div>
                                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Image Prompt</span>
                                  <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">{scene.image_prompt}</p>
                                </div>
                              )}
                              {scene.motion_prompt && (
                                <div>
                                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Motion Prompt</span>
                                  <p className="text-xs text-muted-foreground">{scene.motion_prompt}</p>
                                </div>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => startEditing(scene)} className="gap-1 h-7 text-xs">
                                <Edit className="h-3 w-3" /> Edit
                              </Button>
                            </>
                          )}
                        </CardContent>

                        {/* Image Preview */}
                        <div className="w-28 border-l border-border/30 bg-primary/5 flex items-center justify-center shrink-0">
                          {scene.image_path ? (
                            <div className="w-full h-full relative">
                              <img
                                src={scene.image_path}
                                alt={`Scene ${scene.scene_number}`}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="text-center p-2">
                              <Eye className="h-5 w-5 text-muted-foreground/40 mx-auto" />
                              <span className="text-[9px] text-muted-foreground">No image</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
