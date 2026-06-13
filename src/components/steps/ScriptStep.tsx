'use client'

import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Sparkles, RefreshCw, Edit, Check, Loader2, FileText, Clock } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useToast } from '@/hooks/use-toast'

export default function ScriptStep() {
  const { currentProject, script, setScript, generating, setGenerating } = useAppStore()
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')

  useEffect(() => {
    if (currentProject) {
      fetchScript()
    }
  }, [currentProject])

  async function fetchScript() {
    if (!currentProject) return
    try {
      const res = await fetch(`/api/script?project_id=${currentProject.id}`)
      if (res.ok) {
        const data = await res.json()
        if (data.script) {
          setScript(scriptToDisplay(data.script))
        }
      }
    } catch {
      // silently fail
    }
  }

  async function generateScript() {
    if (!currentProject) return
    try {
      setGenerating(true)
      const res = await fetch('/api/script/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: currentProject.id }),
      })
      if (res.ok) {
        const data = await res.json()
        setScript(scriptToDisplay(data.script))
        toast({ title: 'Script generated!', description: 'Your full script is ready.' })
      } else {
        const err = await res.json()
        toast({ title: 'Error', description: err.error || 'Failed to generate script', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to generate script', variant: 'destructive' })
    } finally {
      setGenerating(false)
    }
  }

  async function saveScript() {
    if (!currentProject) return
    try {
      setGenerating(true)
      const res = await fetch('/api/script', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: currentProject.id, script: editText }),
      })
      if (res.ok) {
        setScript(editText)
        setEditing(false)
        toast({ title: 'Script updated' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to save script', variant: 'destructive' })
    } finally {
      setGenerating(false)
    }
  }

  // Rough estimate: ~150 words per minute
  // Script can be plain text or generated JSON object.
  function scriptToText(value: unknown): string {
    if (!value) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (Array.isArray(value)) return value.map(scriptToText).join(' ')
    if (typeof value === 'object') {
      const obj = value as any

      if (Array.isArray(obj.parts)) {
        return obj.parts
          .flatMap((part: any) => Array.isArray(part.scenes) ? part.scenes : [])
          .map((scene: any) => [scene.vo, scene.action, scene.visual_description, scene.scene_goal].filter(Boolean).join(' '))
          .join(' ')
      }

      if (Array.isArray(obj.scenes)) {
        return obj.scenes
          .map((scene: any) => [scene.vo, scene.action, scene.visual_description, scene.scene_goal].filter(Boolean).join(' '))
          .join(' ')
      }

      return Object.values(obj).map(scriptToText).join(' ')
    }
    return ''
  }

  function estimateDuration(text: unknown) {
    const safeText = scriptToText(text)
    const words = safeText.split(/\s+/).filter(Boolean).length
    return Math.round((words / 150) * 60)
  }

  function scriptToDisplay(value: unknown): string {
    if (!value) return ''
    if (typeof value === 'string') return value
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }
  const estimatedDuration = script ? estimateDuration(script) : 0

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Script
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Write and refine the full script for your content
          </p>
        </div>
        <div className="flex gap-2">
          {script && !editing && (
            <Button variant="outline" onClick={() => { setEditing(true); setEditText(scriptToDisplay(script)) }} className="gap-2">
              <Edit className="h-4 w-4" /> Edit
            </Button>
          )}
          <Button variant="outline" onClick={generateScript} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Regenerate
          </Button>
          <Button onClick={generateScript} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate
          </Button>
        </div>
      </div>

      {generating && !script ? (
        <Card className="animate-pulse">
          <CardHeader>
            <Skeleton className="h-5 w-1/3" />
          </CardHeader>
          <CardContent className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" style={{ width: `${60 + Math.random() * 40}%` }} />
            ))}
          </CardContent>
        </Card>
      ) : !script && !editing ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/5 flex items-center justify-center mb-4">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No script yet</h3>
          <p className="text-muted-foreground text-sm max-w-sm mb-4">
            Generate a full script based on your storyline and selected idea.
          </p>
          <Button onClick={generateScript} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate Script
          </Button>
        </div>
      ) : (
        <Card className="card-hover border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Full Script</CardTitle>
              {script && !editing && (
                <Badge variant="secondary" className="gap-1">
                  <Clock className="h-3 w-3" />
                  ~{estimatedDuration}s
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {editing ? (
              <div className="space-y-3">
                <Textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={20}
                  className="font-mono text-sm"
                />
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="gap-1">
                    <Clock className="h-3 w-3" />
                    ~{estimateDuration(editText)}s estimated
                  </Badge>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => { setEditing(false); setEditText('') }}>
                      Cancel
                    </Button>
                    <Button onClick={saveScript} disabled={generating} className="gap-2">
                      {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{scriptToDisplay(script)}</pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}


