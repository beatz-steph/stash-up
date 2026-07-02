"use client"

import { useToggleConfigMutation } from "../mutations/use-toggle-config"
import { Switch } from "@workspace/ui/components/switch"
import { Label } from "@workspace/ui/components/label"

// Local union — avoids importing the server-only @workspace/db into a client component.
interface NombaStatusToggleProps {
  status: string
}

export function NombaStatusToggle({ status }: NombaStatusToggleProps) {
  const mutation = useToggleConfigMutation()
  const isActive = status === "ACTIVE"

  return (
    <div className="flex items-center gap-2">
      <Switch
        id="nomba-status"
        checked={isActive}
        disabled={mutation.isPending}
        onCheckedChange={(checked) => {
          mutation.mutate(checked ? "ACTIVE" : "INVALID")
        }}
      />
      <Label htmlFor="nomba-status" className="text-sm font-medium text-su-muted cursor-pointer">
        {mutation.isPending ? "Updating..." : isActive ? "Integration Active" : "Integration Invalidated"}
      </Label>
    </div>
  )
}
