'use client'

import { useAppStore, type LocationData } from '@/lib/store'
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
  MapPin,
  Image as ImageIcon,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useToast } from '@/hooks/use-toast'

const LOCATION_FIELDS: { key: keyof LocationData; label: string; multiline?: boolean }[] = [
  { key: 'name', label: 'Name' },
  { key: 'description', label: 'Description', multiline: true },
  { key: 'lighting', label: 'Lighting' },
  { key: 'camera_style', label: 'Camera Style' },
  { key: 'consistency_prompt', label: 'Consistency Prompt', multiline: true },
]

export default function LocationStep() {
  const { currentProject, locations, setLocations, generating, setGenerating } = useAppStore()
  const { toast } = useToast()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<LocationData>>({})

  useEffect(() => {
    if (currentProject) {
      fetchLocations()
    }
  }, [currentProject])

  async function fetchLocations() {
    if (!currentProject) return
    try {
      const res = await fetch(`/api/locations?project_id=${currentProject.id}`)
      if (res.ok) {
        const data = await res.json()
        setLocations(data)
      }
    } catch {
      // silently fail
    }
  }

  async function generateLocations() {
    if (!currentProject) return
    try {
      setGenerating(true)
      const res = await fetch('/api/locations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: currentProject.id }),
      })
      if (res.ok) {
        const data = await res.json()
        const locList = Array.isArray(data) ? data : data.locations || []
        setLocations(locList)
        toast({ title: 'Locations generated!', description: `${locList.length} locations created.` })
      } else {
        const err = await res.json()
        toast({ title: 'Error', description: err.error || 'Failed to generate locations', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to generate locations', variant: 'destructive' })
    } finally {
      setGenerating(false)
    }
  }

  async function generateReferenceImage(id: string) {
    try {
      const res = await fetch(`/api/locations/${id}/reference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (res.ok) {
        const data = await res.json()
        setLocations(locations.map((l) => (l.id === id ? { ...l, reference_image_path: data.reference_image_path } : l)))
        toast({ title: 'Reference image generated!' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to generate reference image', variant: 'destructive' })
    }
  }

  async function saveLocation(id: string) {
    try {
      const res = await fetch(`/api/locations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      })
      if (res.ok) {
        const updated = await res.json()
        setLocations(locations.map((l) => (l.id === id ? { ...l, ...updated } : l)))
        setEditingId(null)
        setEditData({})
        toast({ title: 'Location updated' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to update location', variant: 'destructive' })
    }
  }

  function startEditing(location: LocationData) {
    setEditingId(location.id)
    const data: Partial<LocationData> = {}
    LOCATION_FIELDS.forEach(({ key }) => {
      data[key] = location[key]
    })
    setEditData(data)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Locations
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Define locations for your scenes
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={generateLocations} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Regenerate
          </Button>
          <Button onClick={generateLocations} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate
          </Button>
        </div>
      </div>

      {generating && locations.length === 0 ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : locations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <MapPin className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No locations yet</h3>
          <p className="text-muted-foreground text-sm max-w-sm mb-4">
            Generate location descriptions with lighting, camera style, and consistency prompts.
          </p>
          <Button onClick={generateLocations} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate Locations
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {locations.map((location) => (
            <Card key={location.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    {editingId === location.id ? (
                      <Input
                        value={editData.name || ''}
                        onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                        className="font-semibold h-8"
                      />
                    ) : (
                      location.name
                    )}
                  </CardTitle>
                  <div className="flex gap-1">
                    {editingId === location.id ? (
                      <Button size="sm" onClick={() => saveLocation(location.id)} className="gap-1">
                        <Check className="h-3 w-3" /> Save
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => startEditing(location)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  {/* Reference Image */}
                  <div className="w-36 h-24 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden border">
                    {location.reference_image_path ? (
                      <img
                        src={location.reference_image_path}
                        alt={location.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center p-2">
                        <ImageIcon className="h-5 w-5 text-muted-foreground/40 mx-auto mb-1" />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[9px] gap-1"
                          onClick={() => generateReferenceImage(location.id)}
                        >
                          <Sparkles className="h-2.5 w-2.5" /> Generate Ref
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Location Info */}
                  <div className="flex-1 space-y-2 min-w-0">
                    {editingId === location.id ? (
                      <>
                        {LOCATION_FIELDS.filter((f) => f.key !== 'name').map(({ key, label, multiline }) => (
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
                        {location.description && (
                          <p className="text-sm">{location.description}</p>
                        )}
                        <div className="flex flex-wrap gap-1.5">
                          {location.lighting && (
                            <Badge variant="secondary" className="text-[10px]">{location.lighting}</Badge>
                          )}
                          {location.camera_style && (
                            <Badge variant="secondary" className="text-[10px]">{location.camera_style}</Badge>
                          )}
                        </div>
                        {location.consistency_prompt && (
                          <p className="text-[10px] text-muted-foreground bg-muted/50 p-1.5 rounded line-clamp-2">
                            {location.consistency_prompt}
                          </p>
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
