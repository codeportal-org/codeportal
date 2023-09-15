import {
  ArrowFunctionExpression,
  BinaryExpression,
  FunctionDeclaration,
  Program,
  Statement,
  TryStatement,
} from "estree-jsx"

import {
  AssignmentStatement,
  ComponentNode,
  Expression,
  FunctionCallNode,
  FunctionNode,
  NAryExpression,
  NAryOperatorSymbols,
  ObjectNode,
  ParamDeclaration,
  PathAccessNode,
  ProgramNode,
  ReferenceNode,
  StatementNode,
  TryStatementNode,
  UIElementNode,
  UIExpressionNode,
  UIPropNode,
  UITextNode,
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

  constructor({ topLevelComponent = false }: { topLevelComponent?: boolean } = {}) {
    this.topLevelComponent = topLevelComponent
  }

  transform(node: Program) {
    this.componentMode = false

    if (node.type === "Program") {
      return this.transformProgram(node)
    }
  }

  transformProgram(node: Program): ProgramNode {
    const programNode: ProgramNode = {
      type: "program",
      body: [],
    }

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

    return programNode
  }

  transformComponent(node: FunctionDeclaration): ComponentNode {
    if (node.id === null) {
      throw new Error("Function declaration must have a name (component declaration)")
    }

    this.componentMode = true

    let componentNode: ComponentNode = {
      type: "component",
      name: node.id.name,
      body: [],
    }

    for (const statement of node.body.body) {
      componentNode.body.push(this.transformStatement(statement))
    }

    return componentNode
  }

  transformFunctionDeclaration(node: FunctionDeclaration): FunctionNode {
    if (node.id === null) {
      throw new Error("Function declaration must have a name")
    }

    const functionNode: FunctionNode = {
      type: "function",
      name: node.id.name,
      params:
        node.params?.map(
          (param: any) =>
            ({
              type: "param",
              name: param.name,
            } satisfies ParamDeclaration),
        ) || [],
      body: [],
    }

    for (const statement of node.body.body) {
      functionNode.body.push(this.transformStatement(statement))
    }

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
        return {
          type: "state",
          name: node.declarations[0].id.elements[0].name,
          value: this.transformExpression(node.declarations[0].init.arguments[0]),
        }
      }
    }

    // transform arrow functions into regular functions
    if (node.declarations[0].init.type === "ArrowFunctionExpression") {
      const functionNode: FunctionNode = {
        type: "function",
        name: node.declarations[0].id.name,
        params: node.declarations[0].init.params.map(
          (param: any) =>
            ({
              type: "param",
              name: param.name,
            } satisfies ParamDeclaration),
        ),
        body: [],
      }

      if (node.declarations[0].init.expression) {
        functionNode.body.push({
          type: "return",
          arg: this.transformExpression(node.declarations[0].init.body),
        })
      } else {
        for (const statement of node.declarations[0].init.body.body) {
          functionNode.body.push(this.transformStatement(statement))
        }
      }

      return functionNode
    }

    return {
      type: "var",
      name: node.declarations[0].id.name,
      value: this.transformExpression(node.declarations[0].init),
    }
  }

  transformReturnStatement(node: any): any {
    return {
      type: "return",
      arg: this.transformExpression(node.argument),
    }
  }

  transformExpression(node: any): Expression {
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
    return {
      type: "ref",
      name: node.name,
    }
  }

  transformLiteral(node: any): any {
    return {
      type: typeof node.value,
      value: node.value,
    }
  }

  transformBinaryExpression(node: BinaryExpression): NAryExpression {
    const args: Expression[] = []

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
      operator: operator as any,
      args: args.reverse(),
    }
  }

  transformJSXElement(node: any): UIElementNode {
    return {
      type: "ui element",
      name: node.openingElement.name.name,
      props: node.openingElement.attributes.map((attribute: any) => {
        return {
          type: "ui prop",
          name: attribute.name.name,
          value: attribute.value.value,
        } satisfies UIPropNode
      }),
      children: node.children
        .map((child: any) => {
          if (child.type === "JSXElement") {
            return this.transformJSXElement(child)
          } else if (child.type === "JSXText") {
            // ignore whitespace like JSX with value "\n   " that is just indentation
            if (child.value.trim() === "") {
              return null
            }

            return {
              type: "ui text",
              text: child.value,
            } satisfies UITextNode
          } else if (child.type === "JSXExpressionContainer") {
            return this.transformUIExpression(child.expression)
          } else {
            throw new Error(`Unknown JSX child type: ${child.type}`)
          }
        })
        .filter((child: any) => child !== null),
    }
  }

  transformUIExpression(node: any): UIExpressionNode {
    return {
      type: "ui expression",
      expression: this.transformExpression(node),
    }
  }

  transformCallExpression(node: any): FunctionCallNode {
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
      callee,
      args: node.arguments.map((argument: any) => this.transformExpression(argument)),
    }
  }

  transformExpressionStatement(node: any): any {
    if (node.expression.type === "AssignmentExpression") {
      return this.transformAssignmentExpression(node.expression)
    } else if (node.expression.type === "CallExpression") {
      return this.transformCallExpression(node.expression)
    }

    throw new Error(`Unknown expression statement type: ${node.expression.type}`)
  }

  transformAssignmentExpression(node: any): any {
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
      operator: node.operator,
      left: leftNode,
      right: this.transformExpression(node.right),
    } satisfies AssignmentStatement
  }

  transformMemberExpression(node: any): PathAccessNode {
    let path: any[] = []

    let current = node
    while (current.type === "MemberExpression") {
      path.push(this.transformExpression(current.property))
      current = current.object
    }

    path.push(this.transformExpression(current))

    return {
      type: "path access",
      path: path.reverse(),
    }
  }

  transformObjectExpression(node: any): ObjectNode {
    const object: ObjectNode = {
      type: "object",
      properties: [],
    }

    for (const property of node.properties) {
      object.properties.push({
        type: "property",
        name: this.transformExpression(property.key),
        value: this.transformExpression(property.value),
      })
    }

    return object
  }

  transformTryStatement(node: TryStatement): TryStatementNode {
    const tryStatement: TryStatementNode = {
      type: "try",
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
      params: node.params.map(
        (param: any) =>
          ({
            type: "param",
            name: param.name,
          } satisfies ParamDeclaration),
      ),
      body: [],
    }

    if (node.expression) {
      functionNode.body.push({
        type: "return",
        arg: this.transformExpression(node.body),
      })
    } else {
      if (node.body.type !== "BlockStatement") {
        throw new Error("Arrow function with expression false should have a block statement body")
      }

      for (const statement of node.body!.body) {
        functionNode.body.push(this.transformStatement(statement))
      }
    }

    return functionNode
  }
}
