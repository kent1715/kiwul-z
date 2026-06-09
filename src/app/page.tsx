'use client'

import { useAppStore, type ViewType, WORKFLOW_STEPS } from '@/lib/store'
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarInset,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import {
  Sparkles,
  FolderOpen,
  GitBranch,
  LayoutGrid,
  User,
  Settings,
  Film,
  ChevronLeft,
  Cpu,
  Clapperboard,
} from 'lucide-react'
import { cn } from '@/lib/utils'

import ProjectListView from '@/components/views/ProjectListView'
import CreateProjectDialog from '@/components/views/CreateProjectDialog'
import WorkflowView from '@/components/views/WorkflowView'
import StoryboardView from '@/components/views/StoryboardView'
import CharacterView from '@/components/views/CharacterView'
import ProviderView from '@/components/views/ProviderView'

const NAV_ITEMS: { view: ViewType; label: string; icon: React.ElementType; requiresProject?: boolean }[] = [
  { view: 'projects', label: 'Projects', icon: FolderOpen },
  { view: 'workflow', label: 'Workflow', icon: GitBranch, requiresProject: true },
  { view: 'storyboard', label: 'Storyboard', icon: LayoutGrid, requiresProject: true },
  { view: 'character', label: 'Character', icon: User, requiresProject: true },
  { view: 'providers', label: 'Providers', icon: Settings },
]

function ViewRenderer({ view }: { view: ViewType }) {
  switch (view) {
    case 'projects':
      return <ProjectListView />
    case 'workflow':
      return <WorkflowView />
    case 'storyboard':
      return <StoryboardView />
    case 'character':
      return <CharacterView />
    case 'providers':
      return <ProviderView />
    default:
      return <ProjectListView />
  }
}

export default function Home() {
  const { currentView, setCurrentView, currentProject, setCurrentProject } = useAppStore()

  return (
    <SidebarProvider>
      <Sidebar variant="sidebar" collapsible="icon" side="left">
        <SidebarHeader className="p-4 pb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary via-primary/90 to-primary/70 flex items-center justify-center shrink-0 shadow-sm">
              <Clapperboard className="h-4.5 w-4.5 text-primary-foreground" />
            </div>
            <div className="flex flex-col group-data-[collapsible=icon]:hidden">
              <span className="font-bold text-sm leading-tight tracking-tight">Kiwul Content</span>
              <span className="text-[10px] text-sidebar-foreground/50 font-medium tracking-widest uppercase">Studio</span>
            </div>
          </div>
        </SidebarHeader>

        <SidebarSeparator className="mx-3" />

        <SidebarContent>
          {/* Main Navigation */}
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] tracking-widest uppercase font-semibold text-sidebar-foreground/40">Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.map((item) => {
                  const isDisabled = item.requiresProject && !currentProject
                  const isActive = currentView === item.view
                  return (
                    <SidebarMenuItem key={item.view}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => {
                          if (!isDisabled) setCurrentView(item.view)
                        }}
                        tooltip={item.label}
                        className={cn(
                          'transition-all duration-200',
                          isActive && 'glow-primary',
                          isDisabled && 'opacity-30 cursor-not-allowed'
                        )}
                      >
                        <item.icon className={cn('h-4 w-4 transition-colors', isActive && 'text-sidebar-primary')} />
                        <span className={cn('font-medium', isActive && 'text-sidebar-primary')}>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Current Project Info */}
          {currentProject && (
            <>
              <SidebarSeparator className="mx-3" />
              <SidebarGroup>
                <SidebarGroupLabel className="text-[10px] tracking-widest uppercase font-semibold text-sidebar-foreground/40">Current Project</SidebarGroupLabel>
                <SidebarGroupContent>
                  <div className="px-2 py-1.5 group-data-[collapsible=icon]:hidden">
                    <div className="rounded-lg bg-sidebar-accent/50 p-3 border border-sidebar-border/50">
                      <p className="text-sm font-semibold truncate">{currentProject.title}</p>
                      <p className="text-[10px] text-sidebar-foreground/50 truncate mt-0.5">
                        {currentProject.content_type.replace(/_/g, ' ')} · {currentProject.duration_seconds}s · {currentProject.aspect_ratio}
                      </p>
                      <button
                        onClick={() => {
                          setCurrentProject(null)
                          setCurrentView('projects')
                        }}
                        className="text-[10px] text-sidebar-foreground/40 hover:text-sidebar-primary flex items-center gap-0.5 mt-2 transition-colors duration-200"
                      >
                        <ChevronLeft className="h-2.5 w-2.5" />
                        Back to projects
                      </button>
                    </div>
                  </div>
                </SidebarGroupContent>
              </SidebarGroup>
            </>
          )}
        </SidebarContent>

        <SidebarFooter>
          <SidebarSeparator className="mx-3" />
          <div className="px-3 py-2 group-data-[collapsible=icon]:hidden">
            <div className="flex items-center gap-1.5 text-[10px] text-sidebar-foreground/30 font-medium">
              <Sparkles className="h-3 w-3" />
              <span>Powered by Local AI</span>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>

      {/* Main Content */}
      <SidebarInset>
        <div className="flex flex-col min-h-svh">
          {/* Top Bar - More refined */}
          <header className="flex items-center gap-2 px-4 py-2.5 border-b bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
            <SidebarTrigger className="-ml-1 hover:bg-accent transition-colors" />
            <Separator orientation="vertical" className="h-4" />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Cpu className="h-3.5 w-3.5" />
              <span className="font-medium">
                {currentView === 'projects' && 'Projects'}
                {currentView === 'workflow' && `Workflow · ${currentProject?.title || ''}`}
                {currentView === 'storyboard' && `Storyboard · ${currentProject?.title || ''}`}
                {currentView === 'character' && `Characters · ${currentProject?.title || ''}`}
                {currentView === 'providers' && 'Provider Settings'}
              </span>
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 overflow-auto">
            <ViewRenderer view={currentView} />
          </main>
        </div>
      </SidebarInset>

      {/* Create Project Dialog */}
      <CreateProjectDialog />
    </SidebarProvider>
  )
}
