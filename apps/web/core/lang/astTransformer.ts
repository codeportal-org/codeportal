import {
  ArrowFunctionExpression,
  AssignmentExpression,
  BinaryExpression,
  Expression,
  ExpressionStatement,
  FunctionDeclaration,
  Identifier,
  IfStatement,
  JSXElement,
  JSXExpressionContainer,
  JSXFragment,
  JSXIdentifier,
  JSXText,
  Literal,
  MemberExpression,
  Program,
  SimpleCallExpression,
  Statement,
  TryStatement,
} from "estree-jsx"

import {
  AssignmentStatement,
  ComponentNode,
  ExpressionNode,
  FunctionCallNode,
  FunctionNode,
  IfStatementNode,
  LiteralNode,
  NAryExpression,
  NAryOperatorSymbols,
  ObjectNode,
  ParamDeclaration,
  PathAccessNode,
  ProgramNode,
  ReferenceNode,
  StateStatement,
  StatementNode,
  StringLiteral,
  TryStatementNode,
  UIElementNode,
  UIExpressionNode,
  UIFragmentNode,
  UINode,
  UIPropNode,
  UISpreadPropNode,
  UITextNode,
  VarStatement,
} from "./interpreter"

/**
 * Transforms the JS generated by GPT, that is transformed to AST (ESTree) format, into into Portal Code Tree format.
 * Portal Code Tree format is simpler and specific to PortalLang.
 */
export class ASTtoCTTransformer {
  componentMode = false

  /**
   * If true it make the top function a component.
   * This is to account for incomplete components during AI generation.
   * Very Editor specific use case.
   * */
  topLevelComponent = false

  /** Next id to be used by a node */
  idCounter = 0

  private getNewId() {
    const id = this.idCounter.toString()
    this.idCounter++
    return id
  }

  /**
   * Stack of scopes. Each scope maps names to ids.
   */
  scopeStack: Map<string, string>[] = []

  globalScope: Map<string, string> = new Map()

  addGlobal(name: string, id: string) {
    this.globalScope.set(name, id)
  }

  private addToScope(name: string, id: string) {
    if (this.scopeStack.length === 0) {
      throw new Error("No scope to add to")
    }

    this.scopeStack[this.scopeStack.length - 1]!.set(name, id)
  }

  private pushScope() {
    this.scopeStack.push(new Map())
  }

  private popScope() {
    this.scopeStack.pop()
  }

  private resolveIdentifier(name: string): string {
    if (this.scopeStack.length === 0) {
      throw new Error("No scope to resolve identifier")
    }

    for (let i = this.scopeStack.length - 1; i >= 0; i--) {
      const id = this.scopeStack[i]!.get(name)

      if (id) {
        return id
      }
    }

    const id = this.globalScope.get(name)

    if (id) {
      return id
    }

    throw new Error(`Identifier ${name} not found`)
  }

  constructor({ topLevelComponent = false }: { topLevelComponent?: boolean } = {}) {
    this.topLevelComponent = topLevelComponent
  }

  reset() {
    this.idCounter = 0
    this.scopeStack = []
    this.globalScope = new Map()
    this.componentMode = false
  }

  transform(node: Program) {
    if (node.type === "Program") {
      return this.transformProgram(node)
    }
  }

  transformProgram(node: Program): ProgramNode {
    const programNode: ProgramNode = {
      type: "program",
      id: this.getNewId(),
      body: [],
      idCounter: this.idCounter,
    }

    this.pushScope()

    for (const statement of node.body) {
      if (statement.type === "FunctionDeclaration") {
        // see if it is a React component
        const statements = statement.body.body
        let lastStatement: any = statements[statements.length - 1]

        if (
          this.topLevelComponent ||
          (lastStatement &&
            lastStatement.type === "ReturnStatement" &&
            lastStatement.argument?.type === "JSXElement")
        ) {
          programNode.body.push(this.transformComponent(statement))
        } else {
          programNode.body.push(this.transformFunctionDeclaration(statement))
        }
      } else if (
        statement.type === "VariableDeclaration" ||
        statement.type === "ExpressionStatement" ||
        statement.type === "ReturnStatement" ||
        statement.type === "TryStatement"
      ) {
        programNode.body.push(this.transformStatement(statement))
      } else {
        throw new Error(`Unknown program statement type: ${statement.type}`)
      }
    }

    programNode.idCounter = this.idCounter

    this.popScope()

    return programNode
  }

  transformComponent(node: FunctionDeclaration): ComponentNode {
    if (node.id === null) {
      throw new Error("Function declaration must have a name (component declaration)")
    }

    this.componentMode = true

    let componentNode: ComponentNode = {
      type: "component",
      id: this.getNewId(),
      name: node.id.name,
      body: [],
    }

    this.addToScope(componentNode.name, componentNode.id)

    this.pushScope()

    for (const statement of node.body.body) {
      componentNode.body.push(this.transformStatement(statement))
    }

    this.popScope()

    return componentNode
  }

