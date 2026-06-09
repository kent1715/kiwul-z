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
        <SidebarHeader className="p-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Film className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="flex flex-col group-data-[collapsible=icon]:hidden">
              <span className="font-bold text-sm leading-tight">Kiwul Content</span>
              <span className="text-[10px] text-sidebar-foreground/60">Studio</span>
            </div>
          </div>
        </SidebarHeader>

        <SidebarSeparator />

        <SidebarContent>
          {/* Main Navigation */}
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.map((item) => {
                  const isDisabled = item.requiresProject && !currentProject
                  return (
                    <SidebarMenuItem key={item.view}>
                      <SidebarMenuButton
                        isActive={currentView === item.view}
                        onClick={() => {
                          if (!isDisabled) setCurrentView(item.view)
                        }}
                        tooltip={item.label}
                        className={cn(isDisabled && 'opacity-40 cursor-not-allowed')}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
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
              <SidebarSeparator />
              <SidebarGroup>
                <SidebarGroupLabel>Current Project</SidebarGroupLabel>
                <SidebarGroupContent>
                  <div className="px-2 py-1 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate">{currentProject.title}</p>
                    <p className="text-[10px] text-sidebar-foreground/60 truncate">
                      {currentProject.content_type.replace(/_/g, ' ')} · {currentProject.duration_seconds}s · {currentProject.aspect_ratio}
                    </p>
                    <button
                      onClick={() => {
                        setCurrentProject(null)
                        setCurrentView('projects')
                      }}
                      className="text-[10px] text-sidebar-foreground/50 hover:text-sidebar-foreground flex items-center gap-0.5 mt-1 transition-colors"
                    >
                      <ChevronLeft className="h-2.5 w-2.5" />
                      Back to projects
                    </button>
                  </div>
                </SidebarGroupContent>
              </SidebarGroup>
            </>
          )}
        </SidebarContent>

        <SidebarFooter>
          <SidebarSeparator />
          <div className="px-2 py-1 group-data-[collapsible=icon]:hidden">
            <div className="flex items-center gap-1.5 text-[10px] text-sidebar-foreground/50">
              <Sparkles className="h-3 w-3" />
              <span>Powered by Local AI</span>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>

      {/* Main Content */}
      <SidebarInset>
        <div className="flex flex-col h-svh">
          {/* Top Bar */}
          <header className="flex items-center gap-2 px-4 py-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="h-4" />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Cpu className="h-3.5 w-3.5" />
              <span>
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
