'use client'

import { useAppStore, type Character } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sparkles,
  RefreshCw,
  Edit,
  Check,
  Loader2,
  User,
  Image as ImageIcon,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useToast } from '@/hooks/use-toast'

const CHARACTER_FIELDS: { key: keyof Character; label: string; multiline?: boolean }[] = [
  { key: 'name', label: 'Name' },
  { key: 'description', label: 'Description', multiline: true },
  { key: 'gender', label: 'Gender' },
  { key: 'age_range', label: 'Age Range' },
  { key: 'ethnicity_style', label: 'Ethnicity Style' },
  { key: 'face_description', label: 'Face Description', multiline: true },
  { key: 'hair_or_hijab', label: 'Hair / Hijab' },
  { key: 'outfit', label: 'Outfit' },
  { key: 'body_type', label: 'Body Type' },
  { key: 'personality', label: 'Personality' },
  { key: 'visual_prompt', label: 'Visual Prompt', multiline: true },
  { key: 'negative_prompt', label: 'Negative Prompt', multiline: true },
]

export default function CharacterStep() {
  const { currentProject, characters, setCharacters, generating, setGenerating } = useAppStore()
  const { toast } = useToast()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<Character>>({})

  useEffect(() => {
    if (currentProject) {
      fetchCharacters()
    }
  }, [currentProject])

  async function fetchCharacters() {
    if (!currentProject) return
    try {
      const res = await fetch(`/api/characters?project_id=${currentProject.id}`)
      if (res.ok) {
        const data = await res.json()
        setCharacters(data)
      }
    } catch {
      // silently fail
    }
  }

  async function generateCharacters() {
    if (!currentProject) return
    try {
      setGenerating(true)
      const res = await fetch('/api/characters/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: currentProject.id }),
      })
      if (res.ok) {
        const data = await res.json()
        const charsList = Array.isArray(data) ? data : data.characters || []
        setCharacters(charsList)
        toast({ title: 'Characters generated!', description: `${charsList.length} characters created.` })
      } else {
        const err = await res.json()
        toast({ title: 'Error', description: err.error || 'Failed to generate characters', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to generate characters', variant: 'destructive' })
    } finally {
      setGenerating(false)
    }
  }

  async function generateReferenceImage(id: string) {
    try {
      const res = await fetch(`/api/characters/${id}/reference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (res.ok) {
        const data = await res.json()
        setCharacters(characters.map((c) => (c.id === id ? { ...c, reference_image_path: data.reference_image_path } : c)))
        toast({ title: 'Reference image generated!' })
      } else {
        toast({ title: 'Error', description: 'Failed to generate reference image', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to generate reference image', variant: 'destructive' })
    }
  }

  async function saveCharacter(id: string) {
    try {
      const res = await fetch(`/api/characters/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      })
      if (res.ok) {
        const updated = await res.json()
        setCharacters(characters.map((c) => (c.id === id ? { ...c, ...updated } : c)))
        setEditingId(null)
        setEditData({})
        toast({ title: 'Character updated' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to update character', variant: 'destructive' })
    }
  }

  function startEditing(character: Character) {
    setEditingId(character.id)
    const data: Partial<Character> = {}
    CHARACTER_FIELDS.forEach(({ key }) => {
      data[key] = character[key]
    })
    setEditData(data)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Characters
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Design and manage your content characters
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={generateCharacters} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Regenerate
          </Button>
          <Button onClick={generateCharacters} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate
          </Button>
        </div>
      </div>

      {generating && characters.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <Skeleton className="h-5 w-1/2" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : characters.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/5 flex items-center justify-center mb-4">
            <User className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No characters yet</h3>
          <p className="text-muted-foreground text-sm max-w-sm mb-4">
            Generate character bibles with visual descriptions and consistency prompts.
          </p>
          <Button onClick={generateCharacters} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate Characters
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {characters.map((character) => (
            <Card key={character.id} className="card-hover border-border/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    {editingId === character.id ? (
                      <Input
                        value={editData.name || ''}
                        onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                        className="font-semibold h-8"
                      />
                    ) : (
                      character.name
                    )}
                  </CardTitle>
                  <div className="flex gap-1">
                    {editingId === character.id ? (
                      <Button size="sm" onClick={() => saveCharacter(character.id)} className="gap-1">
                        <Check className="h-3 w-3" /> Save
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => startEditing(character)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="flex gap-4">
                  {/* Reference Image */}
                  <div className="w-28 h-36 rounded-lg bg-primary/5 flex items-center justify-center shrink-0 overflow-hidden border border-border/50">
                    {character.reference_image_path ? (
                      <img
                        src={character.reference_image_path}
                        alt={character.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center p-2">
                        <ImageIcon className="h-6 w-6 text-muted-foreground/40 mx-auto mb-1" />
                        <span className="text-[9px] text-muted-foreground">No ref image</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-1 h-6 text-[9px] gap-1 w-full"
                          onClick={() => generateReferenceImage(character.id)}
                        >
                          <Sparkles className="h-2.5 w-2.5" /> Generate
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Character Info */}
                  <div className="flex-1 space-y-2 min-w-0">
                    {editingId === character.id ? (
                      <>
                        {CHARACTER_FIELDS.filter((f) => f.key !== 'name').map(({ key, label, multiline }) => (
                          <div key={key}>
                            <label className="text-[10px] font-medium text-muted-foreground">{label}</label>
                            {multiline ? (
                              <Textarea
                                value={(editData[key] as string) || ''}
                                onChange={(e) => setEditData({ ...editData, [key]: e.target.value })}
                                rows={2}
                                className="text-xs"
                              />
                            ) : (
                              <Input
                                value={(editData[key] as string) || ''}
                                onChange={(e) => setEditData({ ...editData, [key]: e.target.value })}
                                className="text-xs h-7"
                              />
                            )}
                          </div>
                        ))}
                      </>
                    ) : (
                      <>
                        {character.description && (
                          <p className="text-sm line-clamp-2">{character.description}</p>
                        )}
                        <div className="flex flex-wrap gap-1.5">
                          {character.gender && (
                            <Badge variant="secondary" className="text-[10px]">{character.gender}</Badge>
                          )}
                          {character.age_range && (
                            <Badge variant="secondary" className="text-[10px]">{character.age_range}</Badge>
                          )}
                          {character.outfit && (
                            <Badge variant="secondary" className="text-[10px]">{character.outfit}</Badge>
                          )}
                        </div>
                        {character.visual_consistency_prompt && (
                          <div>
                            <span className="text-[10px] font-medium text-muted-foreground">Consistency Prompt</span>
                            <p className="text-[10px] text-muted-foreground bg-muted/50 p-1.5 rounded mt-0.5 line-clamp-3">
                              {character.visual_consistency_prompt}
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