  transformFunctionDeclaration(node: FunctionDeclaration): FunctionNode {
    if (node.id === null) {
      throw new Error("Function declaration must have a name")
    }

    const functionNode: FunctionNode = {
      type: "function",
      id: this.getNewId(),
      name: node.id.name,
      params: [],
      body: [],
    }

    this.addToScope(functionNode.name!, functionNode.id)

    this.pushScope()

    functionNode.params?.push(
      ...(node.params?.map(
        (param: any) =>
          ({
            type: "param",
            id: this.getNewId(),
            name: param.name,
          } satisfies ParamDeclaration),
      ) || []),
    )

    for (const statement of node.body.body) {
      functionNode.body.push(this.transformStatement(statement))
    }

    this.popScope()

    return functionNode
  }

  transformStatement(node: Statement): StatementNode | any {
    if (node.type === "VariableDeclaration") {
      return this.transformVariableDeclaration(node)
    } else if (node.type === "ReturnStatement") {
      return this.transformReturnStatement(node)
    } else if (node.type === "ExpressionStatement") {
      return this.transformExpressionStatement(node)
    } else if (node.type === "TryStatement") {
      return this.transformTryStatement(node)
    } else if (node.type === "IfStatement") {
      return this.transformIfStatement(node)
    } else if (node.type === "FunctionDeclaration") {
      return this.transformFunctionDeclaration(node)
    } else {
      throw new Error(`Unknown statement type: ${node.type}`)
    }
  }

  transformVariableDeclaration(node: any): any {
    if (node.declarations.length > 1) {
      throw new Error("Multiple variable declarators in a declaration is not supported")
    }

    // pattern matching React state, it detects `React.useState`
    if (this.componentMode) {
      if (
        node.declarations[0].init.type === "CallExpression" &&
        node.declarations[0].init.callee.object?.name === "React" &&
        node.declarations[0].init.callee.property?.name === "useState"
      ) {
        const stateNode: StateStatement = {
          type: "state",
          id: this.getNewId(),
          name: node.declarations[0].id.elements[0].name,
          value: this.transformExpression(node.declarations[0].init.arguments[0]),
        }

        this.addToScope(stateNode.name, stateNode.id)

        return stateNode
      }
    }

    // transform arrow functions into regular functions
    if (node.declarations[0].init.type === "ArrowFunctionExpression") {
      const functionNode: FunctionNode = {
        type: "function",
        id: this.getNewId(),
        name: node.declarations[0].id.name,
        params: node.declarations[0].init.params.map(
          (param: any) =>
            ({
              type: "param",
              id: this.getNewId(),
              name: param.name,
            } satisfies ParamDeclaration),
        ),
        body: [],
      }

      this.addToScope(functionNode.name!, functionNode.id)

      if (node.declarations[0].init.expression) {
        functionNode.body.push({
          type: "return",
          id: this.getNewId(),
          arg: this.transformExpression(node.declarations[0].init.body),
        })
      } else {
        for (const statement of node.declarations[0].init.body.body) {
          functionNode.body.push(this.transformStatement(statement))
        }
      }

      return functionNode
    }

    // Regular variable declaration

    const varStatement: VarStatement = {
      type: "var",
      id: this.getNewId(),
      name: node.declarations[0].id.name,
      value: this.transformExpression(node.declarations[0].init),
    }

    this.addToScope(varStatement.name, varStatement.id)

    return varStatement
  }

  transformReturnStatement(node: any): any {
    return {
      type: "return",
      id: this.getNewId(),
      arg: this.transformExpression(node.argument),
    }
  }

  transformExpression(node: Expression): ExpressionNode {
    if (node.type === "Identifier") {
      return this.transformIdentifier(node)
    } else if (node.type === "BinaryExpression") {
      return this.transformBinaryExpression(node)
    } else if (node.type === "Literal") {
      return this.transformLiteral(node)
    } else if (node.type === "JSXElement") {
      return this.transformJSXElement(node)
    } else if (node.type === "CallExpression") {
      return this.transformCallExpression(node)
    } else if (node.type === "MemberExpression") {
      return this.transformMemberExpression(node)
    } else if (node.type === "ObjectExpression") {
      return this.transformObjectExpression(node)
    } else if (node.type === "ArrowFunctionExpression") {
      return this.transformArrowFunctionExpression(node)
    }

    throw new Error(`Unknown expression type: ${node.type}`)
  }

