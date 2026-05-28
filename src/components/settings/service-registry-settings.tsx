"use client"

import { useCallback, useEffect, useState } from "react"
import { Package, Plus, Trash2, Edit3 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  serviceRegistryList,
  serviceRegistrySave,
  serviceRegistryDelete,
  type ServiceRegistryEntry,
} from "@/lib/api"

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

export function ServiceRegistrySettings() {
  const [services, setServices] = useState<ServiceRegistryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showDlg, setShowDlg] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [desc, setDesc] = useState("")

  const refresh = useCallback(async () => {
    try {
      const data = await serviceRegistryList()
      setServices(data)
    } catch {
      toast.error("Failed to load services")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const save = async () => {
    if (!name.trim() || !url.trim()) return
    try {
      const data = await serviceRegistrySave({ name: name.trim(), url: url.trim(), description: desc.trim() })
      setServices(data)
      setShowDlg(false)
toast.success("服务已保存")
    } catch {
      toast.error("Failed to save service")
    }
  }

  const remove = async (svcName: string) => {
    if (!confirm(`Delete "${svcName}"?`)) return
    try {
      const data = await serviceRegistryDelete({ name: svcName })
      setServices(data)
toast.success("服务已删除")
    } catch {
      toast.error("Failed to delete service")
    }
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h2 className="text-lg font-semibold">服务管理</h2>
          <p className="text-sm text-muted-foreground">管理可复用的服务配置（名称、Git 地址、描述）</p>
        </div>
        <Button size="sm" onClick={() => { setName(""); setUrl(""); setDesc(""); setEditingIdx(null); setShowDlg(true) }}>
          <Plus className="h-3.5 w-3.5 mr-1" /> 添加服务
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-2">
        {services.length === 0 && (
          <div className="text-center text-muted-foreground py-12">
            <Package className="h-12 w-12 mx-auto mb-2 opacity-30" />
            <p>暂无服务，请点击"添加服务"进行注册。</p>
          </div>
        )}
        {services.map((svc) => (
          <div key={svc.name} className="flex items-center gap-3 p-3 border rounded-lg text-sm">
            <Package className="h-4 w-4 text-orange-500 shrink-0" />
            <span className="font-medium min-w-[120px]">{svc.name}</span>
            <span className="text-muted-foreground flex-1">{svc.description}</span>
            <span className="text-blue-500 text-xs font-mono">{svc.url}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => {
                setName(svc.name); setUrl(svc.url); setDesc(svc.description)
                setEditingIdx(services.indexOf(svc)); setShowDlg(true)
              }}>
              <Edit3 className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
              onClick={() => remove(svc.name)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <SimpleDialog open={showDlg} onClose={() => setShowDlg(false)} title="服务">
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">服务名称</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="service-name" disabled={editingIdx !== null} />
          </div>
          <div>
            <label className="text-sm font-medium">Git 地址</label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="git@gitlab.com:org/repo.git" />
          </div>
          <div>
            <label className="text-sm font-medium">服务描述</label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="该服务的职责描述" />
          </div>
          <Button onClick={save}>保存</Button>
        </div>
      </SimpleDialog>
    </div>
  )
}
