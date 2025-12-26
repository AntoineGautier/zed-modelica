/**
 * Prettier Plugin for Modelica
 * Uses tree-sitter CLI for parsing
 */
import type { Parser, Printer, Plugin, SupportLanguage, SupportOption } from 'prettier';
import { ASTNode } from './parser.js';
declare const languages: SupportLanguage[];
declare const parsers: Record<string, Parser>;
declare const printers: Record<string, Printer<ASTNode>>;
declare const options: Record<string, SupportOption>;
declare const plugin: Plugin<ASTNode>;
export default plugin;
export { languages, parsers, printers, options };
//# sourceMappingURL=index.d.ts.map