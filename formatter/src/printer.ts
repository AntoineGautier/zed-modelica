/**
 * Prettier printer for Modelica AST
 * Handles all node types from the tree-sitter-modelica grammar
 */

import type { AstPath, Doc, Printer } from 'prettier'
import { doc } from 'prettier'
import type { ASTNode } from './parser.js'

const { builders } = doc
const { group, indent, line, softline, hardline, join, fill } = builders

// ===========================================
// Centralized Continuation Line Handling
// ===========================================

/**
 * Determines if the current path is inside a context that has already
 * added continuation indentation. This prevents cumulative/stacking indents.
 * 
 * A continuation context is entered when:
 * - We're nested inside another binary_expression (the outer one already added indent)
 * 
 * We explicitly DON'T treat if_expression as a continuation context for binary
 * expressions because the binary expression's continuation needs its own indent.
 * 
 * We stop looking at certain boundaries:
 * - declaration (top-level variable declaration)
 * - component_declaration  
 * - equation / statement boundaries
 * - function_call_args (each function call is its own context)
 * - if_expression (each branch is its own context)
 */
function isInContinuationContext(path: AstPath<ASTNode>): boolean {
  const currentNode = path.getValue()
  
  // Start from i=1 to skip the current node itself
  for (let i = 1; i < 15; i++) {
    const ancestor = path.getParentNode(i)
    if (!ancestor) break
    
    // If we're nested inside another binary_expression, we're in continuation context
    // The outer binary_expression already handles indentation for its operands
    if (ancestor.type === 'binary_expression' && ancestor !== currentNode) {
      return true
    }
    
    // NOTE: We explicitly do NOT treat if_expression conditions as continuation context
    // Binary expressions inside if conditions should still indent their own continuations
    // The if_expression only handles indent for then/else, not the condition's internal structure
    
    // If we're inside a parenthesized_expression, we're in continuation context
    // The parenthesized_expression adds indent for its content
    if (ancestor.type === 'parenthesized_expression') {
      return true
    }
    
    // Stop at these boundaries - they reset the continuation context
    if (ancestor.type === 'declaration') break
    if (ancestor.type === 'component_declaration') break
    if (ancestor.type === 'equation') break
    if (ancestor.type === 'statement') break
    if (ancestor.type === 'element') break
    if (ancestor.type === 'function_call_args') break
    if (ancestor.type === 'if_expression') break
  }
  return false
}

/**
 * Wraps a document in continuation indentation, but only if not already
 * in a continuation context. This is the central function for handling
 * continuation lines consistently across all constructs.
 * 
 * @param content - The document to wrap
 * @param path - Current AST path for context detection
 * @returns Content wrapped with appropriate indentation
 */
function wrapContinuation(content: Doc, path: AstPath<ASTNode>): Doc {
  if (isInContinuationContext(path)) {
    // Already in continuation context - use group with line but NO indent
    // This allows Prettier to decide whether to break, but keeps same indent level
    return group([line, content])
  }
  // Not in continuation context - add indent with group for break decision
  return group([indent([line, content])])
}

/**
 * Determines if an if-expression appears "mid-line" - i.e., after something
 * on the same line like `name=if ...` or `arg=if ...`.
 * 
 * When mid-line, the if-expression needs to indent its then/else keywords
 * relative to where the if started, not relative to the left margin.
 * 
 * This is detected by checking if the parent is a modification with an
 * expression (meaning there's a `=` before us) and the parent of that
 * is NOT a top-level declaration.
 */
function isMidLineIfExpression(path: AstPath<ASTNode>): boolean {
  const parent = path.getParentNode()
  const grandparent = path.getParentNode(1)
  const greatGrandparent = path.getParentNode(2)
  
  // Pattern: if_expression -> expression/simple_expression -> modification -> X
  // where X is element_modification or named_argument (not declaration)
  if (parent?.type === 'expression' || parent?.type === 'simple_expression') {
    if (grandparent?.type === 'modification') {
      // Check what the modification belongs to
      if (greatGrandparent?.type === 'element_modification' ||
          greatGrandparent?.type === 'named_argument') {
        return true
      }
    }
  }
  
  // Also check for equation-level assignments: x = if ...
  // Pattern: if_expression -> expression -> simple_equation
  // In this case, the if appears on the same line as `x =`, so we need indent
  if ((parent?.type === 'simple_expression' || parent?.type === 'expression') && 
      grandparent?.type === 'simple_equation') {
    return true
  }
  
  return false
}




/**
 * Simple HTML formatter for documentation strings
 * Enforces line length while preserving structure and never breaking within words/tags
 */
function formatHTMLString(html: string, maxWidth: number = 80, baseIndent: string = ''): string {
  const lines: string[] = []
  let currentLine = baseIndent

  // Split on tags and text, preserving structure
  const tokens = html.match(/(<[^>]+>|[^<]+)/g) || []

  for (const token of tokens) {
    if (token.startsWith('<')) {
      // This is a tag - add it to current line
      if (currentLine.length + token.length > maxWidth && currentLine.trim().length > 0) {
        // Tag would exceed limit, start new line
        lines.push(currentLine.trimEnd())
        currentLine = baseIndent + token
      } else {
        currentLine += token
      }
    } else {
      // This is text content - try to keep phrases together
      // Only break at spaces when line would exceed limit
      if (currentLine.length + token.length > maxWidth && currentLine.trim().length > 0) {
        // Text would exceed limit - need to break it
        // Preserve leading whitespace
        const leadingSpace = token.match(/^\s*/)?.[0] || ''
        const trailingSpace = token.match(/\s*$/)?.[0] || ''
        const trimmedToken = token.trim()

        if (trimmedToken) {
          const words = trimmedToken.split(/\s+/)

          for (let i = 0; i < words.length; i++) {
            const word = words[i]
            const isFirst = i === 0
            const isLast = i === words.length - 1

            if (currentLine.length + (isFirst ? leadingSpace.length : 1) + word.length > maxWidth && currentLine.trim().length > 0) {
              // Start new line
              lines.push(currentLine.trimEnd())
              currentLine = baseIndent + word + (isLast ? trailingSpace : '')
            } else {
              currentLine += (isFirst ? leadingSpace : ' ') + word + (isLast ? trailingSpace : '')
            }
          }
        } else {
          // Token is only whitespace, just add it if there's room
          if (currentLine.length + token.length <= maxWidth) {
            currentLine += token
          }
        }
      } else {
        // Whole text fits, add it
        currentLine += token
      }
    }
  }

  if (currentLine.trim().length > 0) {
    lines.push(currentLine.trimEnd())
  }

  return lines.join('\n')
}

/**
 * Check if we're inside an annotation clause by walking up the path
 */
function isInsideAnnotation(path: AstPath<ASTNode>): boolean {
  let depth = 0
  try {
    while (true) {
      const node = path.getParentNode(depth)
      if (!node) break
      if (node.type === 'annotation_clause') return true
      depth++
      if (depth > 50) break // safety limit
    }
  } catch {
    // path.getParentNode can throw if we go too far
  }
  return false
}

/**
 * Check if we're a first-level attribute inside an annotation
 * (direct child of the annotation's class_modification)
 */
function isFirstLevelAnnotationAttribute(path: AstPath<ASTNode>): boolean {
  try {
    // Walk up to find if parent is class_modification and grandparent is annotation_clause
    const grandparent = path.getParentNode(1) // might be class_modification
    const greatGrandparent = path.getParentNode(2) // might be annotation_clause

    return grandparent?.type === 'class_modification' &&
           greatGrandparent?.type === 'annotation_clause'
  } catch {
    return false
  }
}

/**
 * Check if we're inside a first-level annotation attribute
 * (anywhere inside Diagram, Icon, Placement, etc. that are direct children of annotation)
 */


/**
 * List of graphical primitive names in Modelica annotations
 */
const GRAPHICAL_PRIMITIVES = new Set([
  'Rectangle', 'Ellipse', 'Line', 'Polygon', 'Text', 'Bitmap',
  'Arc', 'BezierCurve', 'FilledShape', 'PointArray'
])

/**
 * Check if a node represents a graphical primitive function call
 */
function isGraphicalPrimitive(node: ASTNode): boolean {
  if (node.type !== 'function_application') return false
  // Get the function name from the first child (component_reference or name)
  const nameChild = node.children.find(c => c.type === 'component_reference' || c.type === 'name')
  if (!nameChild) return false
  // Get the identifier text
  const ident = nameChild.text?.split('.').pop() || ''
  return GRAPHICAL_PRIMITIVES.has(ident)
}

