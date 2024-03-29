"use client"

import { useClerk } from "@clerk/nextjs"
import { ArrowPathIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline"
import * as ToggleGroup from "@radix-ui/react-toggle-group"
import { useCompletion } from "ai/react"
import { useGetCode, useSaveCode } from "app/api/apps/[appId]/code/hooks"
import { useGetTheme, useUpdateTheme } from "app/api/apps/[appId]/theme/hooks"
import { Palette } from "lucide-react"
import React, { useEffect, useState } from "react"
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"

import { CommandBar } from "@/components/CommandBar"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ThemeColor } from "@/db/schema"

import Chat from "./Chat"
import { CodeView } from "./CodeView"
import { editorEvents } from "./editorEvents"
import { ASTtoCTTransformer } from "./lang/astTransformer"
import { CodeProcessor } from "./lang/codeProcessor"
import { ProgramNode } from "./lang/codeTree"

export function Editor({ appId, appName }: { appId: string; appName?: string }) {
  // const clerk = useClerk()
  const completionContainerRef = React.useRef<HTMLDivElement>(null)
  const iframeRef = React.useRef<HTMLIFrameElement>(null)

  const [astTransformer] = React.useState(() => new ASTtoCTTransformer({ topLevelComponent: true }))
  const [codeProcessor] = React.useState(() => new CodeProcessor({ appId }))
  const [codeTree, setCodeTree] = React.useState<ProgramNode | null>(null)

  const [isLeftResizing, setIsLeftResizing] = useState(false)
  const [isRightResizing, setRightIsResizing] = useState(false)

  const codeQuery = useGetCode(appId)
  const saveCode = useSaveCode(appId)

  const [isFinished, setIsFinished] = useState(false)

  const { completion, input, handleInputChange, handleSubmit, isLoading, setInput } = useCompletion(
    {
      api: `/api/apps/${appId}/completion`,
      onResponse: (response) => {
        if (response.ok) {
          setIsFinished(false)
          codeProcessor.reset()
        }
      },
      onFinish: (prompt, completion) => {
        saveCode.trigger({ code: completion, prompt }).then(() => {
          setIsFinished(true)
        })
      },
    },
  )

  const prodAppURL = `${window.location.protocol}//${appId}.${window.location.host}`
  const devAppURL = `${window.location.protocol}//dev-${appId}.${window.location.host}`

  React.useEffect(() => {
    if (iframeRef.current) {
      editorEvents.setDevIframe(iframeRef.current)
    }
  }, [iframeRef.current])

  React.useEffect(() => {
    if (completionContainerRef.current) {
      completionContainerRef.current.scrollTop = completionContainerRef.current.scrollHeight
    }
  }, [completion])

  // Sets the initial prompt if there is one
  React.useEffect(() => {
    if (codeQuery.data?.prompt) {
      setInput(codeQuery.data.prompt)
    }
  }, [codeQuery.data?.prompt])

  const isCodeLoading = codeQuery.isLoading
  const code = `function App(){${
    isCodeLoading ? "}" : isLoading ? completion : codeQuery.data?.code
  }`

  React.useEffect(() => {
    // codeProcessor.setApiTokenFn(() => clerk.client.activeSessions[0]?.getToken() as any)
    // codeProcessor.extend((ast) => astTransformer.transform(ast))
    // const removeListener = codeProcessor.onAST((codeTree) => {
    //   console.log("codeTree emitted", codeTree)
    //   setCodeTree(codeTree)
    // })
    // return () => {
    //   removeListener()
    // }
  }, [codeProcessor, astTransformer])

  React.useEffect(() => {
    // async function processCode() {
    //   if (isCodeLoading) {
    //     return
    //   }
    //   if (isLoading) {
    //     await codeProcessor.processStep(code)
    //   } else {
    //     // in case processing was running, reset it
    //     codeProcessor.reset()
    //     if (!codeQuery.data?.code) {
    //       return
    //     }
    //     const codeTree = codeProcessor.process(code)
    //     console.log("FINAL --- codeTree", codeTree)
    //     setCodeTree(codeTree)
    //   }
    // }
    // processCode()
  }, [code, isFinished, isLoading, codeProcessor, isCodeLoading])

  return (
    <div className="overflow-hidden" style={{ height: "calc(100% - 32px)" }}>
      <PanelGroup direction="horizontal" disablePointerEventsDuringResize={true} className="h-full">
        <Panel defaultSize={20} minSize={15} className="pb-3 pl-2">
          <Chat
            isLoading={codeQuery.isLoading}
            existingPrompt={Boolean(codeQuery.data?.prompt)}
            input={input}
            handleInputChange={handleInputChange}
            handleSubmit={handleSubmit}
            isProcessing={isLoading}
          />
        </Panel>
        <PanelResizeHandle
          className={
            "mb-3 ml-1 mr-1 flex w-3 cursor-ew-resize items-center justify-center rounded-lg transition-colors" +
            (isLeftResizing ? " bg-slate-300" : " hover:bg-slate-200")
          }
          onDragging={(isDragging) => {
            setIsLeftResizing(isDragging)
          }}
        >
          <div className="h-12 w-0.5 bg-gray-400"></div>
        </PanelResizeHandle>
        <Panel defaultSize={40} minSize={30} className="pb-3">
          <CodeView
            appId={appId}
            ref={completionContainerRef}
            isFinished={isFinished}
            isLoading={isLoading}
            code={code}
            codeTree={codeTree}
          />
        </Panel>
        <PanelResizeHandle
          className={
            "mb-3 ml-1 mr-1 flex w-3 cursor-ew-resize items-center justify-center rounded-lg transition-colors" +
            (isRightResizing ? " bg-slate-300" : " hover:bg-slate-200")
          }
          onDragging={(isDragging) => {
            setRightIsResizing(isDragging)
          }}
        >
          <div className="h-12 w-0.5 bg-gray-400"></div>
        </PanelResizeHandle>
        <Panel defaultSize={40} minSize={30} className="pb-3 pr-2">
          <div className="h-full overflow-hidden rounded-xl border border-slate-300 shadow-md">
            <div className="flex h-8 items-center  justify-center bg-slate-300 pl-4">
              <button
                className="mr-1 h-6 cursor-pointer rounded px-1 py-1 transition-colors hover:bg-slate-400"
                onClick={() => {
                  editorEvents.refresh()
                }}
              >
                <ArrowPathIcon className="h-full" />
              </button>
              <div className="mr-1 w-4/5 rounded-md bg-white px-2 py-1 text-sm">{devAppURL}</div>
              <a
                href={devAppURL}
                target="_blank"
                rel="noreferrer"
                className="h-6 cursor-pointer rounded px-1 py-1 transition-colors hover:bg-slate-400"
              >
                <ArrowTopRightOnSquareIcon className="h-full" />
              </a>
              <ThemePopover appId={appId} isLoading={codeQuery.isLoading} />
            </div>
            <iframe
              ref={iframeRef}
              src={devAppURL}
              title={appName || ""}
              className="w-full"
              style={{
                height: "calc(100% - 52px)",
              }}
              allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking"
              sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts allow-downloads allow-pointer-lock"
            ></iframe>
            <div className="h-5 bg-slate-300"></div>
          </div>
        </Panel>
      </PanelGroup>

      <CommandBar
        commandList={[
          {
            id: "open-dev-in-new-tab",
            title: "Open dev page (in new tab)",
            icon: <ArrowTopRightOnSquareIcon className="h-6" />,
            onSelect: () => {
              window.open(devAppURL, "_blank")
            },
          },
        ]}
      />
    </div>
  )
}

