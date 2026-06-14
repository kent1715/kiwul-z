'use client'

import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Sparkles, RefreshCw, Edit, Check, Loader2, FileText, Clock, Upload } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useToast } from '@/hooks/use-toast'

export default function ScriptStep() {
  const { currentProject, script, setScript, generating, setGenerating } = useAppStore()
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [importingJson, setImportingJson] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)

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
          setScript(data.script)
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
        setScript(data.script)
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
  function estimateDuration(text: string) {
    const words = text.split(/\s+/).filter(Boolean).length
    return Math.round((words / 150) * 60)
  }


  async function importJsonAndBuildStoryboard() {
    if (!currentProject) return

    try {
      setGenerating(true)

      let parsed: unknown
      try {
        parsed = JSON.parse(importText)
      } catch {
        toast({
          title: 'Invalid JSON',
          description: 'JSON tidak valid. Cek koma, kurung, dan tanda kutip.',
          variant: 'destructive',
        })
        return
      }

      const res = await fetch('/api/script/import-build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: currentProject.id,
          script: parsed,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        toast({
          title: 'Import failed',
          description: data.error || 'Gagal import JSON script',
          variant: 'destructive',
        })
        return
      }

      setScript(JSON.stringify(data.script, null, 2))
      setImportingJson(false)
      setImportText('')

      toast({
        title: 'JSON imported',
        description: `Script tersimpan dan ${data.scenesCreated || 0} scene dibuat ke storyboard.`,
      })
    } catch {
      toast({
        title: 'Error',
        description: 'Gagal import JSON script',
        variant: 'destructive',
      })
    } finally {
      setGenerating(false)
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
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => { setImportingJson(true); setEditing(false) }} disabled={generating} className="gap-2">
            <Upload className="h-4 w-4" /> Load JSON
          </Button>
          {script && !editing && (
            <Button variant="outline" onClick={() => { setEditing(true); setEditText(script) }} className="gap-2">
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

      {importingJson && (
        <Card className="card-hover border-border/50 mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Import External JSON Script</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={18}
                placeholder="Paste JSON script dari ChatGPT/Gemini di sini..."
                className="font-mono text-sm"
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Import akan menyimpan script_json dan otomatis membuat Storyboard + Scenes.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => { setImportingJson(false); setImportText('') }} disabled={generating}>
                    Cancel
                  </Button>
                  <Button onClick={importJsonAndBuildStoryboard} disabled={generating || !importText.trim()} className="gap-2">
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    Import & Build Storyboard
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
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
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{script}</pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}