/**
 * Check if this is a graphics array (graphics={...})
 * The path structure for array_constructor inside graphics={} is:
 *   array_constructor -> primary_expression -> simple_expression -> expression -> modification -> element_modification
 * So we need to walk up ~5 levels to find the element_modification with name 'graphics'
 */
function isGraphicsArray(path: AstPath<ASTNode>): boolean {
  try {
    // Walk up the parent chain looking for element_modification with name 'graphics'
    for (let depth = 0; depth < 10; depth++) {
      const node = path.getParentNode(depth)
      if (!node) break

      if (node.type === 'element_modification') {
        const nameChild = node.children.find(c => c.type === 'name')
        if (nameChild?.text === 'graphics') return true
        // If we found an element_modification but it's not 'graphics', stop looking
        break
      }

      // Stop if we hit the annotation boundary
      if (node.type === 'annotation_clause') break
    }
  } catch {
    // Ignore
  }
  return false
}

/**
 * Check if this is a choices annotation (choices(...))
 */


/**
 * Check if this is inside a choices annotation
 */
function isInsideChoicesAnnotation(path: AstPath<ASTNode>): boolean {
  try {
    let depth = 0
    while (depth < 20) {
      const node = path.getParentNode(depth)
      if (!node) break
      if (node.type === 'element_modification') {
        const nameChild = node.children.find(c => c.type === 'name')
        if (nameChild?.text === 'choices') return true
      }
      if (node.type === 'annotation_clause') break
      depth++
    }
  } catch {
    // Ignore
  }
  return false
}

/**
 * Check if an array contains only numeric/coordinate data (should stay compact)
 */
function isCoordinateArray(node: ASTNode): boolean {
  if (node.type !== 'array_constructor' && node.type !== 'array_arguments') return false

  // Check if all children are simple literals or nested coordinate arrays
  const isSimple = (n: ASTNode): boolean => {
    // Literal numbers
    if (n.type === 'literal_expression' || n.type === 'UNSIGNED_INTEGER' ||
        n.type === 'UNSIGNED_REAL' || n.type === 'number') return true
    // Negated numbers
    if (n.type === 'unary_expression' && n.children.length <= 2) {
      return n.children.every(c => isSimple(c) || c.type === 'IDENT')
    }
    // Simple expressions that are just numbers
    if (n.type === 'simple_expression' || n.type === 'expression' || n.type === 'primary_expression') {
      return n.children.every(c => isSimple(c))
    }
    // Nested arrays (for {{x,y},{x,y}})
    if (n.type === 'array_constructor' || n.type === 'array_arguments') {
      return n.children.every(c => isSimple(c))
    }
    // Component references that look like enum values or simple identifiers
    if (n.type === 'component_reference' || n.type === 'IDENT') return true
    return false
  }

  return node.children.every(c => isSimple(c))
}

/**
 * Get the name of a function application or element modification
 */
function getAnnotationElementName(node: ASTNode): string | null {
  if (node.type === 'function_application') {
    const nameChild = node.children.find(c => c.type === 'component_reference' || c.type === 'name')
    return nameChild?.text?.split('.').pop() || null
  }
  if (node.type === 'element_modification') {
    const nameChild = node.children.find(c => c.type === 'name')
    return nameChild?.text || null
  }
  return null
}

/**
 * Check if we're inside a graphical primitive (Rectangle, Line, etc.)
 */
function isInsideGraphicalPrimitive(path: AstPath<ASTNode>): boolean {
  try {
    let depth = 0
    while (depth < 20) {
      const node = path.getParentNode(depth)
      if (!node) break
      if (node.type === 'function_application' && isGraphicalPrimitive(node)) {
        return true
      }
      if (node.type === 'annotation_clause') break
      depth++
    }
  } catch {
    // Ignore
  }
  return false
}



/**
 * Main print function for Modelica AST
 */