function ThemePopover({ appId, isLoading }: { appId: string; isLoading: boolean }) {
  const [open, setOpen] = useState(false)

  const [color, setColor] = useState<ThemeColor>("zinc")
  const [radius, setRadius] = useState<string>("0.75rem")

  const themeQuery = useGetTheme(appId)
  const updateTheme = useUpdateTheme(appId)

  const theme = themeQuery.data?.theme

  const handleColorChanged = (color: ThemeColor) => {
    if (color) {
      setColor(color)
    }
  }

  const handleRadiusChanged = (radius: string) => {
    if (radius) {
      setRadius(radius)
    }
  }

  const handleSave = () => {
    updateTheme.trigger({ theme: { color, radius } }).then(() => {
      editorEvents.refresh()
    })
    setOpen(false)
  }

  const handleOpenChange = (open: boolean) => {
    setOpen(open)
  }

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === "child-app-click") {
        setOpen(false)
      }
    }

    window.addEventListener("message", handleMessage)

    return () => {
      window.removeEventListener("message", handleMessage)
    }
  }, [])

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button className="mr-1 h-6 cursor-pointer rounded px-1 py-1 transition-colors hover:bg-slate-400">
          <Palette className="h-full" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" collisionPadding={4}>
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">Customize</h4>
            <p className="text-muted-foreground text-sm">
              Customize the look and feel of your app.
            </p>
          </div>
          {isLoading && <div className="grid grid-cols-3 items-center gap-4">Loading...</div>}
          {!isLoading && (
            <>
              <div className="grid gap-2">
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="theme">Color</Label>
                  <Select onValueChange={handleColorChanged} defaultValue={theme?.color || "zinc"}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Select a fruit" id="theme" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="zinc">
                          <div className="flex w-20 items-center justify-between gap-2">
                            Zinc
                            <div
                              style={{
                                backgroundColor: "hsl(240 5.9% 10%)",
                              }}
                              className="h-4 w-4 rounded"
                            ></div>
                          </div>
                        </SelectItem>
                        <SelectItem value="blue">
                          <div className="flex w-20 items-center justify-between gap-2">
                            Blue
                            <div
                              style={{
                                backgroundColor: "hsl(221.2 83.2% 53.3%)",
                              }}
                              className="h-4 w-4 rounded"
                            ></div>
                          </div>
                        </SelectItem>
                        <SelectItem value="green">
                          <div className="flex w-20 items-center justify-between gap-2">
                            Green
                            <div
                              style={{
                                backgroundColor: "hsl(142.1 76.2% 36.3%)",
                              }}
                              className="h-4 w-4 rounded"
                            ></div>
                          </div>
                        </SelectItem>
                        <SelectItem value="orange">
                          <div className="flex w-20 items-center justify-between gap-2">
                            Orange
                            <div
                              style={{
                                backgroundColor: "hsl(20.5 90.2% 48.2%)",
                              }}
                              className="h-4 w-4 rounded"
                            ></div>
                          </div>
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-4">
                  <Label htmlFor="theme">Radius</Label>
                  <ToggleGroup.Root
                    className="inline-flex gap-2"
                    type="single"
                    defaultValue={theme?.radius || "0.75rem"}
                    aria-label="Text alignment"
                    onValueChange={handleRadiusChanged}
                  >
                    <ToggleGroup.Item
                      value="0rem"
                      aria-label="rounded none"
                      style={{ borderRadius: 0 }}
                      className="data-[state=on]:border-primary flex h-8 w-11 items-center justify-center border border-slate-300 shadow"
                    >
                      0
                    </ToggleGroup.Item>
                    <ToggleGroup.Item
                      value="0.25rem"
                      aria-label="rounded 0.25rem"
                      style={{ borderRadius: "0.25rem" }}
                      className="data-[state=on]:border-primary flex h-8 w-11 items-center justify-center border border-slate-300 shadow"
                    >
                      0.25
                    </ToggleGroup.Item>
                    <ToggleGroup.Item
                      value="0.5rem"
                      aria-label="rounded large 0.5rem"
                      style={{ borderRadius: "0.5rem" }}
                      className="data-[state=on]:border-primary flex h-8 w-11 items-center justify-center border border-slate-300 shadow"
                    >
                      0.5
                    </ToggleGroup.Item>
                    <ToggleGroup.Item
                      value="0.75rem"
                      aria-label="extra rounded 0.75rem"
                      style={{ borderRadius: "0.75rem" }}
                      className="data-[state=on]:border-primary flex h-8 w-11 items-center justify-center border border-slate-300 shadow"
                    >
                      0.75
                    </ToggleGroup.Item>
                    <ToggleGroup.Item
                      value="1rem"
                      aria-label="2x rounded 1rem"
                      style={{ borderRadius: "1rem" }}
                      className="data-[state=on]:border-primary flex h-8 w-11 items-center justify-center border border-slate-300 shadow"
                    >
                      1
                    </ToggleGroup.Item>
                  </ToggleGroup.Root>
                </div>
              </div>
              <Button onClick={handleSave}>Save</Button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
