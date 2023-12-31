import React from "react"

import { CodeDB } from "./codeDB"
import { CodeNode } from "./codeTree"

const CodeDBContext = React.createContext<CodeDB | null>(null)

export function CodeDBProvider({
  children,
  codeDB,
}: {
  children: React.ReactNode
  codeDB?: CodeDB
}) {
  const [_codeDB] = React.useState(() => codeDB || new CodeDB())

  return <CodeDBContext.Provider value={_codeDB}>{children}</CodeDBContext.Provider>
}

export function useCodeDB() {
  const context = React.useContext(CodeDBContext)
  if (context === undefined) {
    throw new Error("useCodeDB must be used within a CodeDBProvider")
  }

  return context
}

export function useNode<NodeType extends CodeNode>(id: string) {
  const codeDB = useCodeDB()
  const [node, setNode] = React.useState(() => codeDB?.getNodeByID(id))
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0)

  React.useEffect(() => {
    setNode(codeDB?.getNodeByID(id))

    return codeDB?.onNodeChange(({ nodeId }) => {
      if (nodeId === id) {
        setNode(codeDB?.getNodeByID(id))
        forceUpdate()
      }
    })
  }, [codeDB, id])

  return node as NodeType
}