export const printModelica: Printer<ASTNode>['print'] = (
  path: AstPath<ASTNode>,
  __options: object,
  print: (path: AstPath<ASTNode>) => Doc
): Doc => {
  const node = path.getValue()

  if (!node) {
    return ''
  }

  // Route to appropriate handler based on node type
  switch (node.type) {
    // ===========================================
    // Terminal nodes - print text directly
    // ===========================================
    case 'IDENT':
    case 'UNSIGNED_INTEGER':
    case 'UNSIGNED_REAL':
      return node.text ?? ''

    case 'STRING': {
      const text = node.text ?? ''

      // Check if this is HTML documentation in an annotation
      const inAnnotation = isInsideAnnotation(path)
      if (inAnnotation && text.includes('<html>')) {
        // Extract string content (remove quotes)
        const match = text.match(/^"(.*)"$/s)
        if (match) {
          const htmlContent = match[1]
          // Format HTML with line length limit
          const formatted = formatHTMLString(htmlContent, 80, '')
          return `"${formatted}"`
        }
      }

      return text
    }

    case 'BLOCK_COMMENT':
    case 'comment':
      return node.text ?? ''

    // ===========================================
    // Top-level structure
    // ===========================================
    case 'stored_definitions':
      return [join(hardline, path.map(print, 'children')), hardline]

    case 'stored_definition':
      return join(hardline, path.map(print, 'children'))

    case 'within_clause': {
      const parts: Doc[] = ['within ']
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'name') {
          parts.push(path.call(print, 'children', i))
        }
      }
      parts.push(';')
      return parts
    }

    // ===========================================
    // Class definitions
    // ===========================================
    case 'class_definition': {
      const parts: Doc[] = []
      for (let i = 0; i < node.children.length; i++) {
        if (i > 0) parts.push(' ')
        parts.push(path.call(print, 'children', i))
      }
      return parts
    }

    case 'class_prefixes': {
      // This node contains keywords like "model", "package", "final", "partial", etc.
      // Use the text directly as it contains all the keywords
      return node.text ?? ''
    }

    case 'long_class_specifier': {
      const parts: Doc[] = []
      let className = ''

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'IDENT' && !className) {
          className = child.text ?? ''
          parts.push(className)
        } else if (child.type === 'description_string') {
          parts.push(indent([line, path.call(print, 'children', i)]))
        } else if (child.type === 'extends_clause') {
          // extends clause should be on new line with indent
          parts.push(indent([line, path.call(print, 'children', i)]))
        } else if (child.type === 'element_list' ||
                   child.type === 'public_element_list' ||
                   child.type === 'protected_element_list') {
          parts.push(indent([line, path.call(print, 'children', i)]))
        } else if (child.type === 'equation_section' ||
                   child.type === 'algorithm_section') {
          // Equation/algorithm sections should start on a new line (no blank line)
          parts.push(hardline, path.call(print, 'children', i))
        } else if (child.type === 'annotation_clause') {
          parts.push(hardline, path.call(print, 'children', i))
        } else if (child.type === 'external_clause') {
          parts.push(hardline, path.call(print, 'children', i))
        } else if (child.type === 'comment' || child.type === 'BLOCK_COMMENT') {
          // Comments between sections - indent them like other content
          parts.push(indent([line, path.call(print, 'children', i)]))
        }
      }

      parts.push(hardline, 'end ', className, ';')
      return group(parts)
    }

    case 'short_class_specifier': {
      // Format: IDENT = type_specifier [class_modification] [description_string]
      const parts: Doc[] = []

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'IDENT') {
          parts.push(child.text ?? '')
        } else if (child.type === 'base_prefix') {
          parts.push(path.call(print, 'children', i), ' ')
        } else if (child.type === 'type_specifier') {
          parts.push('=', path.call(print, 'children', i))
        } else if (child.type === 'class_modification') {
          parts.push(path.call(print, 'children', i))
        } else if (child.type === 'description_string') {
          parts.push(' ', path.call(print, 'children', i))
        }
      }
      return parts
    }

    case 'derivative_class_specifier':
    case 'enumeration_class_specifier':
    case 'extends_class_specifier':
      return printChildrenWithSpaces(path, print)

    case 'enum_list':
      return join(', ', path.map(print, 'children'))

    case 'enumeration_literal':
      return printChildrenWithSpaces(path, print)

    case 'base_prefix':
      return node.text ?? ''

    // ===========================================
    // Element lists
    // ===========================================
    case 'element_list':
      return join(hardline, path.map(print, 'children'))

    case 'public_element_list':
      return ['public', indent([line, join(hardline, path.map(print, 'children'))])]

    case 'protected_element_list':
      return ['protected', indent([line, join(hardline, path.map(print, 'children'))])]

    // ===========================================
    // Elements
    // ===========================================
    case 'named_element': {
      // Extract prefixes (parameter, final, etc.) from node.text
      const parts: Doc[] = []
      const prefix = extractElementPrefix(node)
      if (prefix) {
        parts.push(prefix, ' ')
      }

      // Check if this named_element has a constraining_clause (for replaceable components)
      const hasConstrainingClause = node.children.some(c => c.type === 'constraining_clause')
      const hasDescriptionString = node.children.some(c => c.type === 'description_string')
      const hasAnnotationClause = node.children.some(c => c.type === 'annotation_clause')

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'component_clause') {
          parts.push(path.call(print, 'children', i))
          // Don't add semicolon here if there are more clauses to follow
          if (!hasConstrainingClause && !hasDescriptionString && !hasAnnotationClause) {
            parts.push(';')
          }
        } else if (child.type === 'class_definition') {
          parts.push(path.call(print, 'children', i))
        } else if (child.type === 'constraining_clause') {
          // constraining_clause comes after component_clause for replaceable components
          parts.push(indent([line, path.call(print, 'children', i)]))
        } else if (child.type === 'description_string') {
          // Description string comes after constraining_clause or component_clause
          parts.push(indent([line, path.call(print, 'children', i)]))
        } else if (child.type === 'annotation_clause') {
          // Annotation clause comes last
          parts.push(indent([line, path.call(print, 'children', i)]))
        }
      }

      // Add semicolon at the end if we have constraining_clause, description_string, or annotation_clause
      if (hasConstrainingClause || hasDescriptionString || hasAnnotationClause) {
        // Only add semicolon if we had a component_clause (not a class_definition)
        if (node.children.some(c => c.type === 'component_clause')) {
          parts.push(';')
        }
      }
      return group(parts)
    }

    case 'import_clause':
      return ['import ', ...printChildrenWithSpaces(path, print), ';']

    case 'import_list':
      return join(', ', path.map(print, 'children'))

    case 'extends_clause': {
      const parts: Doc[] = ['extends ']
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'type_specifier') {
          parts.push(path.call(print, 'children', i))
        } else if (child.type === 'class_modification') {
          parts.push(path.call(print, 'children', i))
        } else if (child.type === 'annotation_clause') {
          parts.push(' ', path.call(print, 'children', i))
        }
      }
      parts.push(';')
      return group(parts)
    }

    case 'constraining_clause':
      return ['constrainedby ', ...printChildrenWithSpaces(path, print)]

    // ===========================================
    // Components
    // ===========================================
    case 'component_clause': {
      const parts: Doc[] = []

      // Extract prefix keywords (parameter, constant, etc.) before type_specifier
      const prefix = extractComponentClausePrefix(node)
      if (prefix) {
        parts.push(prefix, ' ')
      }

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'type_specifier') {
          parts.push(path.call(print, 'children', i), ' ')
        } else if (child.type === 'component_list') {
          parts.push(path.call(print, 'children', i))
        } else if (child.type === 'array_subscripts') {
          parts.push(path.call(print, 'children', i), ' ')
        }
      }
      // Don't add semicolon here - it's added by named_element or left off for redeclarations
      return parts
    }

    case 'component_list':
      return join([',', line], path.map(print, 'children'))

    case 'component_declaration': {
      const parts: Doc[] = []
      let hasModification = false

      // Check if declaration has a modification (class_modification with arguments)
      const decl = node.children.find(c => c.type === 'declaration')
      if (decl) {
        hasModification = decl.children.some(c => c.type === 'modification')
      }

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'declaration') {
          parts.push(path.call(print, 'children', i))
        } else if (child.type === 'condition_attribute') {
          parts.push(' ', path.call(print, 'children', i))
        } else if (child.type === 'expression' || child.type === 'simple_expression') {
          // Conditional clause: "if <expression>"
          // If declaration has modification, break line before 'if' for readability
          // Otherwise keep it on same line
          if (hasModification) {
            parts.push(indent([line, 'if ', path.call(print, 'children', i)]))
          } else {
            parts.push(' if ', path.call(print, 'children', i))
          }
        } else if (child.type === 'description_string') {
          // Break line before description string, indented
          parts.push(indent([line, path.call(print, 'children', i)]))
        } else if (child.type === 'annotation_clause') {
          // Break line before annotation, indented
          parts.push(indent([line, path.call(print, 'children', i)]))
        } else if (child.type === 'comment') {
          parts.push(' ', path.call(print, 'children', i))
        }
      }
      return group(parts)
    }

    case 'condition_attribute': {
      const parts: Doc[] = ['if ']
      for (let i = 0; i < node.children.length; i++) {
        parts.push(path.call(print, 'children', i))
      }
      return parts
    }

    case 'declaration': {
      const parts: Doc[] = []
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'IDENT') {
          parts.push(child.text ?? '')
        } else if (child.type === 'array_subscripts') {
          parts.push(path.call(print, 'children', i))
        } else if (child.type === 'modification') {
          parts.push(path.call(print, 'children', i))
        }
      }
      return parts
    }

    // ===========================================
    // Modifications
    // ===========================================
    case 'modification': {
      const parts: Doc[] = []
      // Check if parent is a declaration (top-level assignment) vs element_modification (attribute binding)
      // Top-level assignments get spaces around =, attribute bindings don't
      const parent = path.getParentNode()
      const isTopLevelAssignment = parent?.type === 'declaration'

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'class_modification') {
          parts.push(path.call(print, 'children', i))
        } else if (child.type === 'expression' || child.type === 'simple_expression') {
          if (isTopLevelAssignment) {
            // For top-level assignments: "= " then expression
            // Use group with line to break after = if line exceeds printWidth
            parts.push(group([
              ' =',
              indent([line, path.call(print, 'children', i)])
            ]))
          } else {
            // For attribute bindings: no space around =
            // In annotations, don't add indent to keep compact
            // Don't add indent here - function calls and other expressions handle their own indentation
            parts.push('=', path.call(print, 'children', i))
          }
        }
      }
      return parts
    }

    case 'class_modification': {
      // Format arguments on multiple lines if complex
      if (node.children.length === 0) {
        return '()'
      }

      const inAnnotation = isInsideAnnotation(path)

      if (inAnnotation) {
        const parent = path.getParentNode()
        const isTopLevelAnnotation = parent?.type === 'annotation_clause'

        if (isTopLevelAnnotation) {
          // Top-level annotation: first arg on same line, rest on new lines indented
          // Format: annotation(first,
          //   second,
          //   third)
          // Closing paren stays on same line as last element
          // We need to get the actual element_modification children from the argument_list
          const argListNode = node.children.find(c => c.type === 'argument_list')
          if (!argListNode || argListNode.children.length === 0) {
            return '()'
          }

          // Find the index of argument_list to use path.call properly
          const argListIndex = node.children.findIndex(c => c.type === 'argument_list')

          // Get individual element arguments by mapping over argument_list's children
          const elementArgs: Doc[] = []
          for (let i = 0; i < argListNode.children.length; i++) {
            elementArgs.push(path.call(print, 'children', argListIndex, 'children', i))
          }

          if (elementArgs.length === 1) {
            // Single arg: keep on same line if short
            return group(['(', elementArgs[0], ')'])
          }

          // Multiple args: first inline, rest indented on new lines
          // Use hardline to force breaks between top-level elements
          // Closing paren on same line as last element
          return [
            '(',
            elementArgs[0],
            ',',
            indent([hardline, join([',', hardline], elementArgs.slice(1)), ')']),
          ]
        } else {
          // Nested annotations - check context for formatting
          // Check if we're inside a choices annotation - each choice on its own line
          if (isInsideChoicesAnnotation(path)) {
            const argListNode = node.children.find(c => c.type === 'argument_list')
            if (!argListNode || argListNode.children.length === 0) {
              return '()'
            }
            const argListIndex = node.children.findIndex(c => c.type === 'argument_list')
            const elementArgs: Doc[] = []
            for (let i = 0; i < argListNode.children.length; i++) {
              elementArgs.push(path.call(print, 'children', argListIndex, 'children', i))
            }
            if (elementArgs.length === 1) {
              return ['(', elementArgs[0], ')']
            }
            // First choice on same line, rest on new lines with indent
            // Closing paren on same line as last element
            return [
              '(',
              elementArgs[0],
              ',',
              indent([hardline, join([',', hardline], elementArgs.slice(1)), ')']),
            ]
          }
          
          // For nested class_modifications in annotations (like Icon(...), Placement(...)),
          // use the same "first inline, rest on new lines" pattern
          // Closing paren stays on same line as last element
          const argListNode = node.children.find(c => c.type === 'argument_list')
          if (argListNode && argListNode.children.length > 0) {
            const argListIndex = node.children.findIndex(c => c.type === 'argument_list')
            const elementArgs: Doc[] = []
            for (let i = 0; i < argListNode.children.length; i++) {
              elementArgs.push(path.call(print, 'children', argListIndex, 'children', i))
            }
            if (elementArgs.length === 1) {
              return ['(', elementArgs[0], ')']
            }
            // First arg on same line, rest indented on new lines, closing paren on same line as last
            return [
              '(',
              elementArgs[0],
              ',',
              indent([hardline, join([',', hardline], elementArgs.slice(1)), ')']),
            ]
          }
          
          const args = path.map(print, 'children')
          if (args.length === 0) {
            return '()'
          }
          if (args.length === 1) {
            return group(['(', args[0], ')'])
          }
          // Fallback for nested class modifications
          // Closing paren stays on same line as last element
          return group([
            '(',
            indent([softline, join([',', line], args), ')']),
          ])
        }
      }

      // Normal formatting with line breaks
      // Closing paren stays on same line as last element
      const args = path.map(print, 'children')
      return group([
        '(',
        indent([softline, join([',', line], args), ')']),
      ])
    }

    case 'argument_list': {
      const inAnnotation = isInsideAnnotation(path)
      if (inAnnotation) {
        const args = path.map(print, 'children')

        // Check if we're inside choices - each choice on its own line
        if (isInsideChoicesAnnotation(path)) {
          return join([',', line], args)
        }

        // Check if inside a graphical primitive - parameters one per line
        if (isInsideGraphicalPrimitive(path)) {
          return join([',', line], args)
        }

        // Check if this is the top-level argument_list inside an annotation's class_modification
        const parent = path.getParentNode()
        const grandparent = path.getParentNode(1)
        const isTopLevelAnnotationArgs = parent?.type === 'class_modification' &&
                                          grandparent?.type === 'annotation_clause'

        if (isTopLevelAnnotationArgs) {
          // Top-level annotation elements: each on its own line
          return join([',', line], args)
        }

        // Default: use fill to pack arguments
        const fillItems: Doc[] = []
        for (let i = 0; i < args.length; i++) {
          if (i > 0) {
            fillItems.push([',', line])
          }
          fillItems.push(args[i])
        }
        return fill(fillItems)
      }
      return join([',', line], path.map(print, 'children'))
    }

    case 'element_modification': {
      const parts: Doc[] = []
      // Check for 'each' and 'final' prefixes
      const prefix = extractModificationPrefix(node)
      if (prefix) {
        parts.push(prefix, ' ')
      }

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'name') {
          parts.push(path.call(print, 'children', i))
        } else if (child.type === 'modification') {
          parts.push(path.call(print, 'children', i))
        } else if (child.type === 'description_string') {
          parts.push(' ', path.call(print, 'children', i))
        }
      }
      return parts
    }

    case 'element_replaceable':
      return printChildrenWithSpaces(path, print)

    case 'class_redeclaration': {
      // Extract 'redeclare' and optionally 'final', 'each' from node.text
      const prefix = extractRedeclarePrefix(node)
      const parts: Doc[] = [prefix, ' ']

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'short_class_definition' || child.type === 'class_definition') {
          parts.push(path.call(print, 'children', i))
        }
      }
      return parts
    }

    case 'component_redeclaration': {
      const prefix = extractRedeclarePrefix(node)
      const parts: Doc[] = [prefix, ' ']

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'component_clause') {
          parts.push(path.call(print, 'children', i))
        }
      }
      return parts
    }

    case 'short_class_definition': {
      const parts: Doc[] = []
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'class_prefixes') {
          parts.push(path.call(print, 'children', i), ' ')
        } else if (child.type === 'short_class_specifier') {
          parts.push(path.call(print, 'children', i))
        }
      }
      return parts
    }

    // ===========================================
    // Equations
    // ===========================================
    case 'equation_section': {
      const parts: Doc[] = []
      // Check if this is an initial equation section by looking at the node text
      const isInitial = (node.text ?? '').trimStart().startsWith('initial')
      const content: Doc[] = []

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'equation_list') {
          content.push(path.call(print, 'children', i))
        } else if (child.type === 'comment' || child.type === 'BLOCK_COMMENT') {
          // Comments before the equation list - add them in order
          content.push(path.call(print, 'children', i))
        }
      }

      parts.push(isInitial ? 'initial equation' : 'equation')
      if (content.length > 0) {
        parts.push(indent([line, join(hardline, content)]))
      }
      return parts
    }

    case 'equation_list':
      return join(hardline, path.map(print, 'children'))

    case 'simple_equation': {
      // Handle equation with two expressions and = between them
      const exprChildren = node.children.filter(c =>
        c.type === 'simple_expression' || c.type === 'expression'
      )

      if (exprChildren.length === 2) {
        const result: Doc[] = []
        let firstExprDone = false
        for (let i = 0; i < node.children.length; i++) {
          const child = node.children[i]
          if ((child.type === 'simple_expression' || child.type === 'expression') && !firstExprDone) {
            result.push(path.call(print, 'children', i), ' = ')
            firstExprDone = true
          } else if (child.type === 'simple_expression' || child.type === 'expression') {
            result.push(path.call(print, 'children', i))
          } else if (child.type === 'comment') {
            result.push(' ', path.call(print, 'children', i))
          }
        }
        result.push(';')
        return group(result)
      }

      // Fallback for single expression equations
      const parts: Doc[] = []
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'simple_expression' || child.type === 'expression') {
          parts.push(path.call(print, 'children', i))
        } else if (child.type === 'comment') {
          parts.push(' ', path.call(print, 'children', i))
        }
      }
      parts.push(';')
      return group(parts)
    }

    case 'connect_clause': {
      const parts: Doc[] = ['connect(']
      const args: Doc[] = []
      let hasAnnotation = false

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'component_reference') {
          args.push(path.call(print, 'children', i))
        } else if (child.type === 'annotation_clause') {
          hasAnnotation = true
          parts.push(join(', ', args), ')')
          // Annotation should be indented relative to connect keyword
          parts.push(indent([hardline, path.call(print, 'children', i)]))
          parts.push(';')
        }
      }

      if (!hasAnnotation) {
        parts.push(join(', ', args), ');')
      }
      return parts
    }

    case 'for_equation':
    case 'for_statement': {
      const parts: Doc[] = ['for ']
      const body: Doc[] = []

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'for_indices') {
          parts.push(path.call(print, 'children', i), ' loop')
        } else if (child.type === 'equation_list' || child.type === 'statement_list') {
          body.push(path.call(print, 'children', i))
        }
      }

      parts.push(indent([line, ...body]))
      parts.push(hardline, 'end for;')
      return group(parts)
    }

    case 'for_indices':
      return join(', ', path.map(print, 'children'))

    case 'for_index': {
      const parts: Doc[] = []
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'IDENT') {
          parts.push(child.text ?? '')
        } else if (child.type === 'expression' || child.type === 'simple_expression') {
          parts.push(' in ', path.call(print, 'children', i))
        }
      }
      return parts
    }

    case 'if_equation':
    case 'if_statement': {
      const parts: Doc[] = ['if ']
      let statementListCount = 0

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'expression') {
          parts.push(path.call(print, 'children', i), ' then')
        } else if (child.type === 'equation_list' || child.type === 'statement_list') {
          statementListCount++
          if (statementListCount === 1) {
            // First statement_list is the then branch
            parts.push(indent([line, path.call(print, 'children', i)]))
          } else {
            // Second statement_list is the else branch (no elseif in between)
            parts.push(hardline, 'else')
            parts.push(indent([line, path.call(print, 'children', i)]))
          }
        } else if (child.type === 'else_if_equation_clause_list' ||
                   child.type === 'else_if_statement_clause_list') {
          parts.push(hardline, path.call(print, 'children', i))
        } else if (child.type === 'else_clause') {
          // Handle else_clause node which contains the else branch
          parts.push(hardline, path.call(print, 'children', i))
        }
      }

      parts.push(hardline, 'end if;')
      return group(parts)
    }

    case 'else_if_equation_clause_list':
    case 'else_if_statement_clause_list':
      return join(hardline, path.map(print, 'children'))

    case 'else_if_equation_clause':
    case 'else_if_statement_clause': {
      const parts: Doc[] = ['elseif ']

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'expression') {
          parts.push(path.call(print, 'children', i), ' then')
        } else if (child.type === 'equation_list' || child.type === 'statement_list') {
          parts.push(indent([line, path.call(print, 'children', i)]))
        }
      }
      return parts
    }

    case 'when_equation':
    case 'when_statement': {
      const parts: Doc[] = ['when ']

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'expression') {
          parts.push(path.call(print, 'children', i), ' then')
        } else if (child.type === 'equation_list' || child.type === 'statement_list') {
          parts.push(indent([line, path.call(print, 'children', i)]))
        } else if (child.type === 'else_when_equation_clause_list' ||
                   child.type === 'else_when_statement_clause_list') {
          parts.push(hardline, path.call(print, 'children', i))
        }
      }

      parts.push(hardline, 'end when;')
      return group(parts)
    }

    case 'else_when_equation_clause_list':
    case 'else_when_statement_clause_list':
      return join(hardline, path.map(print, 'children'))

    case 'else_when_equation_clause':
    case 'else_when_statement_clause': {
      const parts: Doc[] = ['elsewhen ']

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'expression') {
          parts.push(path.call(print, 'children', i), ' then')
        } else if (child.type === 'equation_list' || child.type === 'statement_list') {
          parts.push(indent([line, path.call(print, 'children', i)]))
        }
      }
      return parts
    }

    case 'function_application_equation':
    case 'function_application_statement':
      return [...printChildren(path, print), ';']

    // ===========================================
    // Algorithms / Statements
    // ===========================================
    case 'algorithm_section': {
      const parts: Doc[] = []
      // Check if this is an initial algorithm section by looking at the node text
      const isInitial = (node.text ?? '').trimStart().startsWith('initial')
      const content: Doc[] = []

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'statement_list') {
          content.push(path.call(print, 'children', i))
        } else if (child.type === 'comment' || child.type === 'BLOCK_COMMENT') {
          content.push(path.call(print, 'children', i))
        }
      }

      parts.push(isInitial ? 'initial algorithm' : 'algorithm')
      if (content.length > 0) {
        parts.push(indent([line, join(hardline, content)]))
      }
      return parts
    }

    case 'statement_list':
      return join(hardline, path.map(print, 'children'))

    case 'assignment_statement': {
      const parts: Doc[] = []
      let hasRef = false

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'component_reference') {
          parts.push(path.call(print, 'children', i))
          hasRef = true
        } else if (child.type === 'expression' || child.type === 'simple_expression') {
          if (hasRef) {
            parts.push(' := ')
          }
          parts.push(path.call(print, 'children', i))
        } else if (child.type === 'comment') {
          parts.push(' ', path.call(print, 'children', i))
        }
      }
      parts.push(';')
      return group(parts)
    }

    case 'break_statement':
      return 'break;'

    case 'return_statement':
      return 'return;'

    case 'while_statement': {
      const parts: Doc[] = ['while ']
      const body: Doc[] = []

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'expression') {
          parts.push(path.call(print, 'children', i), ' loop')
        } else if (child.type === 'statement_list') {
          body.push(path.call(print, 'children', i))
        }
      }

      parts.push(indent([line, ...body]))
      parts.push(hardline, 'end while;')
      return group(parts)
    }

    case 'multiple_output_function_application_statement': {
      const parts: Doc[] = ['(']

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'output_expression_list') {
          parts.push(path.call(print, 'children', i))
        } else if (child.type === 'component_reference' || child.type === 'function_application') {
          parts.push(') := ', path.call(print, 'children', i))
        }
      }

      parts.push(';')
      return parts
    }

    // ===========================================
    // Expressions
    // ===========================================
    case 'expression':
      return printChildren(path, print)

            case 'if_expression': {
      const children = node.children
      let childIdx = 0

      // Use centralized continuation context detection
      const inContinuation = isInContinuationContext(path)
      const midLine = isMidLineIfExpression(path)

      // Collect all parts for proper grouping and line breaking
      const conditionParts: Doc[] = []
      let thenExprDoc: Doc = ''
      let elseExprDoc: Doc = ''
      const elseIfParts: Doc[] = []

      // First child is condition
      if (children[childIdx]) {
        conditionParts.push(path.call(print, 'children', childIdx))
        childIdx++
      }

      // Then expression (after 'then')
      if (children[childIdx] && children[childIdx].type !== 'else_if_clause') {
        thenExprDoc = path.call(print, 'children', childIdx)
        childIdx++
      }

      // Handle elseif clauses and else expression
      while (childIdx < children.length) {
        const child = children[childIdx]
        if (child.type === 'else_if_clause') {
          // elseif should be at same level as if/then/else
          // Use line (not softline) to ensure space before elseif when group doesn't break
          elseIfParts.push(line, path.call(print, 'children', childIdx))
        } else {
          // else expression
          elseExprDoc = path.call(print, 'children', childIdx)
        }
        childIdx++
      }

      // Check if then expression starts with something complex that needs its own line
      // Only nested if-expressions need special handling - let binary expressions handle their own breaks
      // Handle cases like "(\nif..." where paren is followed by newline
      const thenExprText = (children[1]?.text ?? '').replace(/^\s+/, '').replace(/^\(\s*/, '(')
      const thenStartsWithComplexExpr = thenExprText.startsWith('(if') || 
        thenExprText.startsWith('if')

      // Build then clause:
      // - Always keep "then" with condition using line (becomes space if fits)
      // - Complex expressions (nested if): indent the value on next line
      // - Simple expressions: keep "then VALUE" together
      const thenClause: Doc = thenStartsWithComplexExpr
        ? ['then', indent([line, thenExprDoc])]
        : ['then ', thenExprDoc]
      
      // For condition+then grouping, we want "if COND then" to stay together
      // even when then-value is complex. Use a separate group for condition+then keyword.
      const conditionThenKeyword: Doc = group(['if ', ...conditionParts, ' then'])

      // Build else clause similarly
      const elseClause: Doc = ['else ', elseExprDoc]

      // Centralized formatting:
      // Key insight: use line (not softline) between condition and then when condition is long
      // This ensures "if COND then" stays together for short conditions
      
      if (inContinuation) {
        // Already indented by parent - keep keywords aligned, no extra indent
        // Use inner group for condition+then keyword so they stay together when they fit
        // Then-value goes on next line if complex
        if (thenStartsWithComplexExpr) {
          return group([
            conditionThenKeyword,
            indent([line, thenExprDoc]),
            ...elseIfParts,
            line, elseClause
          ])
        }
        return group([
          group(['if ', ...conditionParts, line, thenClause]),
          ...elseIfParts,
          line, elseClause
        ])
      }

      if (midLine) {
        // Mid-line if (e.g., `name=if ...`) - indent continuation from the if keyword
        // Use inner group for condition+then keyword so they stay together when they fit
        // When inner group breaks, indent the then clause
        if (thenStartsWithComplexExpr) {
          return group([
            conditionThenKeyword,
            indent([
              line, thenExprDoc,
              ...elseIfParts,
              line, elseClause
            ])
          ])
        }
        return group([
          'if ', ...conditionParts,
          indent([
            group([line, thenClause]),
            ...elseIfParts,
            line, elseClause
          ])
        ])
      }

      // Top-level RHS - keywords (if, then, else) align at same level
      // Use inner group for condition+then keyword so they stay together when they fit
      if (thenStartsWithComplexExpr) {
        return group([
          conditionThenKeyword,
          indent([line, thenExprDoc]),
          ...elseIfParts,
          line, elseClause
        ])
      }
      return group([
        group(['if ', ...conditionParts, line, thenClause]),
        ...elseIfParts,
        line, elseClause
      ])
    }

    case 'else_if_clause': {
      const conditionParts: Doc[] = []
      let thenExprDoc: Doc = ''
      let seenCondition = false

      for (let i = 0; i < node.children.length; i++) {
        if (!seenCondition) {
          conditionParts.push(path.call(print, 'children', i))
          seenCondition = true
        } else {
          thenExprDoc = path.call(print, 'children', i)
        }
      }
      
      // Use line between condition and then - Prettier will keep together if fits
      // or break if line exceeds width
      return group([
        'elseif ', ...conditionParts, line,
        'then ', thenExprDoc
      ])
    }


    case 'simple_expression':
      return printChildren(path, print)

    case 'range_expression':
      return join(':', path.map(print, 'children'))

            case 'binary_expression': {

      // Extract operator from the gap between children in source text
      if (node.children.length === 2) {
        const leftChild = node.children[0]
        const rightChild = node.children[1]
        const operator = extractOperator(node.text ?? '', leftChild, rightChild)

        // Logical operators (and/or) - flatten SAME operator only
        // to avoid cascading indentation in conditions like:
        //   if a and b and c
        // Should become:
        //   if a and
        //     b and
        //     c
        // Not:
        //   if a and
        //     b and
        //       c
        // Note: 'and' and 'or' have different precedence, so we only
        // flatten the same operator (and with and, or with or)
        if (operator === 'and' || operator === 'or') {
          // Flatten same operator only
          const operands: Doc[] = []
          const ops: string[] = []

          const flattenLogical = (p: AstPath<ASTNode>): void => {
            const n = p.getValue()

            // Check if this is a binary_expression with the SAME logical operator
            if (n.type === 'binary_expression' && n.children?.length === 2) {
              const op = extractOperator(n.text ?? '', n.children[0], n.children[1])
              if (op === operator) {
                p.call(flattenLogical, 'children', 0)
                ops.push(op)
                p.call(flattenLogical, 'children', 1)
                return
              }
            }
            // Also handle simple_expression wrapper
            if (n.type === 'simple_expression' && n.children?.length === 1) {
              const child = n.children[0]
              if (child.type === 'binary_expression' && child.children?.length === 2) {
                const op = extractOperator(child.text ?? '', child.children[0], child.children[1])
                if (op === operator) {
                  p.call((innerPath) => {
                    innerPath.call(flattenLogical, 'children', 0)
                    ops.push(op)
                    innerPath.call(flattenLogical, 'children', 1)
                  }, 'children', 0)
                  return
                }
              }
            }
            // Base case - not same operator, print normally
            operands.push(print(p))
          }

          flattenLogical(path)

          if (ops.length === 0) {
            return operands[0]
          }

          // Build flat structure with sibling groups, same as arithmetic operators.
          // Each operator+operand pair is an independent group that decides
          // whether to break based on remaining space on the current line.
          // All continuations in the same flattened chain share the same indent level.
          const parts: Doc[] = [operands[0]]

          for (let i = 0; i < ops.length; i++) {
            // Use centralized handler for first operand, simple line for rest
            // This ensures only +1 indent level for the entire chain
            parts.push(' ', ops[i], i === 0 
              ? wrapContinuation(operands[i + 1], path)
              : group([line, operands[i + 1]]))
          }

          return parts
        }

        // Arithmetic operators: allow breaking after operator when line is too long
        // Includes additive (+, -) and multiplicative (*, /) operators
        // Exponent (^) is excluded as x^2 should stay together
        const additiveOperators = ['+', '-', '.+', '.-']
        const multiplicativeOperators = ['*', '/', '.*', './']
        const arithmeticOperators = [...additiveOperators, ...multiplicativeOperators]

        if (arithmeticOperators.includes(operator)) {
          // Flatten same-precedence arithmetic operators into a single structure.
          // This avoids nested groups that cause cascading indentation.
          const operands: Doc[] = []
          const ops: string[] = []

          // Helper to unwrap simple_expression to find binary_expression
          const unwrapToBinary = (n: ASTNode): ASTNode | null => {
            if (n.type === 'binary_expression') return n
            if (n.type === 'simple_expression' && n.children?.length === 1) {
              return unwrapToBinary(n.children[0])
            }
            return null
          }

          // Recursive flatten - collects all operands and operators
          const flatten = (p: AstPath<ASTNode>): void => {
            const n = p.getValue()

            // Check if this is a binary_expression (directly or wrapped in simple_expression)
            const binaryNode = unwrapToBinary(n)
            if (binaryNode && binaryNode.children?.length === 2) {
              const op = extractOperator(binaryNode.text ?? '', binaryNode.children[0], binaryNode.children[1])
              if (arithmeticOperators.includes(op)) {
                // Need to navigate to the actual binary_expression in the path
                if (n.type === 'simple_expression' && n.children?.length === 1) {
                  // Recurse through the simple_expression wrapper
                  p.call((innerPath) => {
                    const innerNode = innerPath.getValue()
                    if (innerNode.type === 'binary_expression') {
                      // Now recurse into left and right children
                      innerPath.call(flatten, 'children', 0)
                      ops.push(op)
                      innerPath.call(flatten, 'children', 1)
                    } else {
                      flatten(innerPath)
                    }
                  }, 'children', 0)
                  return
                } else if (n.type === 'binary_expression') {
                  // Direct binary_expression
                  p.call(flatten, 'children', 0)
                  ops.push(op)
                  p.call(flatten, 'children', 1)
                  return
                }
              }
            }
            // Base case - not an arithmetic binary_expression, print normally
            operands.push(print(p))
          }

          flatten(path)

          // Build the expression using FLAT sibling groups (not nested).
          // Similar to Prettier JS's binary expression handling, each
          // operator+operand pair is an independent group that decides
          // whether to break based on remaining space on the current line.
          //
          // Structure: [op0, ' +', group([line, op1]), ' +', group([line, op2])]
          //
          // Key insight: sibling groups are evaluated INDEPENDENTLY.
          // After a multi-line operand finishes, the next group checks if
          // its content fits on the REMAINING space of the current line.
          // This allows ")) + C" to stay on one line when there's room.
          //
          // Example: For "A + B + C" where B is multi-line:
          //   A + complex_expr *
          //     ((if x then 1 else 0) +
          //       (if y then 1 else 0)) + C
          // The " + C" fits on the last line of the parenthesized expression.

          if (ops.length === 0) {
            return operands[0]
          }

          // Build flat structure: first operand, then sibling groups for each subsequent
          // All continuations in the same flattened chain share the same indent level.
          const parts: Doc[] = [operands[0]]

          for (let i = 0; i < ops.length; i++) {
            // Use centralized handler for first operand, simple line for rest
            // This ensures only +1 indent level for the entire chain
            parts.push(' ', ops[i], i === 0
              ? wrapContinuation(operands[i + 1], path)
              : group([line, operands[i + 1]]))
          }

          return parts
        }

        // Short expressions and comparisons: stay inline
        return [
          path.call(print, 'children', 0),
          ' ', operator, ' ',
          path.call(print, 'children', 1)
        ]
      }

      // Fallback
      return printChildrenWithSpaces(path, print)
    }

    case 'unary_expression': {
      // Check for operator at start of text
      const text = node.text ?? ''
      const parts: Doc[] = []

      if (text.startsWith('not ')) {
        parts.push('not ')
      } else if (text.startsWith('.-')) {
        parts.push('.-')
      } else if (text.startsWith('.+')) {
        parts.push('.+')
      } else if (text.startsWith('-')) {
        parts.push('-')
      } else if (text.startsWith('+')) {
        parts.push('+')
      }

      for (let i = 0; i < node.children.length; i++) {
        parts.push(path.call(print, 'children', i))
      }
      return parts
    }

    case 'primary_expression':
      return printChildren(path, print)

    case 'end_expression':
      return 'end'

    case 'literal_expression':
    case 'string_literal_expression':
    case 'unsigned_integer_literal_expression':
    case 'unsigned_real_literal_expression':
      if (node.children.length === 0) {
        return node.text ?? ''
      }
      return printChildren(path, print)

    case 'logical_literal_expression':
      return node.text ?? ''

    case 'parenthesized_expression': {
      // Wrap in parens with indent for multi-line content
      // Content starts on same line as '(', breaks with indent if needed
      // The isInContinuationContext check prevents nested constructs from adding more indent
      const content = path.map(print, 'children')
      return group(['(', indent(content), ')'])
    }

    case 'output_expression_list':
      return join(', ', path.map(print, 'children'))

    case 'expression_list':
      return join(', ', path.map(print, 'children'))

    // ===========================================
    // Arrays
    // ===========================================
    case 'array_constructor': {
      const args = path.map(print, 'children')
      const inAnnotation = isInsideAnnotation(path)

      if (inAnnotation) {
        // Check if this is a coordinate/numerical array - keep compact
        if (isCoordinateArray(node)) {
          // Compact format: {1,2,3} or {{1,2},{3,4}}
          return ['{', join(',', args), '}']
        }

        // Check if this is a graphics array
        if (isGraphicsArray(path)) {
          // Graphics array: first primitive on same line, rest on new lines
          if (args.length === 0) return '{}'
          if (args.length === 1) return ['{', args[0], '}']

          // First primitive on same line as {, rest on new lines
          return [
            '{',
            args[0],
            ',',
            indent([hardline, join([',', hardline], args.slice(1))]),
            '}'
          ]
        }

        // Check if array contains graphical primitives
        const hasGraphicalPrimitives = node.children.some(child => {
          if (child.type === 'function_application') return isGraphicalPrimitive(child)
          // Check through expression wrappers
          if (child.type.includes('expression')) {
            const funcApp = child.children?.find(c => c.type === 'function_application')
            if (funcApp) return isGraphicalPrimitive(funcApp)
          }
          return false
        })

        if (hasGraphicalPrimitives) {
          // Array of graphical primitives - first on same line, rest on new lines
          if (args.length === 0) return '{}'
          if (args.length === 1) return ['{', args[0], '}']
          return [
            '{',
            args[0],
            ',',
            indent([hardline, join([',', hardline], args.slice(1))]),
            '}'
          ]
        }

        // Default for other arrays in annotations
        if (args.length === 0) return '{}'
        return group(['{', join([',', line], args), '}'])
      }

      return group([
        '{',
        indent([softline, join([',', line], args)]),
        softline,
        '}'
      ])
    }

    case 'array_arguments': {
      const args = path.map(print, 'children')
      const inAnnotation = isInsideAnnotation(path)

      if (inAnnotation) {
        // Check if this is coordinate data
        if (isCoordinateArray(node)) {
          return join(',', args)
        }

        // Check if this is inside a graphics array
        if (isGraphicsArray(path)) {
          // Graphics array elements: use hardline to force each primitive on its own line
          return join([',', hardline], args)
        }

        // Check if array contains graphical primitives
        const hasGraphicalPrimitives = node.children.some(child => {
          if (child.type === 'function_application') return isGraphicalPrimitive(child)
          if (child.type.includes('expression')) {
            const funcApp = child.children?.find(c => c.type === 'function_application')
            if (funcApp) return isGraphicalPrimitive(funcApp)
          }
          return false
        })

        if (hasGraphicalPrimitives) {
          // Use hardline to force breaks between graphical primitives
          return join([',', hardline], args)
        }

        // Default: comma-separated without spaces for compact arrays
        return join(',', args)
      }
      return join(', ', args)
    }

    case 'array_concatenation': {
      const rows = path.map(print, 'children')
      const inAnnotation = isInsideAnnotation(path)

      if (inAnnotation) {
        // In annotations, prefer compact formatting
        return group(['[', join('; ', rows), ']'])
      }

      return group([
        '[',
        indent([softline, join([';', line], rows)]),
        softline,
        ']'
      ])
    }

    case 'array_comprehension': {
      const parts: Doc[] = ['{']

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'for_indices') {
          parts.push(' for ', path.call(print, 'children', i))
        } else {
          parts.push(path.call(print, 'children', i))
        }
      }

      parts.push('}')
      return parts
    }

    case 'array_subscripts':
      return ['[', join(', ', path.map(print, 'children')), ']']

    case 'subscript':
      // Could be ':' or an expression
      if (node.text === ':') {
        return ':'
      }
      return printChildren(path, print)

    // ===========================================
    // Function calls
    // ===========================================
    case 'function_application': {
      const parts: Doc[] = []

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'component_reference' || child.type === 'name') {
          parts.push(path.call(print, 'children', i))
        } else if (child.type === 'function_call_args') {
          parts.push(path.call(print, 'children', i))
        }
      }
      return parts
    }

    case 'function_call_args': {
      if (node.children.length === 0) {
        return '()'
      }
      const args = path.map(print, 'children')
      const inAnnotation = isInsideAnnotation(path)
      
      // Check if we're directly inside a named_argument to avoid cumulative indent
      // named_argument already adds indent, so we shouldn't add more
      const isInNamedArgument = (() => {
        // Walk up parent chain looking for named_argument before hitting function_call_args boundary
        for (let i = 0; i < 10; i++) {
          const ancestor = path.getParentNode(i)
          if (!ancestor) break
          if (ancestor.type === 'named_argument') return true
          if (ancestor.type === 'function_call_args' && i > 0) break // Another function_call_args = nested call
          if (ancestor.type === 'declaration' || ancestor.type === 'component_declaration') break
        }
        return false
      })()

      if (inAnnotation) {
        // Get the parent to check what kind of function this is
        const parent = path.getParentNode()
        const funcName = parent ? getAnnotationElementName(parent) : null

        // Check if this is a graphical primitive - format with line breaks for each parameter
        // First param on same line as opening paren, rest indented on new lines
        if (parent && parent.type === 'function_application' && isGraphicalPrimitive(parent)) {
          // function_call_args children might be named_arguments or function_arguments
          // We need to extract the actual individual arguments
          const argsChild = node.children[0]
          if (argsChild && (argsChild.type === 'named_arguments' || argsChild.type === 'function_arguments')) {
            const individualArgs: Doc[] = []
            for (let i = 0; i < argsChild.children.length; i++) {
              individualArgs.push(path.call(print, 'children', 0, 'children', i))
            }
            if (individualArgs.length === 0) return '()'
            if (individualArgs.length === 1) return ['(', individualArgs[0], ')']
            // First param on same line, rest indented on new lines
            // Closing paren on same line as last element
            return [
              '(',
              individualArgs[0],
              ',',
              indent([hardline, join([',', hardline], individualArgs.slice(1)), ')']),
            ]
          }
          // Fallback if structure is different
          if (args.length === 0) return '()'
          if (args.length === 1) return ['(', args[0], ')']
          // Closing paren on same line as last element
          return [
            '(',
            args[0],
            ',',
            indent([hardline, join([',', hardline], args.slice(1)), ')']),
          ]
        }

        // Check if this is choices() - each choice on new line
        // First choice on same line as opening paren
        if (funcName === 'choices') {
          if (args.length === 0) return '()'
          if (args.length === 1) return ['(', args[0], ')']
          // First choice on same line, rest on new lines
          // Closing paren on same line as last element
          return [
            '(',
            args[0],
            ',',
            indent([hardline, join([',', hardline], args.slice(1)), ')']),
          ]
        }

        // Check if this is a first-level annotation attribute (Icon, Diagram, Placement, etc.)
        const isFirstLevel = isFirstLevelAnnotationAttribute(path)

        if (isFirstLevel) {
          // First-level attributes like Icon(...), Placement(...)
          // First arg on same line, rest indented on new lines
          if (args.length === 0) return '()'
          if (args.length === 1) return ['(', args[0], ')']
          // Closing paren on same line as last element
          return [
            '(',
            args[0],
            ',',
            indent([hardline, join([',', hardline], args.slice(1)), ')']),
          ]
        }

        // Other nested calls - try to keep compact but allow breaks
        if (args.length === 0) return '()'
        if (args.length === 1) {
          return group(['(', args[0], ')'])
        }
        // Closing paren on same line as last element
        return group([
          '(',
          indent([softline, join([',', line], args), ')']),
        ])
      }

      // Check if this is a simple single-argument function call
      const firstChild = node.children[0]
      const isSingleArg = firstChild &&
        (firstChild.type === 'function_arguments' || firstChild.type === 'named_arguments') &&
        firstChild.children.length === 1

      if (isSingleArg) {
        // Simple single-argument call - keep on one line
        return group(['(', args[0], ')'])
      }

      // First arg on same line, rest indented, closing paren on same line as last element
      // Need to extract individual arguments from function_arguments/named_arguments
      const argsChild = node.children[0]
      if (argsChild && (argsChild.type === 'named_arguments' || argsChild.type === 'function_arguments')) {
        const individualArgs: Doc[] = []
        for (let i = 0; i < argsChild.children.length; i++) {
          individualArgs.push(path.call(print, 'children', 0, 'children', i))
        }
        if (individualArgs.length === 0) return '()'
        if (individualArgs.length === 1) return group(['(', individualArgs[0], ')'])
        // For regular function calls (not in annotations):
        // - Try to fit everything on one line
        // - If it doesn't fit, break after opening paren and indent all args
        // - Closing paren on same line as last arg
        // - If inside named_argument, skip indent (parent already provides it)
        if (isInNamedArgument) {
          return group([
            '(',
            softline,
            join([',', line], individualArgs),
            ')',
          ])
        }
        return group([
          '(',
          indent([
            softline,
            join([',', line], individualArgs),
          ]),
          ')',
        ])
      }

      // Fallback - same pattern
      if (isInNamedArgument) {
        return group([
          '(',
          softline,
          join([',', line], args),
          ')',
        ])
      }
      return group([
        '(',
        indent([
          softline,
          join([',', line], args),
        ]),
        ')',
      ])
    }

    case 'function_arguments': {
      const inAnnotation = isInsideAnnotation(path)
      if (inAnnotation) {
        const args = path.map(print, 'children')

        // Check if we're inside choices - each choice on its own line
        if (isInsideChoicesAnnotation(path)) {
          return join([',', line], args)
        }

        // Check if inside a graphical primitive - parameters one per line
        if (isInsideGraphicalPrimitive(path)) {
          return join([',', line], args)
        }

        // Default: use fill to pack arguments
        const fillItems: Doc[] = []
        for (let i = 0; i < args.length; i++) {
          if (i > 0) {
            fillItems.push([',', line])
          }
          fillItems.push(args[i])
        }
        return fill(fillItems)
      }
      return join([',', line], path.map(print, 'children'))
    }

    case 'named_arguments': {
      const inAnnotation = isInsideAnnotation(path)
      if (inAnnotation) {
        const args = path.map(print, 'children')

        // Check if we're inside choices - each choice on its own line
        if (isInsideChoicesAnnotation(path)) {
          return join([',', line], args)
        }

        // Check if inside a graphical primitive - parameters one per line
        if (isInsideGraphicalPrimitive(path)) {
          return join([',', line], args)
        }

        // Use fill to pack as many arguments as possible on each line
        const fillItems: Doc[] = []
        for (let i = 0; i < args.length; i++) {
          if (i > 0) {
            fillItems.push([',', line])
          }
          fillItems.push(args[i])
        }
        return fill(fillItems)
      }
      return join([',', line], path.map(print, 'children'))
    }

    case 'named_argument': {
      const parts: Doc[] = []

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'IDENT') {
          parts.push(child.text ?? '', '=')
        } else {
          // Add indent for continuation lines when value breaks
          parts.push(indent(path.call(print, 'children', i)))
        }
      }
      return parts
    }

    case 'function_partial_application':
      return ['function ', ...printChildrenWithSpaces(path, print)]

    // ===========================================
    // Names and references
    // ===========================================
    case 'name': {
      const parts: Doc[] = []

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'name') {
          if (parts.length > 0) parts.push('.')
          parts.push(path.call(print, 'children', i))
        } else if (child.type === 'IDENT') {
          if (parts.length > 0) parts.push('.')
          parts.push(child.text ?? '')
        } else if (child.text === '.') {
          // global reference prefix
          parts.push('.')
        }
      }
      return parts
    }

    case 'component_reference': {
      const parts: Doc[] = []

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'IDENT') {
          if (parts.length > 0 && !endsWithDot(parts)) {
            parts.push('.')
          }
          parts.push(child.text ?? '')
        } else if (child.type === 'array_subscripts') {
          parts.push(path.call(print, 'children', i))
        } else if (child.type === 'component_reference') {
          if (parts.length > 0) parts.push('.')
          parts.push(path.call(print, 'children', i))
        } else if (child.text === '.') {
          parts.push('.')
        }
      }
      return parts
    }

    case 'type_specifier':
      return printChildren(path, print)

    // ===========================================
    // Annotations and descriptions
    // ===========================================
    case 'description_string':
      return printChildren(path, print)

    case 'annotation_clause': {
      // Only add semicolon for class-level annotations (parent is long_class_specifier)
      // For inline annotations (in named_element, component_declaration, connect_clause, etc.),
      // the parent adds the semicolon
      const parent = path.getParentNode()
      const isClassLevel = parent?.type === 'long_class_specifier' || parent?.type === 'short_class_specifier'
      if (isClassLevel) {
        return ['annotation', ...printChildren(path, print), ';']
      }
      return ['annotation', ...printChildren(path, print)]
    }

    // ===========================================
    // External functions
    // ===========================================
    case 'external_clause': {
      const parts: Doc[] = ['external']

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'language_specification') {
          parts.push(' ', path.call(print, 'children', i))
        } else if (child.type === 'external_function') {
          parts.push(' ', path.call(print, 'children', i))
        } else if (child.type === 'annotation_clause') {
          parts.push(' ', path.call(print, 'children', i))
        }
      }
      parts.push(';')
      return parts
    }

    case 'language_specification':
      return printChildren(path, print)

    case 'external_function':
      return printChildrenWithSpaces(path, print)

    // ===========================================
    // Default fallback
    // ===========================================
    default:
      // For any unhandled node type, print children or text
      // If no children, this is a leaf/terminal node - use its text
      if (!node.children || node.children.length === 0) {
        return node.text ?? ''
      }
      return printChildrenWithSpaces(path, print)
  }
}

