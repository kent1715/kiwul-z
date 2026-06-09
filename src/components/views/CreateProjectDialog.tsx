'use client'

import { useAppStore } from '@/lib/store'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'

const NICHES = [
  { value: 'tutorial_cooking', label: 'Tutorial / Cooking' },
  { value: 'micro_drama', label: 'Micro Drama' },
  { value: 'science_fact', label: 'Science Fact' },
  { value: 'horror', label: 'Horror' },
  { value: 'motivation', label: 'Motivation' },
  { value: 'education', label: 'Education' },
  { value: 'storytelling', label: 'Storytelling' },
  { value: 'product', label: 'Product' },
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'mukbang', label: 'Mukbang' },
  { value: 'ai_news', label: 'AI News' },
  { value: 'reaction', label: 'Reaction' },
  { value: 'pov', label: 'POV' },
]

const PLATFORMS = [
  { id: 'tiktok', label: 'TikTok' },
  { id: 'reels', label: 'Reels' },
  { id: 'youtube_shorts', label: 'YouTube Shorts' },
]

export default function CreateProjectDialog() {
  const { showCreateDialog, setShowCreateDialog, setProjects, projects, setCurrentProject, setCurrentView } = useAppStore()
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({
    title: '',
    topic: '',
    niche: 'tutorial_cooking',
    platforms: ['tiktok'] as string[],
    language: 'id',
    duration: 50,
    aspect_ratio: '9:16',
    resolution: '1080x1920',
    visual_style: 'realistic cinematic vertical',
    tone: '',
    audience: '',
  })

  function updateForm(key: string, value: string | number | string[]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function togglePlatform(platform: string) {
    setForm((prev) => ({
      ...prev,
      platforms: prev.platforms.includes(platform)
        ? prev.platforms.filter((p) => p !== platform)
        : [...prev.platforms, platform],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim() || !form.topic.trim()) {
      toast({ title: 'Validation Error', description: 'Title and Topic are required.', variant: 'destructive' })
      return
    }

    try {
      setSubmitting(true)
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          topic: form.topic,
          niche: form.niche,
          target_platform: form.platforms.join(','),
          language: form.language,
          duration_seconds: form.duration,
          aspect_ratio: form.aspect_ratio,
          resolution: form.resolution,
          visual_style: form.visual_style,
          tone: form.tone,
          audience: form.audience,
        }),
      })

      if (res.ok) {
        const project = await res.json()
        setProjects([project, ...projects])
        setCurrentProject(project)
        setCurrentView('workflow')
        setShowCreateDialog(false)
        resetForm()
        toast({ title: 'Project created!', description: `"${project.title}" is ready.` })
      } else {
        const err = await res.json()
        toast({ title: 'Error', description: err.error || 'Failed to create project', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to create project', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  function resetForm() {
    setForm({
      title: '',
      topic: '',
      niche: 'tutorial_cooking',
      platforms: ['tiktok'],
      language: 'id',
      duration: 50,
      aspect_ratio: '9:16',
      resolution: '1080x1920',
      visual_style: 'realistic cinematic vertical',
      tone: '',
      audience: '',
    })
  }

  return (
    <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto custom-scrollbar">
        <DialogHeader className="gradient-warm rounded-lg -mx-1 -mt-1 px-5 py-4 mb-2">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Create New Project
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Set up your content creation project. AI will help generate ideas, scripts, and media.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-2">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title" className="text-muted-foreground">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              placeholder="e.g., 5-Minute Indonesian Street Food"
              value={form.title}
              onChange={(e) => updateForm('title', e.target.value)}
              required
              className="transition-all duration-200"
            />
          </div>

          {/* Topic */}
          <div className="space-y-2">
            <Label htmlFor="topic" className="text-muted-foreground">
              Topic <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="topic"
              placeholder="Describe your content topic in detail..."
              value={form.topic}
              onChange={(e) => updateForm('topic', e.target.value)}
              rows={3}
              required
              className="transition-all duration-200"
            />
          </div>

          {/* Niche */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Niche</Label>
            <Select value={form.niche} onValueChange={(v) => updateForm('niche', v)}>
              <SelectTrigger className="transition-all duration-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NICHES.map((n) => (
                  <SelectItem key={n.value} value={n.value}>
                    {n.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Target Platform */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Target Platform</Label>
            <div className="flex flex-wrap gap-4">
              {PLATFORMS.map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <Checkbox
                    id={p.id}
                    checked={form.platforms.includes(p.id)}
                    onCheckedChange={() => togglePlatform(p.id)}
                  />
                  <Label htmlFor={p.id} className="cursor-pointer font-normal">
                    {p.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Language & Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Language</Label>
              <Select value={form.language} onValueChange={(v) => updateForm('language', v)}>
                <SelectTrigger className="transition-all duration-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="id">Indonesian (id)</SelectItem>
                  <SelectItem value="en">English (en)</SelectItem>
                  <SelectItem value="es">Spanish (es)</SelectItem>
                  <SelectItem value="pt">Portuguese (pt)</SelectItem>
                  <SelectItem value="ja">Japanese (ja)</SelectItem>
                  <SelectItem value="ko">Korean (ko)</SelectItem>
                  <SelectItem value="zh">Chinese (zh)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Duration: {form.duration}s</Label>
              <Slider
                value={[form.duration]}
                onValueChange={([v]) => updateForm('duration', v)}
                min={30}
                max={60}
                step={5}
                className="mt-3"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>30s</span>
                <span>60s</span>
              </div>
            </div>
          </div>

          {/* Aspect Ratio & Resolution */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Aspect Ratio</Label>
              <Select value={form.aspect_ratio} onValueChange={(v) => updateForm('aspect_ratio', v)}>
                <SelectTrigger className="transition-all duration-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="9:16">9:16 (Vertical)</SelectItem>
                  <SelectItem value="16:9">16:9 (Horizontal)</SelectItem>
                  <SelectItem value="1:1">1:1 (Square)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Resolution</Label>
              <Select value={form.resolution} onValueChange={(v) => updateForm('resolution', v)}>
                <SelectTrigger className="transition-all duration-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1080x1920">1080x1920 (Full HD)</SelectItem>
                  <SelectItem value="720x1280">720x1280 (HD)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Visual Style */}
          <div className="space-y-2">
            <Label htmlFor="visual_style" className="text-muted-foreground">Visual Style</Label>
            <Input
              id="visual_style"
              placeholder="e.g., realistic cinematic vertical"
              value={form.visual_style}
              onChange={(e) => updateForm('visual_style', e.target.value)}
              className="transition-all duration-200"
            />
          </div>

          {/* Tone & Audience */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tone" className="text-muted-foreground">Tone</Label>
              <Input
                id="tone"
                placeholder="e.g., energetic, fun"
                value={form.tone}
                onChange={(e) => updateForm('tone', e.target.value)}
                className="transition-all duration-200"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="audience" className="text-muted-foreground">Audience</Label>
              <Input
                id="audience"
                placeholder="e.g., Gen Z food lovers"
                value={form.audience}
                onChange={(e) => updateForm('audience', e.target.value)}
                className="transition-all duration-200"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
            <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="gap-2">
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Create Project
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
