/**
 * Tree-sitter parser wrapper for Modelica
 * Uses tree-sitter CLI to parse Modelica source code
 */

import { spawnSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Path to the grammar directory (relative to this file in src/)
const GRAMMAR_DIR = path.resolve(__dirname, '../../grammars/modelica')

/**
 * Position in source code
 */
export interface Position {
  row: number
  column: number
}

/**
 * Range in source code
 */
export interface Range {
  start: Position
  end: Position
}

/**
 * AST Node from tree-sitter
 */
export interface ASTNode {
  type: string
  text?: string
  range: Range
  children: ASTNode[]
  isError: boolean
  isMissing: boolean
  fieldName?: string
}

/**
 * Parse result
 */
export interface ParseResult {
  rootNode: ASTNode
  hasErrors: boolean
  errorCount: number
  missingCount: number
}

/**
 * Parse Modelica source code using tree-sitter CLI
 * @param sourceCode The Modelica source code to parse
 * @returns ParseResult with AST and error information
 */
export function parse(sourceCode: string, debug: boolean = false): ParseResult {
  // Write source to a temp file (tree-sitter CLI doesn't work well with stdin)
  const tmpDir = os.tmpdir()
  const tmpFile = path.join(tmpDir, `modelica-parse-${Date.now()}-${Math.random().toString(36).slice(2)}.mo`)
  
  try {
    fs.writeFileSync(tmpFile, sourceCode, 'utf8')
    
    const result = spawnSync('npx', ['tree-sitter', 'parse', tmpFile], {
      cwd: GRAMMAR_DIR,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
    })

    if (result.error) {
      throw new Error(`Failed to run tree-sitter: ${result.error.message}`)
    }

    const sexp = result.stdout

  if (debug) {
    console.log('[DEBUG] S-expression length:', sexp.length)
    console.log('[DEBUG] S-expression first 500 chars:', sexp.substring(0, 500))
  }

    // Parse the S-expression into an AST
    const rootNode = parseSexp(sexp, sourceCode, debug)

    // Count errors
    const { errorCount, missingCount } = countErrors(rootNode)

    return {
      rootNode,
      hasErrors: errorCount > 0 || missingCount > 0,
      errorCount,
      missingCount,
    }
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(tmpFile)
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Parse Modelica file using tree-sitter CLI
 * @param filePath Path to the Modelica file
 * @returns ParseResult with AST and error information
 */
export function parseFile(filePath: string): ParseResult {
  const absolutePath = path.resolve(filePath)
  const sourceCode = fs.readFileSync(absolutePath, 'utf8')

  const result = spawnSync('npx', ['tree-sitter', 'parse', absolutePath], {
    cwd: GRAMMAR_DIR,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  })

  if (result.error) {
    throw new Error(`Failed to run tree-sitter: ${result.error.message}`)
  }

  const sexp = result.stdout
  const rootNode = parseSexp(sexp, sourceCode)
  const { errorCount, missingCount } = countErrors(rootNode)

  return {
    rootNode,
    hasErrors: errorCount > 0 || missingCount > 0,
    errorCount,
    missingCount,
  }
}

/**
 * Parse tree-sitter S-expression output into an AST
 */
function parseSexp(sexp: string, sourceCode: string, debug: boolean = false): ASTNode {
  const tokens = tokenize(sexp)
  let pos = 0

  if (debug) {
    console.log('[DEBUG] Token count:', tokens.length)
    console.log('[DEBUG] First 50 tokens:', tokens.slice(0, 50))
  }

  function parseNode(): ASTNode | null {
    skipWhitespace()

    if (pos >= tokens.length) return null

    // Expect opening paren
    if (tokens[pos] !== '(') return null
    pos++

    skipWhitespace()

    // Get node type (might have field name prefix)
    let fieldName: string | undefined
    let nodeType = tokens[pos++]

    // Check for field: prefix
    if (tokens[pos] === ':') {
      fieldName = nodeType
      pos++ // skip ':'
      skipWhitespace()
      nodeType = tokens[pos++]
    }

    skipWhitespace()

    // Parse range [row, col] - [row, col]
    const range = parseRange()

    skipWhitespace()

    // Parse children
    const children: ASTNode[] = []
    while (pos < tokens.length && tokens[pos] !== ')') {
      skipWhitespace()
      if (tokens[pos] === ')') break
      if (tokens[pos] === '(') {
        const child = parseNode()
        if (child) {
          children.push(child)
        }
      } else {
        // Skip non-paren tokens that aren't part of a child node
        pos++
      }
      skipWhitespace()
    }

    // Expect closing paren
    if (tokens[pos] === ')') {
      pos++
    }

    const isError = nodeType === 'ERROR'
    const isMissing = nodeType.startsWith('MISSING')

    // Extract text from source code
    const text = extractText(range, sourceCode)

    return {
      type: nodeType,
      text,
      range,
      children,
      isError,
      isMissing,
      fieldName,
    }
  }

  function skipWhitespace() {
    while (pos < tokens.length && tokens[pos] === ' ') {
      pos++
    }
  }

  function parseRange(): Range {
    // Format: [row, col] - [row, col]
    const start: Position = { row: 0, column: 0 }
    const end: Position = { row: 0, column: 0 }

    if (tokens[pos] === '[') {
      pos++ // skip '['
      start.row = parseInt(tokens[pos++], 10)
      pos++ // skip ','
      skipWhitespace()
      start.column = parseInt(tokens[pos++], 10)
      pos++ // skip ']'
      skipWhitespace()
      pos++ // skip '-'
      skipWhitespace()
      pos++ // skip '['
      end.row = parseInt(tokens[pos++], 10)
      pos++ // skip ','
      skipWhitespace()
      end.column = parseInt(tokens[pos++], 10)
      pos++ // skip ']'
    }

    return { start, end }
  }

  const root = parseNode()

  if (!root) {
    // Return empty root if parsing failed
    return {
      type: 'stored_definitions',
      range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
      children: [],
      isError: false,
      isMissing: false,
    }
  }

  return root
}

/**
 * Tokenize S-expression string
 */
function tokenize(sexp: string): string[] {
  const tokens: string[] = []
  let i = 0

  while (i < sexp.length) {
    const char = sexp[i]

    if (char === '(' || char === ')' || char === '[' || char === ']' || char === ',' || char === '-' || char === ':') {
      tokens.push(char)
      i++
    } else if (char === ' ' || char === '\n' || char === '\r' || char === '\t') {
      // Collapse whitespace
      while (i < sexp.length && /\s/.test(sexp[i])) {
        i++
      }
      tokens.push(' ')
    } else if (char === '"') {
      // Quoted string
      let str = ''
      i++ // skip opening quote
      while (i < sexp.length && sexp[i] !== '"') {
        if (sexp[i] === '\\' && i + 1 < sexp.length) {
          str += sexp[i + 1]
          i += 2
        } else {
          str += sexp[i]
          i++
        }
      }
      i++ // skip closing quote
      tokens.push(str)
    } else {
      // Identifier or number
      let token = ''
      while (i < sexp.length && !/[\s()\[\],:"-]/.test(sexp[i])) {
        token += sexp[i]
        i++
      }
      if (token) {
        tokens.push(token)
      }
    }
  }

  return tokens
}

/**
 * Extract text from source code given a range
 */
function extractText(range: Range, sourceCode: string): string {
  const lines = sourceCode.split('\n')
  const { start, end } = range

  if (start.row === end.row) {
    // Single line
    const line = lines[start.row] || ''
    return line.substring(start.column, end.column)
  }

  // Multi-line
  const result: string[] = []

  // First line
  if (lines[start.row]) {
    result.push(lines[start.row].substring(start.column))
  }

  // Middle lines
  for (let i = start.row + 1; i < end.row; i++) {
    if (lines[i] !== undefined) {
      result.push(lines[i])
    }
  }

  // Last line
  if (lines[end.row]) {
    result.push(lines[end.row].substring(0, end.column))
  }

  return result.join('\n')
}

/**
 * Count error and missing nodes in AST
 */
function countErrors(node: ASTNode): { errorCount: number; missingCount: number } {
  let errorCount = 0
  let missingCount = 0

  function traverse(n: ASTNode) {
    if (n.isError) errorCount++
    if (n.isMissing) missingCount++
    for (const child of n.children) {
      traverse(child)
    }
  }

  traverse(node)
  return { errorCount, missingCount }
}

/**
 * Walk the AST and call visitor for each node
 */
export function walk(node: ASTNode, visitor: (node: ASTNode, parent: ASTNode | null) => void, parent: ASTNode | null = null): void {
  visitor(node, parent)
  for (const child of node.children) {
    walk(child, visitor, node)
  }
}

/**
 * Find all nodes of a specific type
 */
export function findNodesByType(node: ASTNode, type: string): ASTNode[] {
  const results: ASTNode[] = []
  walk(node, (n) => {
    if (n.type === type) {
      results.push(n)
    }
  })
  return results
}

/**
 * Find the deepest node at a given position
 */
export function findNodeAtPosition(node: ASTNode, row: number, column: number): ASTNode | null {
  const { start, end } = node.range

  // Check if position is within this node
  const afterStart = row > start.row || (row === start.row && column >= start.column)
  const beforeEnd = row < end.row || (row === end.row && column <= end.column)

  if (!afterStart || !beforeEnd) {
    return null
  }

  // Check children for more specific match
  for (const child of node.children) {
    const found = findNodeAtPosition(child, row, column)
    if (found) {
      return found
    }
  }

  // No child matched, return this node
  return node
}

/**
 * Get the text content of a node (for leaf nodes like identifiers)
 */
export function getNodeText(node: ASTNode): string {
  return node.text || ''
}

/**
 * Check if the parser is available
 */
export function isParserAvailable(): boolean {
  try {
    const result = spawnSync('npx', ['tree-sitter', '--version'], {
      encoding: 'utf8',
      timeout: 5000,
    })
    return result.status === 0
  } catch {
    return false
  }
}

/**
 * Get tree-sitter version
 */
export function getParserVersion(): string | null {
  try {
    const result = spawnSync('npx', ['tree-sitter', '--version'], {
      encoding: 'utf8',
      timeout: 5000,
    })
    return result.stdout?.trim() || null
  } catch {
    return null
  }
}