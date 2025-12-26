/**
 * Tree-sitter parser wrapper for Modelica
 * Uses tree-sitter CLI to parse Modelica source code
 */
/**
 * Position in source code
 */
export interface Position {
    row: number;
    column: number;
}
/**
 * Range in source code
 */
export interface Range {
    start: Position;
    end: Position;
}
/**
 * AST Node from tree-sitter
 */
export interface ASTNode {
    type: string;
    text?: string;
    range: Range;
    children: ASTNode[];
    isError: boolean;
    isMissing: boolean;
    fieldName?: string;
}
/**
 * Parse result
 */
export interface ParseResult {
    rootNode: ASTNode;
    hasErrors: boolean;
    errorCount: number;
    missingCount: number;
}
/**
 * Parse Modelica source code using tree-sitter CLI
 * @param sourceCode The Modelica source code to parse
 * @returns ParseResult with AST and error information
 */
export declare function parse(sourceCode: string, debug?: boolean): ParseResult;
/**
 * Parse Modelica file using tree-sitter CLI
 * @param filePath Path to the Modelica file
 * @returns ParseResult with AST and error information
 */
export declare function parseFile(filePath: string): ParseResult;
/**
 * Walk the AST and call visitor for each node
 */
export declare function walk(node: ASTNode, visitor: (node: ASTNode, parent: ASTNode | null) => void, parent?: ASTNode | null): void;
/**
 * Find all nodes of a specific type
 */
export declare function findNodesByType(node: ASTNode, type: string): ASTNode[];
/**
 * Find the deepest node at a given position
 */
export declare function findNodeAtPosition(node: ASTNode, row: number, column: number): ASTNode | null;
/**
 * Get the text content of a node (for leaf nodes like identifiers)
 */
export declare function getNodeText(node: ASTNode): string;
/**
 * Check if the parser is available
 */
export declare function isParserAvailable(): boolean;
/**
 * Get tree-sitter version
 */
export declare function getParserVersion(): string | null;
//# sourceMappingURL=parser.d.ts.map