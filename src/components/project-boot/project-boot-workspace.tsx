"use client"

import { useTranslations } from "next-intl"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ShadcnLauncher } from "./shadcn/shadcn-launcher"
import { WorkspaceInit } from "./workspace-init"

export function ProjectBootWorkspace() {
  const t = useTranslations("ProjectBoot")

  return (
    <Tabs defaultValue="workspace" className="flex h-full flex-col gap-0">
      <div className="shrink-0 border-b px-4 py-2">
        <TabsList>
          <TabsTrigger value="workspace">{t("tabs.workspace")}</TabsTrigger>
          <TabsTrigger value="shadcn">{t("tabs.shadcn")}</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="workspace" className="min-h-0 flex-1 overflow-auto">
        <WorkspaceInit />
      </TabsContent>

      <TabsContent value="shadcn" className="min-h-0 flex-1">
        <ShadcnLauncher />
      </TabsContent>
    </Tabs>
  )
}
