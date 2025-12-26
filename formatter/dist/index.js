/**
 * Prettier Plugin for Modelica
 * Uses tree-sitter CLI for parsing
 */
import { parse as parseModelica } from './parser.js';
import { printModelica } from './printer.js';
// Language definition
const languages = [
    {
        name: 'Modelica',
        parsers: ['modelica'],
        extensions: ['.mo'],
        vscodeLanguageIds: ['modelica'],
    },
];
// Parser definition
const parsers = {
    modelica: {
        parse(text) {
            const result = parseModelica(text);
            return result.rootNode;
        },
        astFormat: 'modelica-ast',
        locStart(node) {
            // Calculate byte offset from row/column
            // This is an approximation - proper implementation would track offsets during parsing
            return node.range.start.row * 1000 + node.range.start.column;
        },
        locEnd(node) {
            return node.range.end.row * 1000 + node.range.end.column;
        },
    },
};
// Printer definition
const printers = {
    'modelica-ast': {
        print: printModelica,
    },
};
// Plugin options
const options = {
    modelicaIndentSize: {
        type: 'int',
        category: 'Modelica',
        default: 2,
        description: 'Number of spaces per indentation level for Modelica code.',
    },
};
// Export the plugin
const plugin = {
    languages,
    parsers,
    printers,
    options,
};
export default plugin;
export { languages, parsers, printers, options };
//# sourceMappingURL=index.js.map