// ===========================================
// Helper functions
// ===========================================

/**
 * Print all children without separators
 */
function printChildren(
  path: AstPath<ASTNode>,
  print: (path: AstPath<ASTNode>) => Doc
): Doc[] {
  return path.map(print, 'children')
}

/**
 * Print all children with space separators
 */
function printChildrenWithSpaces(
  path: AstPath<ASTNode>,
  print: (path: AstPath<ASTNode>) => Doc
): Doc[] {
  const node = path.getValue()
  const parts: Doc[] = []

  for (let i = 0; i < node.children.length; i++) {
    if (i > 0) {
      parts.push(' ')
    }
    parts.push(path.call(print, 'children', i))
  }

  return parts
}

/**
 * Extract prefix keywords (parameter, final, etc.) from element node text
 */
function extractElementPrefix(node: ASTNode): string {
  const text = node.text ?? ''

  // Get the start position of the first child
  const firstChild = node.children[0]
  if (!firstChild) return ''

  const startRow = node.range.start.row
  const startCol = node.range.start.column
  const childStartRow = firstChild.range.start.row
  const childStartCol = firstChild.range.start.column

  // If child starts at same position as node, no prefix
  if (startRow === childStartRow && startCol === childStartCol) {
    return ''
  }

  // Extract the prefix text from the node
  const lines = text.split('\n')
  let prefixText = ''

  if (startRow === childStartRow) {
    // Same line - extract from startCol to childStartCol
    prefixText = lines[0].substring(0, childStartCol - startCol).trim()
  } else {
    // Different lines - take the first line up to newline
    prefixText = lines[0].trim()
  }

  return prefixText
}