  transformIdentifier(node: any): ReferenceNode {
    const resolvedId = this.resolveIdentifier(node.name)

    return {
      type: "ref",
      id: this.getNewId(),
      refId: resolvedId,
    }
  }

  transformLiteral(node: Literal): LiteralNode {
    const valueType = typeof node.value

    if (valueType === "string") {
      return {
        type: "string",
        id: this.getNewId(),
        value: node.value as string,
      } satisfies StringLiteral
    } else if (valueType === "number") {
      return {
        type: "number",
        id: this.getNewId(),
        value: node.value as number,
      }
    } else if (valueType === "boolean") {
      return {
        type: "boolean",
        id: this.getNewId(),
        value: node.value as boolean,
      }
    }

    throw new Error(`Unknown literal type: ${typeof node.value}`)
  }

  transformBinaryExpression(node: BinaryExpression): NAryExpression {
    const nAryId = this.getNewId()
    const args: ExpressionNode[] = []

    let operator = node.operator

    if (operator === "===") {
      operator = "=="
    }

    if (NAryOperatorSymbols.indexOf(operator as any) === -1) {
      throw new Error(`Unknown binary operator: ${node.operator}`)
    }

    let current: any = node
    while (current.type === "BinaryExpression" && node.operator === current.operator) {
      args.push(this.transformExpression(current.right))
      current = current.left
    }

    args.push(this.transformExpression(current))

    return {
      type: "nary",
      id: nAryId,
      operator: operator as any,
      args: args.reverse(),
    }
  }

  transformJSXElement(node: JSXElement): UIElementNode {
    return {
      type: "ui element",
      id: this.getNewId(),
      name: (node.openingElement.name as JSXIdentifier).name,
      props: node.openingElement.attributes.map((attribute) => {
        return attribute.type === "JSXAttribute"
          ? ({
              type: "ui prop",
              id: this.getNewId(),
              name: attribute.name.name as string,
              value: this.transformExpression(attribute.value as Expression),
            } satisfies UIPropNode)
          : ({
              type: "ui spread prop",
              id: this.getNewId(),
              arg: this.transformExpression(attribute.argument),
            } satisfies UISpreadPropNode)
      }),
      children: node.children
        .map((child) => {
          if (child.type === "JSXElement") {
            return this.transformJSXElement(child)
          } else if (child.type === "JSXText") {
            return this.transformJSXText(child)
          } else if (child.type === "JSXExpressionContainer") {
            return this.transformUIExpression(child)
          } else if (child.type === "JSXFragment") {
            return this.transformJSXFragment(child)
          } else {
            throw new Error(`Unknown JSX child type: ${child.type}`)
          }
        })
        .filter((child: any) => child !== null) as UINode[],
    }
  }

  transformJSXText(node: JSXText): UITextNode | null {
    // ignore whitespace like JSX with value "\n   " that is just indentation
    if (node.value.trim() === "") {
      return null
    }

    return {
      type: "ui text",
      id: this.getNewId(),
      text: collapseWhitespace(node.value),
    } satisfies UITextNode
  }

  transformJSXFragment(node: JSXFragment): UIFragmentNode {
    return {
      type: "ui fragment",
      id: this.getNewId(),
      children: node.children
        .map((child: any) => {
          if (child.type === "JSXElement") {
            return this.transformJSXElement(child)
          } else if (child.type === "JSXText") {
            return this.transformJSXText(child)
          } else if (child.type === "JSXExpressionContainer") {
            return this.transformUIExpression(child.expression)
          } else if (child.type === "JSXFragment") {
            return this.transformJSXFragment(child)
          } else {
            throw new Error(`Unknown JSX child type: ${child.type}`)
          }
        })
        .filter((child) => child !== null) as UINode[],
    }
  }

  transformUIExpression(node: JSXExpressionContainer): UIExpressionNode {
    return {
      type: "ui expression",
      id: this.getNewId(),
      expression: this.transformExpression(node.expression as Expression),
    }
  }

  transformCallExpression(node: SimpleCallExpression): FunctionCallNode {
    const functionCallId = this.getNewId()

    let callee: ReferenceNode | PathAccessNode

    if (node.callee.type === "MemberExpression") {
      callee = this.transformMemberExpression(node.callee)
    } else if (node.callee.type === "Identifier") {
      callee = this.transformIdentifier(node.callee)
    } else {
      throw new Error(`Unknown call expression callee type: ${node.callee.type}`)
    }

    return {
      type: "function call",
      id: functionCallId,
      callee,
      args: node.arguments.map((argument: any) => this.transformExpression(argument)),
    }
  }

  transformExpressionStatement(node: ExpressionStatement): any {
    if (node.expression.type === "AssignmentExpression") {
      return this.transformAssignmentExpression(node.expression)
    } else if (node.expression.type === "CallExpression") {
      return this.transformCallExpression(node.expression)
    }

    throw new Error(`Unknown expression statement type: ${node.expression.type}`)
  }

