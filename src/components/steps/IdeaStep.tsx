'use client'

import { useAppStore, type Idea } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Sparkles, RefreshCw, Check, Edit, Loader2, Lightbulb } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useToast } from '@/hooks/use-toast'

export default function IdeaStep() {
  const { currentProject, ideas, setIdeas, generating, setGenerating } = useAppStore()
  const { toast } = useToast()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Partial<Idea>>({})

  useEffect(() => {
    if (currentProject) {
      fetchIdeas()
    }
  }, [currentProject])

  async function fetchIdeas() {
    if (!currentProject) return
    try {
      const res = await fetch(`/api/ideas?project_id=${currentProject.id}`)
      if (res.ok) {
        const data = await res.json()
        setIdeas(data)
      }
    } catch {
      // silently fail
    }
  }

  async function generateIdeas() {
    if (!currentProject) return
    try {
      setGenerating(true)
      const res = await fetch('/api/ideas/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: currentProject.id }),
      })
      if (res.ok) {
        const data = await res.json()
        const ideasList = Array.isArray(data) ? data : data.ideas || []
        setIdeas(ideasList)
        toast({ title: 'Ideas generated!', description: `${ideasList.length} ideas have been created.` })
      } else {
        const err = await res.json()
        toast({ title: 'Error', description: err.error || 'Failed to generate ideas', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to generate ideas', variant: 'destructive' })
    } finally {
      setGenerating(false)
    }
  }

  async function selectIdea(id: string) {
    try {
      const res = await fetch(`/api/ideas/${id}/select`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      })
      if (res.ok) {
        setIdeas(
          ideas.map((i) => ({
            ...i,
            selected: i.id === id,
          }))
        )
        toast({ title: 'Idea selected', description: 'This idea will be used for the next steps.' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to select idea', variant: 'destructive' })
    }
  }

  async function saveEdit(id: string) {
    try {
      const res = await fetch(`/api/ideas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editValues),
      })
      if (res.ok) {
        const updated = await res.json()
        setIdeas(ideas.map((i) => (i.id === id ? { ...i, ...updated } : i)))
        setEditingId(null)
        setEditValues({})
        toast({ title: 'Idea updated' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to update idea', variant: 'destructive' })
    }
  }

  function startEditing(idea: Idea) {
    setEditingId(idea.id)
    setEditValues({ title: idea.title, hook: idea.hook, angle: idea.angle })
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            Idea Generation
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Generate creative ideas for your content project
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={generateIdeas} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Regenerate
          </Button>
          <Button onClick={generateIdeas} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate Ideas
          </Button>
        </div>
      </div>

      {generating && ideas.length === 0 ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <Skeleton className="h-5 w-3/4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : ideas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Lightbulb className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No ideas yet</h3>
          <p className="text-muted-foreground text-sm max-w-sm mb-4">
            Click &quot;Generate Ideas&quot; to let AI brainstorm creative concepts for your content.
          </p>
          <Button onClick={generateIdeas} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate Ideas
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {ideas.map((idea) => (
            <Card
              key={idea.id}
              className={`transition-all ${
                idea.selected
                  ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                  : 'hover:border-primary/30'
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {editingId === idea.id ? (
                      <Input
                        value={editValues.title || ''}
                        onChange={(e) => setEditValues({ ...editValues, title: e.target.value })}
                        className="font-semibold"
                      />
                    ) : (
                      <CardTitle className="text-base">{idea.title}</CardTitle>
                    )}
                    {idea.selected && (
                      <Badge className="bg-emerald-500 text-white shrink-0">
                        <Check className="h-3 w-3 mr-1" />
                        Selected
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0 ml-2">
                    {editingId === idea.id ? (
                      <Button size="sm" onClick={() => saveEdit(idea.id)} className="gap-1">
                        <Check className="h-3 w-3" /> Save
                      </Button>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEditing(idea)}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        {!idea.selected && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => selectIdea(idea.id)}
                            className="gap-1"
                          >
                            <Check className="h-3.5 w-3.5" /> Select
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {editingId === idea.id ? (
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Hook</label>
                      <Textarea
                        value={editValues.hook || ''}
                        onChange={(e) => setEditValues({ ...editValues, hook: e.target.value })}
                        rows={2}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Angle</label>
                      <Input
                        value={editValues.angle || ''}
                        onChange={(e) => setEditValues({ ...editValues, angle: e.target.value })}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    {idea.hook && (
                      <div>
                        <span className="text-xs font-medium text-muted-foreground">Hook: </span>
                        <span className="text-sm">{idea.hook}</span>
                      </div>
                    )}
                    {idea.angle && (
                      <div>
                        <span className="text-xs font-medium text-muted-foreground">Angle: </span>
                        <span className="text-sm">{idea.angle}</span>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