/**
 * Extract prefix keywords (parameter, constant, final, etc.) from component_clause
 * These appear before the type_specifier
 */
function extractComponentClausePrefix(node: ASTNode): string {
  const text = node.text ?? ''

  // Find the type_specifier child
  const typeSpec = node.children.find(c => c.type === 'type_specifier')
  if (!typeSpec) return ''

  const startRow = node.range.start.row
  const startCol = node.range.start.column
  const typeStartRow = typeSpec.range.start.row
  const typeStartCol = typeSpec.range.start.column

  // If type_specifier starts at same position as component_clause, no prefix
  if (startRow === typeStartRow && startCol === typeStartCol) {
    return ''
  }

  // Extract the prefix text
  const lines = text.split('\n')
  let prefixText = ''

  if (startRow === typeStartRow) {
    // Same line - extract from start to type_specifier start
    prefixText = lines[0].substring(0, typeStartCol - startCol).trim()
  } else {
    // Different lines - take the first line
    prefixText = lines[0].trim()
  }

  return prefixText
}

/**
 * Extract modification prefix (each, final) from element_modification node
 */
function extractModificationPrefix(node: ASTNode): string {
  const text = node.text ?? ''
  const firstChild = node.children[0]
  if (!firstChild) return ''

  const startCol = node.range.start.column
  const childStartCol = firstChild.range.start.column

  if (node.range.start.row === firstChild.range.start.row && childStartCol > startCol) {
    const lines = text.split('\n')
    const prefixText = lines[0].substring(0, childStartCol - startCol).trim()
    return prefixText
  }

  return ''
}

