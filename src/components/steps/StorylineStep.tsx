'use client'

import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Sparkles, RefreshCw, Edit, Check, Loader2, GitBranch } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useToast } from '@/hooks/use-toast'

interface StorylineData {
  title: string
  hook: string
  core_question: string
  opening: string
  middle: string
  ending: string
  cta: string
}

const DEFAULT_STORYLINE: StorylineData = {
  title: '',
  hook: '',
  core_question: '',
  opening: '',
  middle: '',
  ending: '',
  cta: '',
}

export default function StorylineStep() {
  const { currentProject, storyline, setStoryline, generating, setGenerating } = useAppStore()
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<StorylineData>(DEFAULT_STORYLINE)
  const [parsed, setParsed] = useState<StorylineData | null>(null)

  useEffect(() => {
    if (currentProject) {
      fetchStoryline()
    }
  }, [currentProject])

  useEffect(() => {
    if (storyline) {
      try {
        const data = JSON.parse(storyline) as StorylineData
        setParsed(data)
        setEditData(data)
      } catch {
        setParsed(null)
      }
    } else {
      setParsed(null)
    }
  }, [storyline])

  async function fetchStoryline() {
    if (!currentProject) return
    try {
      const res = await fetch(`/api/storyline?project_id=${currentProject.id}`)
      if (res.ok) {
        const data = await res.json()
        if (data.storyline) {
          setStoryline(data.storyline)
        }
      }
    } catch {
      // silently fail
    }
  }

  async function generateStoryline() {
    if (!currentProject) return
    try {
      setGenerating(true)
      const res = await fetch('/api/storyline/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: currentProject.id }),
      })
      if (res.ok) {
        const data = await res.json()
        setStoryline(data.storyline)
        toast({ title: 'Storyline generated!', description: 'Your narrative structure is ready.' })
      } else {
        const err = await res.json()
        toast({ title: 'Error', description: err.error || 'Failed to generate storyline', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to generate storyline', variant: 'destructive' })
    } finally {
      setGenerating(false)
    }
  }

  async function saveStoryline() {
    if (!currentProject) return
    try {
      setGenerating(true)
      const res = await fetch('/api/storyline', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: currentProject.id, storyline: JSON.stringify(editData) }),
      })
      if (res.ok) {
        setStoryline(JSON.stringify(editData))
        setEditing(false)
        toast({ title: 'Storyline updated' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to save storyline', variant: 'destructive' })
    } finally {
      setGenerating(false)
    }
  }

  const displayData = editing ? editData : parsed

  const FIELDS: { key: keyof StorylineData; label: string; multiline?: boolean }[] = [
    { key: 'title', label: 'Title' },
    { key: 'hook', label: 'Hook', multiline: true },
    { key: 'core_question', label: 'Core Question' },
    { key: 'opening', label: 'Opening', multiline: true },
    { key: 'middle', label: 'Middle / Development', multiline: true },
    { key: 'ending', label: 'Ending / Twist', multiline: true },
    { key: 'cta', label: 'Call to Action', multiline: true },
  ]

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            Storyline
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Build the narrative structure for your content
          </p>
        </div>
        <div className="flex gap-2">
          {parsed && !editing && (
            <Button variant="outline" onClick={() => setEditing(true)} className="gap-2">
              <Edit className="h-4 w-4" /> Edit
            </Button>
          )}
          <Button variant="outline" onClick={generateStoryline} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Regenerate
          </Button>
          <Button onClick={generateStoryline} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate
          </Button>
        </div>
      </div>

      {generating && !parsed ? (
        <Card className="animate-pulse">
          <CardHeader>
            <Skeleton className="h-5 w-1/2" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-16 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : !parsed && !editing ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <GitBranch className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No storyline yet</h3>
          <p className="text-muted-foreground text-sm max-w-sm mb-4">
            Generate a narrative structure with hook, opening, middle, ending, and CTA.
          </p>
          <Button onClick={generateStoryline} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate Storyline
          </Button>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{displayData?.title || 'Storyline'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {FIELDS.map(({ key, label, multiline }) => (
              <div key={key}>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</label>
                {editing ? (
                  multiline ? (
                    <Textarea
                      value={editData[key] || ''}
                      onChange={(e) => setEditData({ ...editData, [key]: e.target.value })}
                      rows={3}
                      className="mt-1"
                    />
                  ) : (
                    <Input
                      value={editData[key] || ''}
                      onChange={(e) => setEditData({ ...editData, [key]: e.target.value })}
                      className="mt-1"
                    />
                  )
                ) : (
                  <p className="text-sm mt-1 whitespace-pre-wrap">{displayData?.[key] || '-'}</p>
                )}
              </div>
            ))}
            {editing && (
              <div className="flex gap-2 pt-2">
                <Button onClick={saveStoryline} disabled={generating} className="gap-2">
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Save Changes
                </Button>
                <Button variant="outline" onClick={() => { setEditing(false); setEditData(parsed || DEFAULT_STORYLINE) }}>
                  Cancel
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
