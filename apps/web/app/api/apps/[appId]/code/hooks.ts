import { ComponentNode } from "@/core/interpreter"
import { useClerkSWR, useClerkSWRMutation } from "@/lib/swr"

export const useSaveCode = (appId: string) =>
  useClerkSWRMutation<
    void,
    {
      code: string
      prompt: string
    }
  >(`/api/apps/${appId}/code`, "PATCH")

export const useGetCode = (appId: string) =>
  useClerkSWR<{
    code: ComponentNode
    prompt: string
  }>(`/api/apps/${appId}/code`)