/**
 * Extract redeclare prefix (redeclare, final, each) from redeclaration node
 */
function extractRedeclarePrefix(node: ASTNode): string {
  const text = node.text ?? ''
  const firstChild = node.children[0]
  if (!firstChild) return 'redeclare'

  const startCol = node.range.start.column
  const childStartCol = firstChild.range.start.column

  if (node.range.start.row === firstChild.range.start.row && childStartCol > startCol) {
    const lines = text.split('\n')
    const prefixText = lines[0].substring(0, childStartCol - startCol).trim()
    if (prefixText) return prefixText
  }

  return 'redeclare'
}

/**
 * Extract operator from binary expression text by finding what's between operands
 */
function extractOperator(fullText: string, leftChild: ASTNode, rightChild: ASTNode): string {
  // Calculate positions relative to fullText
  const leftText = leftChild.text ?? ''
  const rightText = rightChild.text ?? ''

  // The operator is what's between leftText and rightText in fullText
  const leftEnd = fullText.indexOf(leftText) + leftText.length
  const rightStart = fullText.lastIndexOf(rightText)

  if (leftEnd >= 0 && rightStart > leftEnd) {
    const operatorText = fullText.substring(leftEnd, rightStart).trim()
    if (operatorText) {
      return operatorText
    }
  }

  // Fallback: try to detect common operators in the full text
  const operators = ['==', '<>', '<=', '>=', '.+', '.-', '.*', './', '.^',
                     'and', 'or', '<', '>', '+', '-', '*', '/', '^', '=']
  for (const op of operators) {
    if (fullText.includes(` ${op} `) || fullText.includes(op)) {
      return op
    }
  }

  return '?'  // Unknown operator
}

/**
 * Check if Doc array ends with a dot
 */
function endsWithDot(parts: Doc[]): boolean {
  const last = parts[parts.length - 1]
  return typeof last === 'string' && last.endsWith('.')
}
