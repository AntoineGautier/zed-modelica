/**
 * Prettier printer for Modelica AST
 * Handles all node types from the tree-sitter-modelica grammar
 */
import type { Printer } from 'prettier';
import type { ASTNode } from './parser.js';
/**
 * Main print function for Modelica AST
 */
export declare const printModelica: Printer<ASTNode>['print'];
//# sourceMappingURL=printer.d.ts.map