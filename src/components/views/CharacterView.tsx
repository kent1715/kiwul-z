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
  { key: 'visual_consistency_prompt', label: 'Consistency Prompt', multiline: true },
]

export default function CharacterView() {
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
        toast({ title: 'Characters generated!' })
      } else {
        toast({ title: 'Error', description: 'Failed to generate characters', variant: 'destructive' })
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
    <div className="p-6 h-full overflow-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Character Bible
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Detailed character reference with visual consistency
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

      {characters.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <User className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No characters yet</h3>
          <p className="text-muted-foreground text-sm max-w-sm mb-4">
            Generate character bibles from the Workflow view first.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {characters.map((character) => (
            <Card key={character.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" />
                    {editingId === character.id ? (
                      <Input
                        value={editData.name || ''}
                        onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                        className="font-semibold h-8 max-w-xs"
                      />
                    ) : (
                      character.name
                    )}
                  </CardTitle>
                  <div className="flex gap-1">
                    {editingId === character.id ? (
                      <>
                        <Button size="sm" onClick={() => saveCharacter(character.id)} className="gap-1">
                          <Check className="h-3 w-3" /> Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => startEditing(character)} className="gap-1">
                        <Edit className="h-3.5 w-3.5" /> Edit
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-6">
                  {/* Reference Image */}
                  <div className="w-40 shrink-0">
                    <div className="w-40 h-52 rounded-lg bg-muted flex items-center justify-center overflow-hidden border">
                      {character.reference_image_path ? (
                        <img
                          src={character.reference_image_path}
                          alt={character.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-center p-3">
                          <ImageIcon className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                          <span className="text-[10px] text-muted-foreground block mb-2">No reference image</span>
                          <Button
                            size="sm"
                            className="gap-1 w-full"
                            onClick={() => generateReferenceImage(character.id)}
                          >
                            <Sparkles className="h-3 w-3" /> Generate
                          </Button>
                        </div>
                      )}
                    </div>
                    {character.reference_image_path && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full mt-2 gap-1"
                        onClick={() => generateReferenceImage(character.id)}
                      >
                        <RefreshCw className="h-3 w-3" /> Regenerate
                      </Button>
                    )}
                  </div>

                  {/* Character Details */}
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    {CHARACTER_FIELDS.filter((f) => f.key !== 'name').map(({ key, label, multiline }) => (
                      <div key={key} className={multiline ? 'col-span-2' : ''}>
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</label>
                        {editingId === character.id ? (
                          multiline ? (
                            <Textarea
                              value={(editData[key] as string) || ''}
                              onChange={(e) => setEditData({ ...editData, [key]: e.target.value })}
                              rows={2}
                              className="text-xs mt-0.5"
                            />
                          ) : (
                            <Input
                              value={(editData[key] as string) || ''}
                              onChange={(e) => setEditData({ ...editData, [key]: e.target.value })}
                              className="text-xs h-7 mt-0.5"
                            />
                          )
                        ) : (
                          <p className="text-sm mt-0.5 whitespace-pre-wrap">
                            {(character[key] as string) || '-'}
                          </p>
                        )}
                      </div>
                    ))}
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
