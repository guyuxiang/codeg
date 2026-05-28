"use client"

import { useCallback, useEffect, useState } from "react"
import {
  FolderGit2,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Globe,
  Package,
  Edit3,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  projectsList,
  projectsSave,
  projectsDelete,
  versionsSave,
  versionsDelete,
  servicesSave,
  servicesDelete,
  globalRulesSave,
  serviceRegistryList,
  gitRemoteBranches,
  type ProjectsConfig,
  type ServiceRegistryEntry,
} from "@/lib/api"

// ── Dialogs ────────────────────────────────────────────

function SimpleDialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border rounded-lg shadow-lg w-[480px] max-h-[80vh] overflow-auto p-6">
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        {children}
        <div className="mt-4 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────

export function ProjectsSettings() {
  const t = useTranslations("ProjectsSettings")
  const [cfg, setCfg] = useState<ProjectsConfig>({ rules: [], projects: {} })
  const [loading, setLoading] = useState(true)
  const [expandedProject, setExpandedProject] = useState<string | null>(null)
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null)

  // Dialogs
  const [showProjectDlg, setShowProjectDlg] = useState(false)
  const [showVersionDlg, setShowVersionDlg] = useState(false)
  const [showServiceDlg, setShowServiceDlg] = useState(false)
  const [showRulesDlg, setShowRulesDlg] = useState(false)

  // Edit state
  const [editingProject, setEditingProject] = useState<string>("")
  const [editingVersion, setEditingVersion] = useState<string>("")
  const [editingService, setEditingService] = useState<string>("")
  const [projDesc, setProjDesc] = useState("")
  const [projRules, setProjRules] = useState("")
  const [verDesc, setVerDesc] = useState("")
  const [svcUrl, setSvcUrl] = useState("")
  const [svcBranch, setSvcBranch] = useState("main")
  const [svcDesc, setSvcDesc] = useState("")
  const [globalRules, setGlobalRules] = useState("")
  const [registry, setRegistry] = useState<ServiceRegistryEntry[]>([])
  const [branchList, setBranchList] = useState<string[]>([])
  const [branchLoading, setBranchLoading] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const data = await projectsList()
      setCfg(data)
    } catch {
      toast.error("Failed to load projects")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    serviceRegistryList().then(setRegistry).catch(() => {})
  }, [refresh])

  // Load branches when URL changes
  useEffect(() => {
    if (!svcUrl) { setBranchList([]); return }
    setBranchLoading(true)
    gitRemoteBranches(svcUrl).then(setBranchList).catch(() => setBranchList([])).finally(() => setBranchLoading(false))
  }, [svcUrl])

  const saveProject = async () => {
    if (!editingProject.trim()) return
    try {
      const data = await projectsSave({
        name: editingProject,
        description: projDesc,
        rules: projRules
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      })
      setCfg(data)
      setShowProjectDlg(false)
      toast.success("Project saved")
    } catch {
      toast.error("Failed to save project")
    }
  }

  const deleteProject = async (name: string) => {
    try {
      const data = await projectsDelete({ name })
      setCfg(data)
      toast.success("Project deleted")
    } catch {
      toast.error("Failed to delete project")
    }
  }

  const saveVersion = async () => {
    if (!editingVersion.trim()) return
    try {
      const data = await versionsSave({
        project: expandedProject!,
        name: editingVersion,
        description: verDesc,
      })
      setCfg(data)
      setShowVersionDlg(false)
      toast.success("Version saved")
    } catch {
      toast.error("Failed to save version")
    }
  }

  const deleteVersion = async (name: string) => {
    try {
      const data = await versionsDelete({ project: expandedProject!, name })
      setCfg(data)
      toast.success("Version deleted")
    } catch {
      toast.error("Failed to delete version")
    }
  }

  const saveService = async () => {
    if (!editingService.trim()) return
    try {
      const data = await servicesSave({
        project: expandedProject!,
        version: currentVerName,
        name: editingService,
        url: svcUrl,
        branch: svcBranch,
        description: svcDesc,
      })
      setCfg(data)
      setShowServiceDlg(false)
      toast.success("Service saved")
    } catch {
      toast.error("Failed to save service")
    }
  }

  const deleteService = async (name: string) => {
    try {
      const data = await servicesDelete({
        project: expandedProject!,
        version: currentVerName,
        name,
      })
      setCfg(data)
      toast.success("Service deleted")
    } catch {
      toast.error("Failed to delete service")
    }
  }

  const saveRules = async () => {
    try {
      const data = await globalRulesSave({
        rules: globalRules
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      })
      setCfg(data)
      setShowRulesDlg(false)
      toast.success("Global rules saved")
    } catch {
      toast.error("Failed to save rules")
    }
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>

  // expandedVersion stores "project:version" — extract version part
  const currentVerName = (expandedVersion || "").includes(":")
    ? (expandedVersion || "").split(":").slice(1).join(":")
    : expandedVersion || ""

  const projNames = Object.keys(cfg.projects || {})
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setGlobalRules((cfg.rules || []).join("\n"))
              setShowRulesDlg(true)
            }}
          >
            <Edit3 className="h-3.5 w-3.5 mr-1" />
            {t("globalRules")}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditingProject("")
              setProjDesc("")
              setProjRules("")
              setShowProjectDlg(true)
            }}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t("addProject")}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {/* Global rules preview */}
        {(cfg.rules || []).length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <span>{t("globalRules")}:</span>
            {(cfg.rules || []).map((r, i) => (
              <Badge key={i} variant="secondary">
                {r}
              </Badge>
            ))}
          </div>
        )}

        {projNames.length === 0 && (
          <div className="text-center text-muted-foreground py-12">
            <FolderGit2 className="h-12 w-12 mx-auto mb-2 opacity-30" />
            <p>{t("noProjects")}</p>
          </div>
        )}

        {projNames.map((name) => {
          const proj = (cfg.projects || {})[name]
          if (!proj) return null
          const verNames = Object.keys(proj.versions || {})
          return (
            <div key={name} className="border rounded-lg">
              {/* Project row */}
              <div className="flex items-center gap-2 p-3">
                <button
                  onClick={() =>
                    setExpandedProject(
                      expandedProject === name ? null : name
                    )
                  }
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  {expandedProject === name ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <FolderGit2 className="h-4 w-4 text-blue-500" />
                  <span className="font-medium">{name}</span>
                </button>
                <span className="text-sm text-muted-foreground">
                  {proj.description}
                </span>
                {(proj.rules || []).length > 0 && (
                  <Badge variant="outline" className="text-[10px]">
                    {(proj.rules || []).length} rules
                  </Badge>
                )}
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setEditingProject(name)
                    setProjDesc(proj.description)
                    setProjRules((proj.rules || []).join("\n"))
                    setShowProjectDlg(true)
                  }}
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => {
                    if (confirm(`Delete project "${name}"?`))
                      deleteProject(name)
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Expanded: versions */}
              {expandedProject === name && (
                <div className="border-t bg-muted/20">
                  <div className="flex items-center justify-between px-6 py-2">
                    <span className="text-xs text-muted-foreground">
                      {t("versions")} ({verNames.length})
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setExpandedVersion("")
                        setEditingVersion("")
                        setVerDesc("")
                        setShowVersionDlg(true)
                      }}
                    >
                      <Plus className="h-3 w-3 mr-1" /> {t("addVersion")}
                    </Button>
                  </div>
                  {verNames.map((vname) => {
                    const ver = (proj.versions || {})[vname]
                    if (!ver) return null
                    return (
                      <div key={vname}>
                        <div className="flex items-center gap-2 px-6 py-2 border-t/50">
                          <button
                            onClick={() =>
                              setExpandedVersion(
                                expandedVersion ===
                                  `${name}:${vname}`
                                  ? null
                                  : `${name}:${vname}`
                              )
                            }
                            className="flex items-center gap-1"
                          >
                            {expandedVersion === `${name}:${vname}` ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                            <Globe className="h-3.5 w-3.5 text-green-500" />
                            <span className="text-sm font-medium">
                              {vname}
                            </span>
                          </button>
                          <span className="text-xs text-muted-foreground">
                            {ver.description}
                          </span>
                          <Badge variant="secondary" className="text-[10px]">
                            {(ver.services || []).length} services
                          </Badge>
                          <div className="flex-1" />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              setEditingVersion(vname)
                              setVerDesc(ver.description)
                              setShowVersionDlg(true)
                            }}
                          >
                            <Edit3 className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            onClick={() => {
                              if (
                                confirm(
                                  `Delete version "${vname}"?`
                                )
                              )
                                deleteVersion(vname)
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>

                        {/* Services within version */}
                        {expandedVersion === `${name}:${vname}` && (
                          <div className="bg-muted/30 px-10 py-2 space-y-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-muted-foreground">
                                {t("services")}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingService("")
                                  setSvcUrl("")
                                  setSvcBranch("main")
                                  setSvcDesc("")
                                  setShowServiceDlg(true)
                                }}
                              >
                                <Plus className="h-3 w-3 mr-1" />{" "}
                                {t("addService")}
                              </Button>
                            </div>
                            {(ver.services || []).map((svc) => (
                              <div
                                key={svc.name}
                                className="flex items-center gap-2 text-sm py-1"
                              >
                                <Package className="h-3.5 w-3.5 text-orange-500" />
                                <span className="font-medium">
                                  {svc.name}
                                </span>
                                <span className="text-muted-foreground">
                                  {svc.description}
                                </span>
                                <span className="text-[11px] text-muted-foreground/60">
                                  {svc.url}
                                </span>
                                <span className="text-[11px] text-blue-500">
                                  {svc.branch}
                                </span>
                                <div className="flex-1" />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => {
                                    setEditingService(svc.name)
                                    setSvcUrl(svc.url)
                                    setSvcBranch(svc.branch)
                                    setSvcDesc(svc.description)
                                    setShowServiceDlg(true)
                                  }}
                                >
                                  <Edit3 className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-destructive"
                                  onClick={() => {
                                    if (
                                      confirm(
                                        `Delete service "${svc.name}"?`
                                      )
                                    )
                                      deleteService(svc.name)
                                  }}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Project Dialog */}
      <SimpleDialog
        open={showProjectDlg}
        onClose={() => setShowProjectDlg(false)}
        title={t("project")}
      >
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">{t("projectName")}</label>
            <Input
              value={editingProject}
              onChange={(e) => setEditingProject(e.target.value)}
              placeholder={t("projectName")}
            />
          </div>
          <div>
            <label className="text-sm font-medium">{t("projectDesc")}</label>
            <Input
              value={projDesc}
              onChange={(e) => setProjDesc(e.target.value)}
              placeholder={t("projectDesc")}
            />
          </div>
          <div>
            <label className="text-sm font-medium">
              {t("projectRules")}
              <span className="text-muted-foreground ml-1 text-xs">
                (one per line)
              </span>
            </label>
            <textarea
              className="w-full min-h-[100px] rounded-md border bg-background px-3 py-2 text-sm font-mono"
              value={projRules}
              onChange={(e) => setProjRules(e.target.value)}
              placeholder={t("rulesPlaceholder")}
            />
          </div>
          <Button onClick={saveProject}>{t("save")}</Button>
        </div>
      </SimpleDialog>

      {/* Version Dialog */}
      <SimpleDialog
        open={showVersionDlg}
        onClose={() => setShowVersionDlg(false)}
        title={t("version")}
      >
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">{t("versionName")}</label>
            <Input
              value={editingVersion}
              onChange={(e) => setEditingVersion(e.target.value)}
              placeholder="main / develop / v2..."
            />
          </div>
          <div>
            <label className="text-sm font-medium">{t("versionDesc")}</label>
            <Input
              value={verDesc}
              onChange={(e) => setVerDesc(e.target.value)}
              placeholder={t("versionDesc")}
            />
          </div>
          <Button onClick={saveVersion}>{t("save")}</Button>
        </div>
      </SimpleDialog>

      {/* Service Dialog */}
      <SimpleDialog
        open={showServiceDlg}
        onClose={() => setShowServiceDlg(false)}
        title={t("service")}
      >
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">{t("serviceName")}</label>
            <Select value={editingService} onValueChange={(v) => {
              setEditingService(v)
              const entry = registry.find((r) => r.name === v)
              if (entry) {
                setSvcUrl(entry.url)
                setSvcDesc(entry.description)
              }
            }}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select from registry..." /></SelectTrigger>
              <SelectContent>
                {registry.map((r) => (
                  <SelectItem key={r.name} value={r.name}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">{t("serviceDesc")}</label>
            <Input value={svcDesc} onChange={(e) => setSvcDesc(e.target.value)} placeholder={t("serviceDesc")} />
          </div>
          <div>
            <label className="text-sm font-medium">{t("gitUrl")}</label>
            <Input value={svcUrl} disabled className="text-muted-foreground" />
          </div>
          <div>
            <label className="text-sm font-medium">{t("branch")}</label>
            {branchLoading ? (
              <p className="text-xs text-muted-foreground py-2">Loading branches...</p>
            ) : (
              <Select value={svcBranch} onValueChange={setSvcBranch}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select branch..." /></SelectTrigger>
                <SelectContent>
                  {branchList.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <Button onClick={saveService}>{t("save")}</Button>
        </div>
      </SimpleDialog>

      {/* Global Rules Dialog */}
      <SimpleDialog
        open={showRulesDlg}
        onClose={() => setShowRulesDlg(false)}
        title={t("globalRules")}
      >
        <div className="space-y-3">
          <label className="text-sm font-medium">
            {t("rulesHelp")}
            <span className="text-muted-foreground ml-1 text-xs">
              (one per line)
            </span>
          </label>
          <textarea
            className="w-full min-h-[150px] rounded-md border bg-background px-3 py-2 text-sm font-mono"
            value={globalRules}
            onChange={(e) => setGlobalRules(e.target.value)}
            placeholder={t("rulesPlaceholder")}
          />
          <Button onClick={saveRules}>{t("save")}</Button>
        </div>
      </SimpleDialog>
    </div>
  )
}
