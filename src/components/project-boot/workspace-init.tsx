"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  FolderGit2,
  Globe,
  Package,
  Play,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  projectsList,
  workspaceInit,
  type ProjectsConfig,
  type WorkspaceInitResult,
} from "@/lib/api"

export function WorkspaceInit() {
  const [cfg, setCfg] = useState<ProjectsConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [project, setProject] = useState("")
  const [version, setVersion] = useState("")
  const router = useRouter()
  const [initResult, setInitResult] = useState<WorkspaceInitResult | null>(null)
  const [initializing, setInitializing] = useState(false)

  useEffect(() => {
    projectsList()
      .then(setCfg)
      .catch(() => toast.error("Failed to load projects"))
      .finally(() => setLoading(false))
  }, [])

  const projKeys = Object.keys(cfg?.projects || {})
  const selectedProj = project ? (cfg?.projects || {})[project] ?? null : null
  const verKeys = Object.keys(selectedProj?.versions || {})
  const selectedVer = project && version
    ? ((cfg?.projects || {})[project]?.versions || {})[version] ?? null
    : null

  useEffect(() => {
    // Reset version when project changes
    setVersion("")
    setInitResult(null)
  }, [project])

  useEffect(() => {
    setInitResult(null)
  }, [version])

  const handleInit = useCallback(async () => {
    if (!project || !version) return
    setInitializing(true)
    setInitResult(null)
    try {
      const result = await workspaceInit({ project, version })
      setInitResult(result)
      toast.success(`Bare repos ready: ${result.workspaceDir}`)
      // Store path for workspace auto-open, then navigate
      if (typeof window !== "undefined") {
        sessionStorage.setItem("workspace_auto_open", result.workspaceDir)
      }
      setTimeout(() => router.push("/workspace"), 1500)
    } catch (e: any) {
      toast.error(`Init failed: ${e?.message || e}`)
    } finally {
      setInitializing(false)
    }
  }, [project, version])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading projects...
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col p-6 space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">Initialize Workspace</h2>
        <p className="text-sm text-muted-foreground">
          Select a project and version to clone bare repositories. AI sessions
          will create worktrees from these bases.
        </p>
      </div>

      {/* Project selector */}
      <div>
        <label className="text-sm font-medium mb-2 block">Project</label>
        <div className="space-y-1">
          {projKeys.map((name) => (
            <button
              key={name}
              onClick={() => setProject(name)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                project === name
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "hover:bg-muted/50"
              }`}
            >
              <FolderGit2 className="h-5 w-5 text-blue-500 shrink-0" />
              <div>
                <div className="font-medium">{name}</div>
                <div className="text-xs text-muted-foreground">
                  {(cfg?.projects || {})[name]?.description}
                </div>
              </div>
              <Badge variant="secondary" className="ml-auto text-[10px]">
                {Object.keys((cfg?.projects || {})[name]?.versions || {}).length} versions
              </Badge>
            </button>
          ))}
        </div>
      </div>

      {/* Version selector */}
      {selectedProj && (
        <div>
          <label className="text-sm font-medium mb-2 block">Version</label>
          <div className="space-y-1">
            {verKeys.map((vname) => {
              const ver = (selectedProj.versions || {})[vname]
              if (!ver) return null
              return (
                <button
                  key={vname}
                  onClick={() => setVersion(vname)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                    version === vname
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <Globe className="h-5 w-5 text-green-500 shrink-0" />
                  <div>
                    <div className="font-medium">{vname}</div>
                    <div className="text-xs text-muted-foreground">
                      {ver.description}
                    </div>
                  </div>
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    {(ver.services || []).length} services
                  </Badge>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Services preview */}
      {selectedVer && (
        <div>
          <label className="text-sm font-medium mb-2 block">
            Services to clone
          </label>
          <div className="border rounded-lg divide-y">
            {(selectedVer.services || []).map((svc) => (
              <div
                key={svc.name}
                className="flex items-center gap-3 p-3 text-sm"
              >
                <Package className="h-4 w-4 text-orange-500 shrink-0" />
                <span className="font-medium">{svc.name}</span>
                <span className="text-muted-foreground">{svc.description}</span>
                <span className="text-blue-500 text-xs ml-auto">
                  {svc.branch}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Init button */}
      {selectedVer && (
        <Button
          size="lg"
          className="w-full"
          onClick={handleInit}
          disabled={initializing}
        >
          {initializing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Cloning bare repos...
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              Sync Bare Repositories
            </>
          )}
        </Button>
      )}

      {/* Results */}
      {initResult && (
        <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            Bare repositories ready
          </div>
          <div className="text-sm text-muted-foreground font-mono">
            {initResult.workspaceDir}
          </div>
          <div className="flex gap-3 text-xs">
            <Badge variant="secondary">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {initResult.cloned} cloned
            </Badge>
            <Badge variant="secondary">
              <RefreshCw className="h-3 w-3 mr-1" />
              {initResult.updated} updated
            </Badge>
            {initResult.failed > 0 && (
              <Badge variant="destructive">
                <XCircle className="h-3 w-3 mr-1" />
                {initResult.failed} failed
              </Badge>
            )}
          </div>
          <div className="space-y-1 text-xs">
            {initResult.services.map((s) => (
              <div key={s.service} className="flex items-center gap-2 font-mono">
                {s.status === "cloned" || s.status === "updated" ? (
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                ) : (
                  <XCircle className="h-3 w-3 text-red-500" />
                )}
                <span>{s.service}</span>
                <span className="text-muted-foreground">— {s.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
