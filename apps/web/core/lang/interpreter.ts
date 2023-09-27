import React from "react"

import {
  ComponentNode,
  ExpressionNode,
  FunctionNode,
  NAryExpression,
  ObjectNode,
  ProgramNode,
  ReferenceNode,
  StateChangeNode,
  StateStatement,
  StatementNode,
  UINode,
  VarStatement,
} from "./codeTree"

type StateWrapper = {
  stateArray: [any, React.Dispatch<any>]
  type: Symbol
}

export class Interpreter {
  isDev: boolean = false

  constructor(isDev?: boolean) {
    this.isDev = isDev ?? false
  }

  reactMode: "client" | "server" = "client"

  setReactMode(mode: "client" | "server") {
    this.reactMode = mode
  }

  private stateSymbol = Symbol("state")

  private scopeStack: Map<string, any>[] = []

  interpretComponent(node: ComponentNode): React.ReactNode {
    this.pushScope()
    for (const statement of node.body) {
      const res = this.interpretStatement(statement)

      if (res) {
        return res
      }
    }
    this.popScope()
  }

  interpret(node: ProgramNode) {
    this.interpretStatementList(node.body)
  }

  private pushScope() {
    this.scopeStack.push(new Map())
  }

  private popScope() {
    this.scopeStack.pop()
  }

  private getScope() {
    const currentScope = this.scopeStack[this.scopeStack.length - 1]

    if (!currentScope) {
      throw new Error("No scope found")
    }

    return currentScope
  }

  private interpretStatementList(code: StatementNode[]) {
    this.pushScope()
    for (const statement of code) {
      this.interpretStatement(statement)
    }
    this.popScope()
  }

  interpretStatement(node: StatementNode): any {
    if (node.type === "component") {
      // TODO: Revisit this
      return this.interpretComponent(node)
    } else if (node.type === "var") {
      this.interpretVariableDeclaration(node)
    } else if (node.type === "state") {
      this.interpretStateDeclaration(node)
    } else if (node.type === "state change") {
      this.interpretStateChange(node)
    } else if (node.type === "return") {
      return this.interpretExpression(node.arg)
    } else if (node.type === "print") {
      console.log(this.interpretExpression(node.arg))
    } else {
      throw new Error(`Statement type ${node.type} is not implemented`)
    }
  }

  private interpretVariableDeclaration(node: VarStatement) {
    const scope = this.getScope()
    scope.set(node.id, this.interpretExpression(node.value))
  }

  private interpretStateDeclaration(node: StateStatement) {
    if (this.reactMode === "server") {
      return
    }

    const scope = this.getScope()
    const stateArray = React.useState(this.interpretExpression(node.value))
    console.log("---- SET stateArray", stateArray, this.scopeStack)
    scope.set(node.id, {
      stateArray,
      type: this.stateSymbol,
    } satisfies StateWrapper)
  }

  private interpretStateChange(node: StateChangeNode) {
    if (this.reactMode === "server") {
      return
    }

    const stateWrapper = this.resolveValueById(node.state.refId) as StateWrapper
    if (Array.isArray(node.body)) {
      stateWrapper.stateArray[1](this.interpretStatementList(node.body)) // TODO: review return values
    } else {
      console.log(
        "---- interpretStateChange",
        stateWrapper.stateArray[0],
        JSON.stringify(node.body),
      )
      stateWrapper.stateArray[1](this.interpretExpression(node.body))
    }
  }

