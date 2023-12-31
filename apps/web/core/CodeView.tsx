"use client"

import React from "react"

import { CodeTreeView } from "./CodeTreeView"
import { editorEvents } from "./editorEvents"
import { ASTtoCTTransformer } from "./lang/astTransformer"
import { useCodeDB } from "./lang/codeDBContext"
import { CodeProcessor } from "./lang/codeProcessor"
import { ProgramNode } from "./lang/codeTree"

const astTransformer = new ASTtoCTTransformer()
const codeProcessor = new CodeProcessor({ appId: "test" })

const testCode = `
function App() {
  const [count, setCount] = React.useState(0)

  let x = "hey there"

  return (
    <div>
      <h1>Counter</h1>
      <button onClick={() => {setCount(c => {return c + 1})}}>+</button>
      <button onClick={() => {setCount(count - 1)}}>-</button>
      <div>Count: {count}</div>
    </div>
  )
}
`

codeProcessor.extend((ast) => astTransformer.transform(ast))
const testCodeTree = codeProcessor.process(testCode)

export const CodeView = React.forwardRef<
  HTMLDivElement,
  {
    appId: string
    code: string
    isFinished: boolean
    codeTree: ProgramNode | null
    isLoading: boolean
  }
>(({ appId, code, isFinished, codeTree, isLoading }, ref) => {
  return (
    <div className="h-full">
      <CodeContainer
        ref={ref}
        code={code}
        isFinished={isFinished}
        codeTree={codeTree}
        isLoading={isLoading}
      />
    </div>
  )
})

const CodeContainer = React.forwardRef<
  HTMLDivElement,
  { code: string; isFinished: boolean; codeTree: ProgramNode | null; isLoading: boolean }
>(({ code, isFinished, codeTree, isLoading }, ref) => {
  const codeDB = useCodeDB()

  // React.useEffect(() => {
  //   if (isFinished) {
  //     broadcast({ type: "refresh" })
  //   }
  // }, [code, isFinished])

  // React.useEffect(() => {
  //   if (!codeTree) {
  //     return
  //   }

  //   if (isLoading) {
  //     codeDB?.reset()
  //     codeDB?.partialLoad(codeTree)
  //   } else {
  //     console.log("-----  load")
  //     codeDB?.reset()
  //     codeDB?.load(codeTree)
  //     console.log("-----  loaded")
  //   }
  // }, [codeTree, isLoading])

  React.useEffect(() => {
    codeDB?.reset()
    codeDB?.load(testCodeTree)

    console.log("testCodeTree", testCodeTree)

    codeDB?.onNodeChange(({ nodeId }) => {
      const node = codeDB.getNodeByID(nodeId)

      editorEvents.notifyCodeChange(nodeId, node ?? null)
    })
  }, [])

  if (testCodeTree) {
    return <CodeTreeView codeTree={testCodeTree} />
  }

  // at this point this is just for debugging purposes
  return (
    <div
      ref={ref}
      className="h-full w-full overflow-auto whitespace-pre-wrap rounded-xl border px-4 py-2"
    >
      {code}
    </div>
  )
})