  transformAssignmentExpression(node: AssignmentExpression): any {
    const assignmentNodeId = this.getNewId()

    const left = node.left

    let leftNode: ReferenceNode | PathAccessNode
    if (left.type === "MemberExpression") {
      leftNode = this.transformMemberExpression(left)
    } else if (left.type === "Identifier") {
      leftNode = this.transformIdentifier(left)
    } else {
      throw new Error(`Unknown assignment left type: ${left.type}`)
    }

    return {
      type: "assignment",
      id: assignmentNodeId,
      operator: node.operator,
      left: leftNode,
      right: this.transformExpression(node.right),
    } satisfies AssignmentStatement
  }

  transformMemberExpression(node: MemberExpression): PathAccessNode {
    const pathAccessId = this.getNewId()
    let path: any[] = []

    let current = node
    while (current.type === "MemberExpression") {
      if (current.computed) {
        path.push(this.transformExpression(current.property as Expression))
      } else {
        path.push({
          type: "string",
          id: this.getNewId(),
          value: (current.property as Identifier).name,
        } satisfies StringLiteral)
      }
      current = current.object as MemberExpression
    }

    path.push(this.transformExpression(current))

    return {
      type: "path access",
      id: pathAccessId,
      path: path.reverse(),
    }
  }

  transformObjectExpression(node: any): ObjectNode {
    const object: ObjectNode = {
      type: "object",
      id: this.getNewId(),
      properties: [],
    }

    for (const property of node.properties) {
      object.properties.push({
        type: "property",
        id: this.getNewId(),
        name: this.transformExpression(property.key),
        value: this.transformExpression(property.value),
      })
    }

    return object
  }

  transformTryStatement(node: TryStatement): TryStatementNode {
    const tryStatement: TryStatementNode = {
      type: "try",
      id: this.getNewId(),
      body: [],
      catch: [],
    }

    for (const statement of node.block.body) {
      tryStatement.body.push(this.transformStatement(statement))
    }

    if (node.handler) {
      for (const statement of node.handler.body.body) {
        tryStatement.catch.push(this.transformStatement(statement))
      }
    }

    if (node.finalizer) {
      tryStatement.finally = []

      for (const statement of node.finalizer.body) {
        tryStatement.finally.push(this.transformStatement(statement))
      }
    }

    return tryStatement
  }

  transformArrowFunctionExpression(node: ArrowFunctionExpression): FunctionNode {
    const functionNode: FunctionNode = {
      type: "function",
      id: this.getNewId(),
      params: [],
      body: [],
    }

    this.pushScope()

    functionNode.params?.push(
      ...node.params.map(
        (param: any) =>
          ({
            type: "param",
            id: this.getNewId(),
            name: param.name,
          } satisfies ParamDeclaration),
      ),
    )

    if (node.expression) {
      functionNode.body.push({
        type: "return",
        id: this.getNewId(),
        arg: this.transformExpression(node.body as Expression),
      })
    } else {
      if (node.body.type !== "BlockStatement") {
        throw new Error("Arrow function with expression false should have a block statement body")
      }

      for (const statement of node.body!.body) {
        functionNode.body.push(this.transformStatement(statement))
      }
    }

    this.popScope()

    return functionNode
  }

  transformIfStatement(node: IfStatement): IfStatementNode {
    const ifStatement: IfStatementNode = {
      type: "if",
      id: this.getNewId(),
      test: this.transformExpression(node.test),
      then: [],
    }

    if (node.consequent.type === "ExpressionStatement") {
      ifStatement.then.push(this.transformExpressionStatement(node.consequent))
    } else if (node.consequent.type === "BlockStatement") {
      for (const statement of node.consequent.body) {
        ifStatement.then.push(this.transformStatement(statement))
      }
    } else {
      throw new Error(`Unknown if consequent type: ${node.consequent.type}`)
    }

    if (node.alternate) {
      ifStatement.else = []

      if (node.alternate.type === "ExpressionStatement") {
        ifStatement.else.push(this.transformExpressionStatement(node.alternate))
      } else if (node.alternate.type === "BlockStatement") {
        for (const statement of node.alternate.body) {
          ifStatement.else.push(this.transformStatement(statement))
        }
      } else if (node.alternate.type === "IfStatement") {
        // ifStatement.elseIf.push(this.transformIfStatement(node.alternate))
      } else {
        throw new Error(`Unknown if alternate type: ${node.alternate.type}`)
      }
    }

    return ifStatement
  }
}

export function collapseWhitespace(str: string) {
  return str.replace(/\s+/g, " ").trim()
}
