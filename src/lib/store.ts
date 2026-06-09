import { create } from 'zustand'

export type ViewType = 'projects' | 'workflow' | 'storyboard' | 'character' | 'providers'

export type WorkflowStep = 
  | 'idea'
  | 'storyline'
  | 'script'
  | 'storyboard'
  | 'character'
  | 'location'
  | 'images'
  | 'videos'
  | 'voice'
  | 'render'

export const WORKFLOW_STEPS: { key: WorkflowStep; label: string; icon: string }[] = [
  { key: 'idea', label: 'Idea', icon: 'Lightbulb' },
  { key: 'storyline', label: 'Storyline', icon: 'GitBranch' },
  { key: 'script', label: 'Script', icon: 'FileText' },
  { key: 'storyboard', label: 'Storyboard', icon: 'LayoutGrid' },
  { key: 'character', label: 'Character', icon: 'User' },
  { key: 'location', label: 'Location', icon: 'MapPin' },
  { key: 'images', label: 'Images', icon: 'Image' },
  { key: 'videos', label: 'Videos', icon: 'Video' },
  { key: 'voice', label: 'Voice', icon: 'Mic' },
  { key: 'render', label: 'Render', icon: 'Film' },
]

export type ProjectStatus = 
  | 'draft'
  | 'idea_generated'
  | 'script_generated'
  | 'storyboard_ready'
  | 'character_ready'
  | 'images_ready'
  | 'videos_ready'
  | 'audio_ready'
  | 'rendered'
  | 'failed'

export interface Project {
  id: string
  title: string
  content_type: string
  language: string
  duration_seconds: number
  aspect_ratio: string
  resolution: string
  visual_style: string
  target_platform: string
  status: ProjectStatus
  niche?: string
  topic?: string
  audience?: string
  tone?: string
  config_json: string
  created_at: string
  updated_at: string
}

export interface Idea {
  id: string
  project_id: string
  title: string
  hook?: string
  angle?: string
  content_type?: string
  raw_json: string
  selected: boolean
}

export interface Storyboard {
  id: string
  project_id: string
  title: string
  duration_total: number
  format: string
  music_style?: string
  raw_json: string
}

export interface Scene {
  id: string
  project_id: string
  storyboard_id: string
  part_number: number
  scene_number: number
  start_time: number
  end_time: number
  duration: number
  action?: string
  vo?: string
  visual_description?: string
  scene_goal?: string
  image_prompt?: string
  negative_prompt?: string
  motion_prompt?: string
  image_path?: string
  video_path?: string
  audio_path?: string
  status: string
  locked: boolean
  seed?: number
}

export interface Character {
  id: string
  project_id: string
  name: string
  description?: string
  gender?: string
  age_range?: string
  ethnicity_style?: string
  face_description?: string
  hair_or_hijab?: string
  outfit?: string
  body_type?: string
  personality?: string
  visual_prompt?: string
  negative_prompt?: string
  reference_image_path?: string
  visual_consistency_prompt?: string
}

export interface LocationData {
  id: string
  project_id: string
  name: string
  description?: string
  lighting?: string
  camera_style?: string
  consistency_prompt?: string
  reference_image_path?: string
}

export interface Provider {
  id: string
  type: string
  name: string
  base_url: string
  model?: string
  config_json: string
  is_default: boolean
  is_active: boolean
}

interface AppState {
  // Navigation
  currentView: ViewType
  setCurrentView: (view: ViewType) => void
  
  // Project
  projects: Project[]
  currentProject: Project | null
  setProjects: (projects: Project[]) => void
  setCurrentProject: (project: Project | null) => void
  
  // Workflow
  currentStep: WorkflowStep
  setCurrentStep: (step: WorkflowStep) => void
  
  // Ideas
  ideas: Idea[]
  setIdeas: (ideas: Idea[]) => void
  
  // Storyboard
  storyboard: Storyboard | null
  setStoryboard: (storyboard: Storyboard | null) => void
  
  // Scenes
  scenes: Scene[]
  setScenes: (scenes: Scene[]) => void
  
  // Characters
  characters: Character[]
  setCharacters: (characters: Character[]) => void
  
  // Locations
  locations: LocationData[]
  setLocations: (locations: LocationData[]) => void
  
  // Providers
  providers: Provider[]
  setProviders: (providers: Provider[]) => void
  
  // Script
  script: string
  setScript: (script: string) => void
  
  // Storyline
  storyline: string
  setStoryline: (storyline: string) => void
  
  // Loading states
  generating: boolean
  setGenerating: (generating: boolean) => void
  
  // Create project dialog
  showCreateDialog: boolean
  setShowCreateDialog: (show: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  currentView: 'projects',
  setCurrentView: (view) => set({ currentView: view }),
  
  projects: [],
  currentProject: null,
  setProjects: (projects) => set({ projects }),
  setCurrentProject: (project) => set({ currentProject: project }),
  
  currentStep: 'idea',
  setCurrentStep: (step) => set({ currentStep: step }),
  
  ideas: [],
  setIdeas: (ideas) => set({ ideas }),
  
  storyboard: null,
  setStoryboard: (storyboard) => set({ storyboard }),
  
  scenes: [],
  setScenes: (scenes) => set({ scenes }),
  
  characters: [],
  setCharacters: (characters) => set({ characters }),
  
  locations: [],
  setLocations: (locations) => set({ locations }),
  
  providers: [],
  setProviders: (providers) => set({ providers }),
  
  script: '',
  setScript: (script) => set({ script }),
  
  storyline: '',
  setStoryline: (storyline) => set({ storyline }),
  
  generating: false,
  setGenerating: (generating) => set({ generating }),
  
  showCreateDialog: false,
  setShowCreateDialog: (show) => set({ showCreateDialog: show }),
}))
