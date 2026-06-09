'use client'

import { useAppStore, WORKFLOW_STEPS, type WorkflowStep } from '@/lib/store'
import { cn } from '@/lib/utils'
import {
  Lightbulb,
  GitBranch,
  FileText,
  LayoutGrid,
  User,
  MapPin,
  Image,
  Video,
  Mic,
  Film,
  Check,
  Loader2,
  Circle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

const ICON_MAP: Record<string, React.ElementType> = {
  Lightbulb,
  GitBranch,
  FileText,
  LayoutGrid,
  User,
  MapPin,
  Image,
  Video,
  Mic,
  Film,
}

const STEP_DESCRIPTIONS: Record<WorkflowStep, string> = {
  idea: 'Generate creative ideas',
  storyline: 'Build the narrative structure',
  script: 'Write the full script',
  storyboard: 'Plan scenes and timing',
  character: 'Design characters',
  location: 'Define locations',
  images: 'Generate scene images',
  videos: 'Create scene videos',
  voice: 'Generate voice-over',
  render: 'Final rendering & export',
}

function getStepStatus(step: WorkflowStep, currentStep: WorkflowStep): 'completed' | 'current' | 'upcoming' {
  const stepOrder = WORKFLOW_STEPS.map((s) => s.key)
  const stepIdx = stepOrder.indexOf(step)
  const currentIdx = stepOrder.indexOf(currentStep)
  if (stepIdx < currentIdx) return 'completed'
  if (stepIdx === currentIdx) return 'current'
  return 'upcoming'
}

export default function WorkflowView() {
  const { currentStep, setCurrentStep, currentProject } = useAppStore()

  if (!currentProject) return null

  return (
    <div className="flex h-full">
      {/* Workflow Stepper - Left Panel */}
      <div className="w-72 border-r border-border/50 bg-muted/30 p-4 flex flex-col rounded-r-xl">
        <div className="gradient-warm rounded-lg px-3 py-3 mb-4">
          <h3 className="font-semibold text-sm">Workflow Pipeline</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Follow each step to create your content</p>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-1">
            {WORKFLOW_STEPS.map((step, index) => {
              const status = getStepStatus(step.key, currentStep)
              const Icon = ICON_MAP[step.icon]
              const isActive = currentStep === step.key

              return (
                <button
                  key={step.key}
                  onClick={() => setCurrentStep(step.key)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-200 text-sm card-hover',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'hover:bg-accent',
                    status === 'completed' && !isActive && 'text-muted-foreground'
                  )}
                >
                  {/* Step number / status indicator */}
                  <div
                    className={cn(
                      'flex items-center justify-center w-7 h-7 rounded-full shrink-0 text-xs font-medium border-2 transition-all duration-200',
                      isActive
                        ? 'border-primary-foreground bg-primary text-primary-foreground'
                        : status === 'completed'
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-muted-foreground/30 bg-background text-muted-foreground'
                    )}
                  >
                    {status === 'completed' && !isActive ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <span>{index + 1}</span>
                    )}
                  </div>

                  {/* Icon */}
                  <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary-foreground' : 'text-muted-foreground')} />

                  {/* Label */}
                  <div className="min-w-0 flex-1">
                    <div className={cn('font-medium truncate', isActive && 'text-primary-foreground')}>
                      {step.label}
                    </div>
                    <div className={cn(
                      'text-[10px] truncate',
                      isActive ? 'text-primary-foreground/70' : 'text-muted-foreground'
                    )}>
                      {STEP_DESCRIPTIONS[step.key]}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </ScrollArea>

        {/* Project Info */}
        <div className="border-t border-border/50 pt-3 mt-3 px-2">
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">Project:</span>{' '}
            <span className="truncate block">{currentProject.title}</span>
          </div>
          <div className="flex gap-2 mt-1 text-[10px] text-muted-foreground">
            <span>{currentProject.duration_seconds}s</span>
            <span>·</span>
            <span>{currentProject.aspect_ratio}</span>
            <span>·</span>
            <span>{currentProject.language}</span>
          </div>
        </div>
      </div>

      {/* Step Content - Right Panel */}
      <div className="flex-1 overflow-auto">
        <StepContent step={currentStep} />
      </div>
    </div>
  )
}

function StepContent({ step }: { step: WorkflowStep }) {
  // Lazy load step components
  const StepComponent = STEP_COMPONENTS[step]
  if (!StepComponent) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>Step component not implemented yet</p>
      </div>
    )
  }
  return <StepComponent />
}

// We'll import these dynamically to avoid circular deps
import IdeaStep from '@/components/steps/IdeaStep'
import StorylineStep from '@/components/steps/StorylineStep'
import ScriptStep from '@/components/steps/ScriptStep'
import StoryboardStep from '@/components/steps/StoryboardStep'
import CharacterStep from '@/components/steps/CharacterStep'
import LocationStep from '@/components/steps/LocationStep'
import ImagesStep from '@/components/steps/ImagesStep'
import VideosStep from '@/components/steps/VideosStep'
import VoiceStep from '@/components/steps/VoiceStep'
import RenderStep from '@/components/steps/RenderStep'

const STEP_COMPONENTS: Record<WorkflowStep, React.ElementType> = {
  idea: IdeaStep,
  storyline: StorylineStep,
  script: ScriptStep,
  storyboard: StoryboardStep,
  character: CharacterStep,
  location: LocationStep,
  images: ImagesStep,
  videos: VideosStep,
  voice: VoiceStep,
  render: RenderStep,
}
