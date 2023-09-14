import React from "react"

export type ProgramNode = {
  type: "program"
  body: StatementNode[]
}

export type StatementNode =
  | ReturnStatement
  | PrintStatement
  | ComponentNode
  | FunctionNode
  | VarStatement
  | StateStatement
  | FunctionCallNode
  | AssignmentStatement
  | TryStatementNode

export type Expression =
  | Literal
  | UINode
  | ReferenceNode
  | FunctionNode
  | FunctionCallNode
  | PathAccessNode
  | ObjectNode
  | NAryExpression

export type Literal = StringLiteral | NumberLiteral | BooleanLiteral

export type UINode = UIElementNode | UITextNode | UIFragmentNode | UIExpressionNode

export type ComponentNode = {
  type: "component"
  name: string
  props?: UIPropDeclaration[]
  body: StatementNode[]
}

export type UIPropDeclaration = {
  type: "ui prop declaration"
  name: string
  value: Expression
}

/**
 * Can be a React component use or an html element use.
 * The difference is that a React component use has a capital letter.
 */
export type UIElementNode = {
  type: "ui element"
  name: string
  props?: UIPropNode[]
  style?: UIStyleNode[]
  children?: UINode[]
}

export type UIPropNode = {
  type: "ui prop"
  name: string
  value: Expression
}

export type UIStyleNode = {
  type: "ui style"
  name: string
  value: Expression
}

export type UITextNode = {
  type: "ui text"
  text: string
}

export type UIFragmentNode = {
  type: "ui fragment"
  children?: UINode[]
}

export type UIExpressionNode = {
  type: "ui expression"
  expression: Expression
}

export type ReturnStatement = {
  type: "return"
  arg: Expression
}

export type AssignmentOperator = "=" | "+=" | "-=" | "*=" | "/=" | "%="

export type AssignmentStatement = {
  type: "assignment"
  operator: AssignmentOperator
  left: ReferenceNode | PathAccessNode
  right: Expression
}

export type PathAccessNode = {
  type: "path access"
  path: Expression[]
}

export type VarStatement = {
  type: "var"
  name: string
  value: Expression
}

export type StateStatement = {
  type: "state"
  name: string
  value: Expression
}

export type PrintStatement = {
  type: "print"
  arg: Expression
}

export type TryStatementNode = {
  type: "try"
  body: StatementNode[]
  catch: StatementNode[]
  finally?: StatementNode[]
}

/**
 * A reference to a variable or function.
 */
export type ReferenceNode = {
  type: "ref"
  name: string
}

export type StringLiteral = {
  type: "string"
  value: string
}

export type NumberLiteral = {
  type: "number"
  value: number
}

export type BooleanLiteral = {
  type: "boolean"
  value: boolean
}

export type NAryExpression = {
  type: "nary"
  operator: NAryOperator
  args: Expression[]
}

export const NAryOperators = {
  "+": "Addition",
  "-": "Subtraction",
  "*": "Multiplication",
  "/": "Division",
  "%": "Modulus",
  "==": "Equal to",
  "!=": "Not equal to",
  ">": "Greater than",
  "<": "Less than",
  ">=": "Greater than or equal to",
  "<=": "Less than or equal to",
  "&&": "Logical AND",
  "||": "Logical OR",
}

export const NAryOperatorSymbols = Object.keys(NAryOperators) as NAryOperator[]

export type NAryOperator = keyof typeof NAryOperators

/**
 * A function declaration can be both an expression and a statement.
 */
export type FunctionNode = {
  type: "function"
  name?: string
  inline?: boolean
  params?: ParamDeclaration[]
  body: StatementNode[]
}

export type ParamDeclaration = {
  type: "param"
  name: string
}

/**
 * A function call can be both an expression and a statement. We avoid the use of a ExpressionStatement node.
 */
export type FunctionCallNode = {
  type: "function call"
  callee: ReferenceNode | PathAccessNode
  args: Expression[]
}

export type ObjectNode = {
  type: "object"
  properties: ObjectProperty[]
}

export type ObjectProperty = {
  type: "property"
  name: Expression
  value: Expression
}

export const interpretUINode = (code: UINode): React.ReactNode => {
  let children: React.ReactNode[]

  if (code.type === "ui text") {
    return code.text
  }

  if (code.type === "ui expression") {
    return interpretExpression(code.expression)
  }

  if (!code.children || code.children.length === 0) {
    children = []
  } else {
    children = code.children.map((child) => {
      return interpretUINode(child)
    })
  }

  if (code.type === "ui element") {
    const TagName = code.name

    if (!code.children || code.children.length === 0) {
      return React.createElement(TagName, { style: code.style })
    }

    return React.createElement(TagName, { style: code.style }, children)
  } else if (code.type === "ui fragment") {
    return React.createElement(React.Fragment, null, children)
  } else {
    return null
  }
}

export const interpretComponent = (code: ComponentNode): React.ReactNode => {
  for (const statement of code.body) {
    const res = interpretStatement(statement)

    if (res) {
      return res
    }
  }
}

export const interpretStatement = (code: StatementNode): any => {
  if (code.type === "return") {
    return interpretExpression(code.arg)
  } else if (code.type === "print") {
    console.log(interpretExpression(code.arg))
  }
}

export const interpretExpression = (code: Expression): React.ReactNode => {
  if (code.type === "string") {
    return code.value
  } else if (code.type === "number") {
    return code.value
  } else if (code.type === "boolean") {
    return code.value
  } else if (code.type === "ui element" || code.type === "ui fragment" || code.type === "ui text") {
    return interpretUINode(code)
  }
}
