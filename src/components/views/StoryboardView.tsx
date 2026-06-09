'use client'

import { useAppStore, type Scene } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Edit,
  Check,
  X,
  LayoutGrid,
  Clock,
  Eye,
  Lock,
  Unlock,
  Loader2,
} from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import { useToast } from '@/hooks/use-toast'

export default function StoryboardView() {
  const { currentProject, storyboard, setStoryboard, scenes, setScenes } = useAppStore()
  const { toast } = useToast()
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<Scene>>({})

  async function fetchData() {
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

  useEffect(() => {
    if (currentProject) {
      fetchData()
    }
  }, [currentProject])

  async function saveScene(id: string) {
    try {
      const res = await fetch(`/api/scenes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      })
      if (res.ok) {
        const updated = await res.json()
        setScenes(scenes.map((s) => (s.id === id ? { ...s, ...updated } : s)))
        setEditingSceneId(null)
        setEditData({})
        toast({ title: 'Scene updated' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to update scene', variant: 'destructive' })
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

  function startEditing(scene: Scene) {
    setEditingSceneId(scene.id)
    setEditData({
      action: scene.action,
      vo: scene.vo,
      image_prompt: scene.image_prompt,
      motion_prompt: scene.motion_prompt,
      start_time: scene.start_time,
      end_time: scene.end_time,
    })
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

  const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
    generating: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    generated: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    failed: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  }

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary" />
            Storyboard Detail
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Full storyboard view with inline editing
          </p>
        </div>
        <div className="flex items-center gap-2">
          {storyboard && (
            <>
              <Badge variant="secondary" className="gap-1">
                <Clock className="h-3 w-3" />
                {storyboard.duration_total}s
              </Badge>
              <Badge variant="outline">{storyboard.format}</Badge>
            </>
          )}
        </div>
      </div>

      {scenes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <LayoutGrid className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No storyboard data</h3>
          <p className="text-muted-foreground text-sm max-w-sm">
            Navigate to the Workflow view and generate a storyboard first.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {parts.map(([partNum, partScenes]) => (
            <div key={partNum}>
              <div className="flex items-center gap-2 mb-3 sticky top-0 bg-background py-2 z-10">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                  {partNum}
                </div>
                <h3 className="font-semibold text-sm">Part {partNum}</h3>
                <Badge variant="outline" className="text-[10px]">
                  {partScenes.length} scenes
                </Badge>
                <Separator className="flex-1" />
              </div>

              <div className="rounded-lg border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16 text-center">Scene</TableHead>
                      <TableHead className="w-24">Time Range</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>VO</TableHead>
                      <TableHead className="w-48">Image Prompt</TableHead>
                      <TableHead className="w-36">Motion Prompt</TableHead>
                      <TableHead className="w-20 text-center">Status</TableHead>
                      <TableHead className="w-20 text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {partScenes
                      .sort((a, b) => a.scene_number - b.scene_number)
                      .map((scene) => (
                        <TableRow key={scene.id} className={scene.locked ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''}>
                          <TableCell className="text-center font-bold text-primary">
                            {scene.scene_number}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-xs">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              {editingSceneId === scene.id ? (
                                <div className="flex gap-1">
                                  <Input
                                    type="number"
                                    value={editData.start_time ?? scene.start_time}
                                    onChange={(e) => setEditData({ ...editData, start_time: parseInt(e.target.value) || 0 })}
                                    className="h-6 w-12 text-xs"
                                  />
                                  <span>-</span>
                                  <Input
                                    type="number"
                                    value={editData.end_time ?? scene.end_time}
                                    onChange={(e) => setEditData({ ...editData, end_time: parseInt(e.target.value) || 0 })}
                                    className="h-6 w-12 text-xs"
                                  />
                                </div>
                              ) : (
                                <span>{scene.start_time}-{scene.end_time}s</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {editingSceneId === scene.id ? (
                              <Textarea
                                value={editData.action || ''}
                                onChange={(e) => setEditData({ ...editData, action: e.target.value })}
                                rows={2}
                                className="text-xs"
                              />
                            ) : (
                              <span className="text-xs line-clamp-2">{scene.action || '-'}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {editingSceneId === scene.id ? (
                              <Textarea
                                value={editData.vo || ''}
                                onChange={(e) => setEditData({ ...editData, vo: e.target.value })}
                                rows={2}
                                className="text-xs"
                              />
                            ) : (
                              <span className="text-xs italic line-clamp-2">{scene.vo || '-'}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {editingSceneId === scene.id ? (
                              <Textarea
                                value={editData.image_prompt || ''}
                                onChange={(e) => setEditData({ ...editData, image_prompt: e.target.value })}
                                rows={2}
                                className="text-xs"
                              />
                            ) : scene.image_path ? (
                              <div className="flex items-center gap-1">
                                <div className="w-8 h-12 rounded bg-muted overflow-hidden shrink-0">
                                  <img src={scene.image_path} alt="" className="w-full h-full object-cover" />
                                </div>
                                <span className="text-[10px] text-muted-foreground line-clamp-2">{scene.image_prompt}</span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-muted-foreground line-clamp-2">{scene.image_prompt || '-'}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {editingSceneId === scene.id ? (
                              <Input
                                value={editData.motion_prompt || ''}
                                onChange={(e) => setEditData({ ...editData, motion_prompt: e.target.value })}
                                className="text-xs h-7"
                              />
                            ) : (
                              <span className="text-xs line-clamp-2">{scene.motion_prompt || '-'}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge className={`text-[9px] ${STATUS_COLORS[scene.status] || STATUS_COLORS.pending}`}>
                              {scene.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 justify-center">
                              {editingSceneId === scene.id ? (
                                <>
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => saveScene(scene.id)}>
                                    <Check className="h-3 w-3 text-primary" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingSceneId(null)}>
                                    <X className="h-3 w-3 text-destructive" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEditing(scene)}>
                                    <Edit className="h-3 w-3" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => toggleLock(scene)}>
                                    {scene.locked ? (
                                      <Lock className="h-3 w-3 text-amber-500" />
                                    ) : (
                                      <Unlock className="h-3 w-3" />
                                    )}
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