  interpretUINode(node: UINode): React.ReactNode {
    let children: React.ReactNode[]

    if (node.type === "ui text") {
      return node.text
    }

    if (node.type === "ui expression") {
      return this.interpretExpression(node.expression)
    }

    if (!node.children || node.children.length === 0) {
      children = []
    } else {
      children = node.children.map((child) => {
        return this.interpretUINode(child)
      })
    }

    if (node.type === "ui element") {
      const TagName = node.name

      const props: Record<string, any> = { key: node.id, style: node.style }

      if (node.props) {
        for (const prop of node.props) {
          if (prop.type === "ui prop") {
            props[prop.name] = this.interpretExpression(prop.value)
          } else if (prop.type === "ui spread prop") {
            const spreadObj = this.interpretExpression(prop.arg)
            if (spreadObj && typeof spreadObj === "object") {
              Object.assign(props, spreadObj)
            }
          }
        }
      }

      if (!node.children || node.children.length === 0) {
        return React.createElement(TagName, props)
      }

      return React.createElement(TagName, props, children)
    } else if (node.type === "ui fragment") {
      return React.createElement(React.Fragment, { key: node.id }, children)
    } else {
      throw new Error(`UI node type ${(node as any).type} is not implemented`)
    }
  }

  interpretExpression(node: ExpressionNode): any {
    if (node.type === "string") {
      return node.value
    } else if (node.type === "number") {
      return node.value
    } else if (node.type === "boolean") {
      return node.value
    } else if (node.type === "ref") {
      return this.interpretRef(node)
    } else if (node.type === "nary") {
      return this.interpretNaryExpression(node)
    } else if (node.type === "object") {
      return this.interpretObjectNode(node)
    } else if (node.type === "function") {
      return this.interpretFunction(node)
    } else if (
      node.type === "ui element" ||
      node.type === "ui fragment" ||
      node.type === "ui text"
    ) {
      return this.interpretUINode(node)
    } else {
      throw new Error(`Expression type ${node.type} is not implemented`)
    }
  }

  private resolveValueById(nodeId: string) {
    let value
    let scope = this.getScope()
    let scopeIndex = this.scopeStack.length - 1
    while (!scope.has(nodeId) && scopeIndex > 0) {
      scopeIndex--
      scope = this.scopeStack[scopeIndex] as any
    }

    if (!scope.has(nodeId)) {
      throw new Error(`Unable to resolve ${nodeId}`)
    }

    value = scope.get(nodeId)

    return value
  }

  private interpretRef(node: ReferenceNode) {
    const value = this.resolveValueById(node.refId)

    if (typeof value === "function") {
      return value()
    }

    if (value && value.type === this.stateSymbol) {
      return value.stateArray[0]
    }

    return value
  }

  private interpretFunction(node: FunctionNode): any {
    const scope = this.getScope()
    const func = (...args: any[]) => {
      console.log("calling function", node.id)
      this.pushScope()
      if (node.params) {
        for (let i = 0; i < node.params.length; i++) {
          const param = node.params[i]!
          this.getScope().set(param.id, args[i])
        }
      }
      this.interpretStatementList(node.body)
      this.popScope()
    }
    scope.set(node.id, func)
    return func
  }

  private interpretNaryExpression(node: NAryExpression) {
    let result: any

    let first = true

    for (let arg of node.args) {
      if (first) {
        result = this.interpretExpression(arg)
        first = false
        continue
      }

      arg = this.interpretExpression(arg)
      result = this.interpretNAryOperator(node.operator, result, arg)
    }

    return result
  }

  private interpretNAryOperator(operator: NAryExpression["operator"], left: any, right: any): any {
    if (operator === "+") {
      return left + right
    } else if (operator === "-") {
      return left - right
    } else if (operator === "*") {
      return left * right
    } else if (operator === "/") {
      return left / right
    } else if (operator === "%") {
      return left % right
    } else if (operator === "==") {
      return left === right
    } else if (operator === "!=") {
      return left !== right
    } else if (operator === ">") {
      return left > right
    } else if (operator === "<") {
      return left < right
    } else if (operator === ">=") {
      return left >= right
    } else if (operator === "<=") {
      return left <= right
    } else if (operator === "&&") {
      return left && right
    } else if (operator === "||") {
      return left || right
    } else {
      throw new Error(`Operator ${operator} is not implemented`)
    }
  }

  private interpretObjectNode(node: ObjectNode) {
    const obj: Record<string, any> = {}

    for (const prop of node.props) {
      const name = this.interpretExpression(prop.name)

      obj[name] = this.interpretExpression(prop.value)
    }

    return obj
  }
}
