import React from "react"

import {
  AssignmentStatement,
  ComponentCallNode,
  ComponentNode,
  ExpressionNode,
  FunctionNode,
  IfStatementNode,
  NAryExpression,
  NAryOperator,
  ObjectNode,
  PathAccessNode,
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
  isDevSite: boolean = false

  constructor(isDevSite?: boolean) {
    this.isDevSite = isDevSite ?? false
  }

  reactMode: "client" | "server" = "client"

  setReactMode(mode: "client" | "server") {
    this.reactMode = mode
  }

  private stateSymbol = Symbol("state")

  private globalScope: Scope = {
    values: new Map(),
  }

  private currentScope: Scope = this.globalScope

  private tailwindClassesSet = new Set<string>()

  getTailwindClasses() {
    return Array.from(this.tailwindClassesSet)
  }

  private newTailwindClass(className: string) {
    this.tailwindClassesSet.add(className)
  }

  interpret(node: ProgramNode) {
    this.currentScope = this.globalScope

    for (const statement of node.body) {
      this.interpretStatement(statement)
    }
  }

  interpretComponentCall(node: ComponentCallNode) {
    const component = this.resolveValueById(node.comp.refId) as React.FC

    const props: Record<string, any> = {}

    if (node.props) {
      for (const prop of node.props) {
        props[prop.name] = this.interpretExpression(prop.value)
      }
    }

    if (node.children && node.children.length > 0) {
      const children = node.children.map((child) => {
        return this.interpretUINode(child)
      })

      return React.createElement(component, props, children)
    }

    return React.createElement(component, props)
  }

  private newScope() {
    const parent = this.currentScope

    this.currentScope = {
      values: new Map(),
      parent: parent,
    }

    return this.currentScope
  }

  private getScopeValues(): Map<string, any> {
    return this.currentScope.values
  }

  private interpretComponent(node: ComponentNode): React.FC {
    this.currentScope = this.globalScope

    const scope = this.getScopeValues()
    const component = (props: any) => {
      this.newScope()
      if (node.props) {
        for (let i = 0; i < node.props.length; i++) {
          const prop = node.props[i]!
          this.getScopeValues().set(prop.id, props[prop.name])
        }
      }

      return this.interpretStatementList(node.body)
    }
    if (node.name) {
      component.displayName = node.name
    }

    scope.set(node.id, component)
    return component
  }

  private interpretStatementList(statements: StatementNode[]) {
    const prevScope = this.newScope()

    try {
      for (const statement of statements) {
        this.interpretStatement(statement)
      }
    } catch (error) {
      if (error instanceof ReturnValue) {
        return error.value
      } else {
        throw error
      }
    } finally {
      this.currentScope = prevScope
    }
  }

  interpretStatement(node: StatementNode): any {
    if (node.type === "component") {
      this.interpretComponent(node)
    } else if (node.type === "var") {
      this.interpretVariableDeclaration(node)
    } else if (node.type === "state") {
      this.interpretStateDeclaration(node)
    } else if (node.type === "if") {
      this.interpretIfStatement(node)
    } else if (node.type === "state change") {
      this.interpretStateChange(node)
    } else if (node.type === "return") {
      throw new ReturnValue(this.interpretExpression(node.arg))
    } else if (node.type === "assignment") {
      this.interpretAssignment(node)
    } else if (node.type === "print") {
      console.log(this.interpretExpression(node.arg))
    } else if (node.type === "empty") {
    } else {
      throw new Error(`Statement type ${node.type} is not implemented`)
    }
  }

  private interpretVariableDeclaration(node: VarStatement) {
    const scope = this.getScopeValues()
    scope.set(node.id, this.interpretExpression(node.value))
  }

  private interpretStateDeclaration(node: StateStatement) {
    if (this.reactMode === "server") {
      return
    }

    const scope = this.getScopeValues()
    const stateArray = React.useState(this.interpretExpression(node.value))
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

    const result = this.interpretStatementList(node.body)
    stateWrapper.stateArray[1](result)
  }

  private interpretAssignment(node: AssignmentStatement) {
    const scope = this.getScopeValues()
    const value = this.interpretExpression(node.right)

    if (node.left.type === "ref") {
      scope.set(node.left.refId, value)
    } else if (node.left.type === "path access") {
      const obj = this.interpretPathAccess(node.left, true)
      const prop = this.interpretExpression(node.left.path[node.left.path.length - 1]!)

      obj[prop] = value
    }
  }

  interpretUINode(node: UINode): React.ReactNode {
    let children: React.ReactNode[]

    if (node.type === "empty") {
      return null
    }

    if (node.type === "ui text") {
      return node.text
    }

    if (node.type === "ui expression") {
      return this.interpretExpression(node.expression)
    }

    if (!node.children || node.children.length === 0) {
      children = []
    } else {
      children = node.children
        .map((child) => {
          return this.interpretUINode(child)
        })
        .filter((child) => child !== null)
    }

    if (node.type === "ui element") {
      const TagName = node.name

      const props: Record<string, any> = {
        key: node.id,
        className: "",
      }

      if (this.isDevSite) {
        props["data-codeportal-node-id"] = node.id
      }

      if (node.props) {
        for (const prop of node.props) {
          if (prop.type === "ui prop") {
            if (prop.name === "className") {
              props.className =
                (props.className === "" ? "" : " ") + this.interpretExpression(prop.value)
            } else {
              props[prop.name] = this.interpretExpression(prop.value)
            }
          } else if (prop.type === "ui spread prop") {
            const spreadObj = this.interpretExpression(prop.arg)
            if (spreadObj && typeof spreadObj === "object") {
              Object.assign(props, spreadObj)
            }
          }
        }
      }

      if (node.style) {
        let tailwindClasses = ""

        for (const style of node.style) {
          if (tailwindClasses !== "") {
            tailwindClasses += " "
          }

          const tailwindClass = style.args
            ? `${style.tag}-${style.args
                .map((arg) => (typeof arg === "string" ? arg : arg.name))
                .join("-")}`
            : style.tag!

          tailwindClasses += tailwindClass

          this.newTailwindClass(tailwindClass)
        }

        props.className = (props.className === "" ? "" : " ") + tailwindClasses
      }

      if (props.className === "") {
        delete props.className
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
    } else if (node.type === "empty") {
      return null
    } else if (node.type === "object") {
      return this.interpretObjectNode(node)
    } else if (node.type === "function") {
      return this.interpretFunction(node)
    } else if (node.type === "path access") {
      this.interpretPathAccess(node)
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
    let scope = this.currentScope

    while (!scope.values.has(nodeId) && scope.parent) {
      scope = scope.parent
    }

    if (!scope.values.has(nodeId)) {
      throw new Error(`Unable to resolve ${nodeId}`)
    }

    value = scope.values.get(nodeId)

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
    const scope = this.getScopeValues()
    const func = (...args: any[]) => {
      this.newScope()
      if (node.params) {
        for (let i = 0; i < node.params.length; i++) {
          const param = node.params[i]!
          this.getScopeValues().set(param.id, args[i])
        }
      }

      return this.interpretStatementList(node.body)
    }
    if (node.name) {
      Object.defineProperty(func, "name", { value: node.name })
    }

    scope.set(node.id, func)
    return func
  }

  private interpretNaryExpression(node: NAryExpression) {
    let result: any

    let first = true

    let i = 0
    for (let arg of node.args) {
      if (first) {
        result = this.interpretExpression(arg)
        first = false
        continue
      }

      arg = this.interpretExpression(arg)

      result = this.interpretNAryOperator(node.operators[i]!, result, arg)
      i++
    }

    return result
  }

  private interpretNAryOperator(operator: NAryOperator, left: any, right: any): any {
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

  private interpretIfStatement(node: IfStatementNode) {
    let condition = this.interpretExpression(node.test)

    if (condition) {
      this.interpretStatementList(node.then)
    }

    // TODO: missing else-if chain
  }

  private interpretPathAccess(node: PathAccessNode, skipLast = false) {
    const obj = this.interpretExpression(node.path[0]!)

    let currentObj = obj

    const offset = skipLast ? 1 : 0

    for (let i = 0; i < node.path.length - 1 - offset; i++) {
      const prop = this.interpretExpression(node.path[i]!)!

      currentObj = currentObj[prop]
    }

    return currentObj
  }
}

export class ReturnValue extends Error {
  constructor(public value: any) {
    super()
  }
}

export type Scope = {
  values: Map<string, any>
  parent?: Scope
}
