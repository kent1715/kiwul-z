'use client'

import { useAppStore, type Provider } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Edit,
  Check,
  Loader2,
  Settings,
  Zap,
  Cpu,
  Image as ImageIcon,
  Mic,
  Film,
  Wifi,
  WifiOff,
  Save,
  RotateCcw,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useToast } from '@/hooks/use-toast'

const PROVIDER_TYPE_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  llm: { icon: Cpu, label: 'LLM Provider', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  image: { icon: ImageIcon, label: 'Image Provider', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' },
  tts: { icon: Mic, label: 'TTS Provider', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  video: { icon: Film, label: 'Video Provider', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200' },
  render: { icon: Film, label: 'Render Provider', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' },
}

export default function ProviderView() {
  const { providers, setProviders, generating, setGenerating } = useAppStore()
  const { toast } = useToast()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<Provider>>({})
  const [testing, setTesting] = useState<string | null>(null)

  useEffect(() => {
    fetchProviders()
  }, [])

  async function fetchProviders() {
    try {
      const res = await fetch('/api/providers')
      if (res.ok) {
        const data = await res.json()
        setProviders(data)
      }
    } catch {
      // silently fail
    }
  }

  async function testConnection(id: string) {
    try {
      setTesting(id)
      const res = await fetch('/api/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (res.ok) {
        const data = await res.json()
        toast({
          title: data.success ? 'Connection OK' : 'Connection Failed',
          description: data.message || (data.success ? 'Provider is reachable.' : 'Could not connect to provider.'),
          variant: data.success ? 'default' : 'destructive',
        })
      } else {
        toast({ title: 'Error', description: 'Failed to test connection', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to test connection', variant: 'destructive' })
    } finally {
      setTesting(null)
    }
  }

  async function saveProvider(id: string) {
    try {
      setGenerating(true)
      const res = await fetch('/api/providers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...editData }),
      })
      if (res.ok) {
        const updated = await res.json()
        setProviders(providers.map((p) => (p.id === id ? { ...p, ...updated } : p)))
        setEditingId(null)
        setEditData({})
        toast({ title: 'Provider updated' })
      } else {
        toast({ title: 'Error', description: 'Failed to update provider', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to update provider', variant: 'destructive' })
    } finally {
      setGenerating(false)
    }
  }

  async function toggleActive(provider: Provider) {
    try {
      const res = await fetch('/api/providers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: provider.id, is_active: !provider.is_active }),
      })
      if (res.ok) {
        setProviders(providers.map((p) => (p.id === provider.id ? { ...p, is_active: !p.is_active } : p)))
        toast({ title: `Provider ${!provider.is_active ? 'activated' : 'deactivated'}` })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to toggle provider', variant: 'destructive' })
    }
  }

  function startEditing(provider: Provider) {
    setEditingId(provider.id)
    setEditData({
      name: provider.name,
      base_url: provider.base_url,
      model: provider.model,
    })
  }

  // Group by type
  const groupedProviders = providers.reduce<Record<string, Provider[]>>((acc, p) => {
    const type = p.type || 'other'
    if (!acc[type]) acc[type] = []
    acc[type].push(p)
    return acc
  }, {})

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          Provider Settings
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure AI providers for LLM, Image, TTS, Video, and Render
        </p>
      </div>

      {providers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Settings className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No providers configured</h3>
          <p className="text-muted-foreground text-sm max-w-sm">
            Add providers through the API to start using AI services.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedProviders).map(([type, typeProviders]) => {
            const config = PROVIDER_TYPE_CONFIG[type] || { icon: Cpu, label: type, color: 'bg-gray-100 text-gray-700' }
            const Icon = config.icon

            return (
              <div key={type}>
                <div className="flex items-center gap-2 mb-3">
                  <Badge className={`${config.color} gap-1`}>
                    <Icon className="h-3 w-3" />
                    {config.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{typeProviders.length} provider(s)</span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {typeProviders.map((provider) => (
                    <Card key={provider.id} className={`card-hover border-border/50 transition-all duration-200 ${provider.is_active ? '' : 'opacity-60'}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Icon className="h-4 w-4 text-primary" />
                            {editingId === provider.id ? (
                              <Input
                                value={editData.name || ''}
                                onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                                className="font-semibold h-8"
                              />
                            ) : (
                              provider.name
                            )}
                          </CardTitle>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => toggleActive(provider)}
                              className="flex items-center gap-1"
                            >
                              {provider.is_active ? (
                                <Badge className="bg-amber-500 text-white gap-1 text-[10px]">
                                  <Wifi className="h-2.5 w-2.5" /> Active
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="gap-1 text-[10px]">
                                  <WifiOff className="h-2.5 w-2.5" /> Inactive
                                </Badge>
                              )}
                            </button>
                            {editingId === provider.id ? (
                              <>
                                <Button size="sm" onClick={() => saveProvider(provider.id)} className="gap-1 h-7 text-xs">
                                  <Save className="h-3 w-3" /> Save
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setEditData({}) }} className="h-7 text-xs">
                                  <RotateCcw className="h-3 w-3" />
                                </Button>
                              </>
                            ) : (
                              <Button size="sm" variant="ghost" onClick={() => startEditing(provider)} className="h-7">
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2 pt-0">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Base URL</Label>
                            {editingId === provider.id ? (
                              <Input
                                value={editData.base_url || ''}
                                onChange={(e) => setEditData({ ...editData, base_url: e.target.value })}
                                className="text-xs h-7"
                              />
                            ) : (
                              <p className="text-xs font-mono truncate">{provider.base_url}</p>
                            )}
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Model</Label>
                            {editingId === provider.id ? (
                              <Input
                                value={editData.model || ''}
                                onChange={(e) => setEditData({ ...editData, model: e.target.value })}
                                className="text-xs h-7"
                              />
                            ) : (
                              <p className="text-xs">{provider.model || '-'}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 h-7 text-xs transition-all duration-200 hover:border-primary/50"
                            onClick={() => testConnection(provider.id)}
                            disabled={testing === provider.id}
                          >
                            {testing === provider.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Zap className="h-3 w-3" />
                            )}
                            Test Connection
                          </Button>
                          {provider.is_default && (
                            <Badge variant="secondary" className="text-[9px]">Default</Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
