/**
 * Prettier printer for Modelica AST
 * Handles all node types from the tree-sitter-modelica grammar
 */
import { doc } from 'prettier';
const { builders } = doc;
const { group, indent, line, softline, hardline, join, fill } = builders;
// Graphical primitive names that should prefer compact formatting
// Graphical primitives that should not have newline after opening paren
const GRAPHICAL_PRIMITIVE_NAMES = new Set([
    'Line', 'Polygon', 'Rectangle', 'Ellipse', 'Text', 'Bitmap', 'Placement'
]);
const GRAPHICAL_PRIMITIVES = new Set([
    'Line', 'Polygon', 'Rectangle', 'Ellipse', 'Text', 'Bitmap',
    'Placement', 'Transformation', 'IconMap', 'DiagramMap',
    'transformation', 'extent', 'origin', 'points', 'color', 'lineColor',
    'fillColor', 'pattern', 'fillPattern', 'lineThickness', 'rotation'
]);
/**
 * Check if we're inside an annotation clause by walking up the path
 */
function isInsideAnnotation(path) {
    let depth = 0;
    try {
        while (true) {
            const node = path.getParentNode(depth);
            if (!node)
                break;
            if (node.type === 'annotation_clause')
                return true;
            depth++;
            if (depth > 50)
                break; // safety limit
        }
    }
    catch {
        // path.getParentNode can throw if we go too far
    }
    return false;
}
/**
 * Check if this element_modification is a graphical primitive
 */
function isGraphicalPrimitive(node) {
    const nameChild = node.children.find(c => c.type === 'name');
    const modName = nameChild?.text ?? '';
    return GRAPHICAL_PRIMITIVES.has(modName);
}
/**
 * Check if the parent context is a graphical primitive (Line, Polygon, etc.)
 * or an annotation clause - these should not have newline after opening paren
 */
function isGraphicalPrimitiveContext(path) {
    try {
        // Check parent chain for element_modification with graphical primitive name
        // or for annotation_clause
        const parent = path.getParentNode(0);
        if (!parent)
            return false;
        // Direct parent is annotation_clause
        if (parent.type === 'annotation_clause')
            return true;
        // Parent is modification inside element_modification
        if (parent.type === 'modification') {
            const grandparent = path.getParentNode(1);
            if (grandparent?.type === 'element_modification') {
                const nameChild = grandparent.children.find(c => c.type === 'name');
                const modName = nameChild?.text ?? '';
                if (GRAPHICAL_PRIMITIVE_NAMES.has(modName))
                    return true;
            }
        }
        // Parent is element_modification directly
        if (parent.type === 'element_modification') {
            const nameChild = parent.children.find(c => c.type === 'name');
            const modName = nameChild?.text ?? '';
            if (GRAPHICAL_PRIMITIVE_NAMES.has(modName))
                return true;
        }
    }
    catch {
        // Ignore errors from path navigation
    }
    return false;
}
/**
 * Main print function for Modelica AST
 */
export const printModelica = (path, __options, print) => {
    const node = path.getValue();
    if (!node) {
        return '';
    }
    // Route to appropriate handler based on node type
    switch (node.type) {
        // ===========================================
        // Terminal nodes - print text directly
        // ===========================================
        case 'IDENT':
        case 'STRING':
        case 'UNSIGNED_INTEGER':
        case 'UNSIGNED_REAL':
            return node.text ?? '';
        case 'BLOCK_COMMENT':
        case 'comment':
            return node.text ?? '';
        // ===========================================
        // Top-level structure
        // ===========================================
        case 'stored_definitions':
            return [join(hardline, path.map(print, 'children')), hardline];
        case 'stored_definition':
            return join(hardline, path.map(print, 'children'));
        case 'within_clause': {
            const parts = ['within '];
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'name') {
                    parts.push(path.call(print, 'children', i));
                }
            }
            parts.push(';');
            return parts;
        }
        // ===========================================
        // Class definitions
        // ===========================================
        case 'class_definition': {
            const parts = [];
            for (let i = 0; i < node.children.length; i++) {
                if (i > 0)
                    parts.push(' ');
                parts.push(path.call(print, 'children', i));
            }
            return parts;
        }
        case 'class_prefixes': {
            // This node contains keywords like "model", "package", "final", "partial", etc.
            // Use the text directly as it contains all the keywords
            return node.text ?? '';
        }
        case 'long_class_specifier': {
            const parts = [];
            let className = '';
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'IDENT' && !className) {
                    className = child.text ?? '';
                    parts.push(className);
                }
                else if (child.type === 'description_string') {
                    parts.push(indent([line, path.call(print, 'children', i)]));
                }
                else if (child.type === 'element_list' ||
                    child.type === 'public_element_list' ||
                    child.type === 'protected_element_list') {
                    parts.push(indent([line, path.call(print, 'children', i)]));
                }
                else if (child.type === 'equation_section' ||
                    child.type === 'algorithm_section') {
                    parts.push(hardline, path.call(print, 'children', i));
                }
                else if (child.type === 'annotation_clause') {
                    parts.push(hardline, path.call(print, 'children', i));
                }
                else if (child.type === 'external_clause') {
                    parts.push(hardline, path.call(print, 'children', i));
                }
            }
            parts.push(hardline, 'end ', className, ';');
            return group(parts);
        }
        case 'short_class_specifier': {
            // Format: IDENT = type_specifier [class_modification] [description_string]
            const parts = [];
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'IDENT') {
                    parts.push(child.text ?? '');
                }
                else if (child.type === 'base_prefix') {
                    parts.push(path.call(print, 'children', i), ' ');
                }
                else if (child.type === 'type_specifier') {
                    parts.push('=', path.call(print, 'children', i));
                }
                else if (child.type === 'class_modification') {
                    parts.push(path.call(print, 'children', i));
                }
                else if (child.type === 'description_string') {
                    parts.push(' ', path.call(print, 'children', i));
                }
            }
            return parts;
        }
        case 'derivative_class_specifier':
        case 'enumeration_class_specifier':
        case 'extends_class_specifier':
            return printChildrenWithSpaces(path, print);
        case 'enum_list':
            return join(', ', path.map(print, 'children'));
        case 'enumeration_literal':
            return printChildrenWithSpaces(path, print);
        case 'base_prefix':
            return node.text ?? '';
        // ===========================================
        // Element lists
        // ===========================================
        case 'element_list':
            return join(hardline, path.map(print, 'children'));
        case 'public_element_list':
            return ['public', indent([line, join(hardline, path.map(print, 'children'))])];
        case 'protected_element_list':
            return ['protected', indent([line, join(hardline, path.map(print, 'children'))])];
        // ===========================================
        // Elements
        // ===========================================
        case 'named_element': {
            // Extract prefixes (parameter, final, etc.) from node.text
            const parts = [];
            const prefix = extractElementPrefix(node);
            if (prefix) {
                parts.push(prefix, ' ');
            }
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'component_clause') {
                    parts.push(path.call(print, 'children', i));
                    parts.push(';');
                }
                else if (child.type === 'class_definition') {
                    parts.push(path.call(print, 'children', i));
                }
            }
            return parts;
        }
        case 'import_clause':
            return ['import ', ...printChildrenWithSpaces(path, print), ';'];
        case 'import_list':
            return join(', ', path.map(print, 'children'));
        case 'extends_clause': {
            const parts = ['extends '];
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'type_specifier') {
                    parts.push(path.call(print, 'children', i));
                }
                else if (child.type === 'class_modification') {
                    parts.push(path.call(print, 'children', i));
                }
                else if (child.type === 'annotation_clause') {
                    parts.push(' ', path.call(print, 'children', i));
                }
            }
            parts.push(';');
            return group(parts);
        }
        case 'constraining_clause':
            return ['constrainedby ', ...printChildrenWithSpaces(path, print)];
        // ===========================================
        // Components
        // ===========================================
        case 'component_clause': {
            const parts = [];
            // Extract prefix keywords (parameter, constant, etc.) before type_specifier
            const prefix = extractComponentClausePrefix(node);
            if (prefix) {
                parts.push(prefix, ' ');
            }
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'type_specifier') {
                    parts.push(path.call(print, 'children', i), ' ');
                }
                else if (child.type === 'component_list') {
                    parts.push(path.call(print, 'children', i));
                }
                else if (child.type === 'array_subscripts') {
                    parts.push(path.call(print, 'children', i), ' ');
                }
            }
            // Don't add semicolon here - it's added by named_element or left off for redeclarations
            return parts;
        }
        case 'component_list':
            return join([',', line], path.map(print, 'children'));
        case 'component_declaration': {
            const parts = [];
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'declaration') {
                    parts.push(path.call(print, 'children', i));
                }
                else if (child.type === 'condition_attribute') {
                    parts.push(' ', path.call(print, 'children', i));
                }
                else if (child.type === 'description_string') {
                    // Break line before description string, indented
                    parts.push(indent([line, path.call(print, 'children', i)]));
                }
                else if (child.type === 'annotation_clause') {
                    // Break line before annotation, indented
                    parts.push(indent([line, path.call(print, 'children', i)]));
                }
                else if (child.type === 'comment') {
                    parts.push(' ', path.call(print, 'children', i));
                }
            }
            return group(parts);
        }
        case 'condition_attribute': {
            const parts = ['if '];
            for (let i = 0; i < node.children.length; i++) {
                parts.push(path.call(print, 'children', i));
            }
            return parts;
        }
        case 'declaration': {
            const parts = [];
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'IDENT') {
                    parts.push(child.text ?? '');
                }
                else if (child.type === 'array_subscripts') {
                    parts.push(path.call(print, 'children', i));
                }
                else if (child.type === 'modification') {
                    parts.push(path.call(print, 'children', i));
                }
            }
            return parts;
        }
        // ===========================================
        // Modifications
        // ===========================================
        case 'modification': {
            const parts = [];
            // Check if parent is a declaration (top-level assignment) vs element_modification (attribute binding)
            // Top-level assignments get spaces around =, attribute bindings don't
            const parent = path.getParentNode();
            const isTopLevelAssignment = parent?.type === 'declaration';
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'class_modification') {
                    parts.push(path.call(print, 'children', i));
                }
                else if (child.type === 'expression' || child.type === 'simple_expression') {
                    if (isTopLevelAssignment) {
                        // For top-level assignments: "= " then expression
                        // Use group with line to break after = if line exceeds printWidth
                        parts.push(group([
                            ' =',
                            indent([line, path.call(print, 'children', i)])
                        ]));
                    }
                    else {
                        // For attribute bindings: no space around =
                        // Wrap expression in indent so any internal line breaks are indented
                        parts.push('=', indent(path.call(print, 'children', i)));
                    }
                }
            }
            return parts;
        }
        case 'class_modification': {
            // Format arguments on multiple lines if complex
            if (node.children.length === 0) {
                return '()';
            }
            const args = path.map(print, 'children');
            const inAnnotation = isInsideAnnotation(path);
            if (inAnnotation) {
                // For graphical primitives, use fill to pack attributes
                const isGraphicalContext = isGraphicalPrimitiveContext(path);
                if (isGraphicalContext) {
                    const fillItems = [];
                    for (let i = 0; i < args.length; i++) {
                        if (i > 0) {
                            fillItems.push([',', line]);
                        }
                        fillItems.push(args[i]);
                    }
                    // No softline after '(' - content starts on same line
                    // No softline before ')' - closing paren stays on last content line
                    return group([
                        '(',
                        indent(fill(fillItems)),
                        ')'
                    ]);
                }
                // Check if this is a top-level annotation class_modification
                const parent = path.getParentNode();
                const isTopLevelAnnotation = parent?.type === 'annotation_clause';
                // For all annotation class_modifications (top-level and nested),
                // use fill to pack attributes on same line until max length.
                // Only indent once at the top level to avoid cumulative indentation
                // when multiple opening constructs are packed on same line.
                const fillItems = [];
                for (let i = 0; i < args.length; i++) {
                    if (i > 0) {
                        fillItems.push([',', line]);
                    }
                    fillItems.push(args[i]);
                }
                if (isTopLevelAnnotation) {
                    // Top-level annotation: add indent for line breaks
                    return group([
                        '(',
                        indent(fill(fillItems)),
                        ')'
                    ]);
                }
                else {
                    // Nested class_modifications (like transformation inside Placement):
                    // Don't add additional indent - just use fill directly
                    // This prevents cumulative indentation when constructs are nested
                    return group([
                        '(',
                        fill(fillItems),
                        ')'
                    ]);
                }
            }
            // Normal formatting with line breaks
            // No softline before ')' - closing paren on same line as last attribute
            return group([
                '(',
                indent([softline, join([',', line], args)]),
                ')'
            ]);
        }
        case 'argument_list': {
            const inAnnotation = isInsideAnnotation(path);
            if (inAnnotation) {
                // Use fill to pack as many arguments as possible on each line
                const args = path.map(print, 'children');
                const fillItems = [];
                for (let i = 0; i < args.length; i++) {
                    if (i > 0) {
                        fillItems.push([',', line]);
                    }
                    fillItems.push(args[i]);
                }
                return fill(fillItems);
            }
            return join([',', line], path.map(print, 'children'));
        }
        case 'element_modification': {
            const parts = [];
            // Check for 'each' and 'final' prefixes
            const prefix = extractModificationPrefix(node);
            if (prefix) {
                parts.push(prefix, ' ');
            }
            // Check if this is a graphical primitive inside an annotation
            const inAnnotation = isInsideAnnotation(path);
            const isGraphical = isGraphicalPrimitive(node);
            if (inAnnotation && isGraphical) {
                // For graphical primitives in annotations, use normalized compact text
                // only if it fits within reasonable line length
                const text = node.text ?? '';
                const normalized = normalizeGraphicalText(text);
                if (normalized.length <= 70) {
                    return prefix ? [prefix, ' ', normalized] : normalized;
                }
                // Otherwise fall through to normal formatting with indentation
            }
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'name') {
                    parts.push(path.call(print, 'children', i));
                }
                else if (child.type === 'modification') {
                    parts.push(path.call(print, 'children', i));
                }
                else if (child.type === 'description_string') {
                    parts.push(' ', path.call(print, 'children', i));
                }
            }
            return parts;
        }
        case 'element_replaceable':
            return printChildrenWithSpaces(path, print);
        case 'class_redeclaration': {
            // Extract 'redeclare' and optionally 'final', 'each' from node.text
            const prefix = extractRedeclarePrefix(node);
            const parts = [prefix, ' '];
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'short_class_definition' || child.type === 'class_definition') {
                    parts.push(path.call(print, 'children', i));
                }
            }
            return parts;
        }
        case 'component_redeclaration': {
            const prefix = extractRedeclarePrefix(node);
            const parts = [prefix, ' '];
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'component_clause') {
                    parts.push(path.call(print, 'children', i));
                }
            }
            return parts;
        }
        case 'short_class_definition': {
            const parts = [];
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'class_prefixes') {
                    parts.push(path.call(print, 'children', i), ' ');
                }
                else if (child.type === 'short_class_specifier') {
                    parts.push(path.call(print, 'children', i));
                }
            }
            return parts;
        }
        // ===========================================
        // Equations
        // ===========================================
        case 'equation_section': {
            const parts = [];
            // Check if this is an initial equation section by looking at the node text
            const isInitial = (node.text ?? '').trimStart().startsWith('initial');
            const content = [];
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'equation_list') {
                    content.push(path.call(print, 'children', i));
                }
                else if (child.type === 'comment') {
                    // Comments before the equation list - add them in order
                    content.push(path.call(print, 'children', i));
                }
            }
            parts.push(isInitial ? 'initial equation' : 'equation');
            if (content.length > 0) {
                parts.push(indent([line, join(hardline, content)]));
            }
            return parts;
        }
        case 'equation_list':
            return join(hardline, path.map(print, 'children'));
        case 'simple_equation': {
            // Handle equation with two expressions and = between them
            const exprChildren = node.children.filter(c => c.type === 'simple_expression' || c.type === 'expression');
            if (exprChildren.length === 2) {
                const result = [];
                let firstExprDone = false;
                for (let i = 0; i < node.children.length; i++) {
                    const child = node.children[i];
                    if ((child.type === 'simple_expression' || child.type === 'expression') && !firstExprDone) {
                        result.push(path.call(print, 'children', i), ' = ');
                        firstExprDone = true;
                    }
                    else if (child.type === 'simple_expression' || child.type === 'expression') {
                        result.push(path.call(print, 'children', i));
                    }
                    else if (child.type === 'comment') {
                        result.push(' ', path.call(print, 'children', i));
                    }
                }
                result.push(';');
                return group(result);
            }
            // Fallback for single expression equations
            const parts = [];
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'simple_expression' || child.type === 'expression') {
                    parts.push(path.call(print, 'children', i));
                }
                else if (child.type === 'comment') {
                    parts.push(' ', path.call(print, 'children', i));
                }
            }
            parts.push(';');
            return group(parts);
        }
        case 'connect_clause': {
            const parts = ['connect('];
            const args = [];
            let hasAnnotation = false;
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'component_reference') {
                    args.push(path.call(print, 'children', i));
                }
                else if (child.type === 'annotation_clause') {
                    hasAnnotation = true;
                    parts.push(join(', ', args), ')');
                    // Break line before annotation
                    parts.push(line, path.call(print, 'children', i), ';');
                }
            }
            if (!hasAnnotation) {
                parts.push(join(', ', args), ');');
            }
            return group(parts);
        }
        case 'for_equation':
        case 'for_statement': {
            const parts = ['for '];
            const body = [];
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'for_indices') {
                    parts.push(path.call(print, 'children', i), ' loop');
                }
                else if (child.type === 'equation_list' || child.type === 'statement_list') {
                    body.push(path.call(print, 'children', i));
                }
            }
            parts.push(indent([line, ...body]));
            parts.push(hardline, 'end for;');
            return group(parts);
        }
        case 'for_indices':
            return join(', ', path.map(print, 'children'));
        case 'for_index': {
            const parts = [];
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'IDENT') {
                    parts.push(child.text ?? '');
                }
                else if (child.type === 'expression' || child.type === 'simple_expression') {
                    parts.push(' in ', path.call(print, 'children', i));
                }
            }
            return parts;
        }
        case 'if_equation':
        case 'if_statement': {
            const parts = ['if '];
            let inElse = false;
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'expression' && !inElse) {
                    parts.push(path.call(print, 'children', i), ' then');
                }
                else if (child.type === 'equation_list' || child.type === 'statement_list') {
                    parts.push(indent([line, path.call(print, 'children', i)]));
                }
                else if (child.type === 'else_if_equation_clause_list' ||
                    child.type === 'else_if_statement_clause_list') {
                    parts.push(hardline, path.call(print, 'children', i));
                }
                else if (child.text === 'else') {
                    inElse = true;
                    parts.push(hardline, 'else');
                }
            }
            parts.push(hardline, 'end if;');
            return group(parts);
        }
        case 'else_if_equation_clause_list':
        case 'else_if_statement_clause_list':
            return join(hardline, path.map(print, 'children'));
        case 'else_if_equation_clause':
        case 'else_if_statement_clause': {
            const parts = ['elseif '];
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'expression') {
                    parts.push(path.call(print, 'children', i), ' then');
                }
                else if (child.type === 'equation_list' || child.type === 'statement_list') {
                    parts.push(indent([line, path.call(print, 'children', i)]));
                }
            }
            return parts;
        }
        case 'when_equation':
        case 'when_statement': {
            const parts = ['when '];
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'expression') {
                    parts.push(path.call(print, 'children', i), ' then');
                }
                else if (child.type === 'equation_list' || child.type === 'statement_list') {
                    parts.push(indent([line, path.call(print, 'children', i)]));
                }
                else if (child.type === 'else_when_equation_clause_list' ||
                    child.type === 'else_when_statement_clause_list') {
                    parts.push(hardline, path.call(print, 'children', i));
                }
            }
            parts.push(hardline, 'end when;');
            return group(parts);
        }
        case 'else_when_equation_clause_list':
        case 'else_when_statement_clause_list':
            return join(hardline, path.map(print, 'children'));
        case 'else_when_equation_clause':
        case 'else_when_statement_clause': {
            const parts = ['elsewhen '];
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'expression') {
                    parts.push(path.call(print, 'children', i), ' then');
                }
                else if (child.type === 'equation_list' || child.type === 'statement_list') {
                    parts.push(indent([line, path.call(print, 'children', i)]));
                }
            }
            return parts;
        }
        case 'function_application_equation':
        case 'function_application_statement':
            return [...printChildren(path, print), ';'];
        // ===========================================
        // Algorithms / Statements
        // ===========================================
        case 'algorithm_section': {
            const parts = [];
            // Check if this is an initial algorithm section by looking at the node text
            const isInitial = (node.text ?? '').trimStart().startsWith('initial');
            const content = [];
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'statement_list') {
                    content.push(path.call(print, 'children', i));
                }
                else if (child.type === 'comment') {
                    content.push(path.call(print, 'children', i));
                }
            }
            parts.push(isInitial ? 'initial algorithm' : 'algorithm');
            if (content.length > 0) {
                parts.push(indent([line, join(hardline, content)]));
            }
            return parts;
        }
        case 'statement_list':
            return join(hardline, path.map(print, 'children'));
        case 'assignment_statement': {
            const parts = [];
            let hasRef = false;
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'component_reference') {
                    parts.push(path.call(print, 'children', i));
                    hasRef = true;
                }
                else if (child.type === 'expression' || child.type === 'simple_expression') {
                    if (hasRef) {
                        parts.push(' := ');
                    }
                    parts.push(path.call(print, 'children', i));
                }
                else if (child.type === 'comment') {
                    parts.push(' ', path.call(print, 'children', i));
                }
            }
            parts.push(';');
            return group(parts);
        }
        case 'break_statement':
            return 'break;';
        case 'return_statement':
            return 'return;';
        case 'while_statement': {
            const parts = ['while '];
            const body = [];
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'expression') {
                    parts.push(path.call(print, 'children', i), ' loop');
                }
                else if (child.type === 'statement_list') {
                    body.push(path.call(print, 'children', i));
                }
            }
            parts.push(indent([line, ...body]));
            parts.push(hardline, 'end while;');
            return group(parts);
        }
        case 'multiple_output_function_application_statement': {
            const parts = ['('];
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'output_expression_list') {
                    parts.push(path.call(print, 'children', i));
                }
                else if (child.type === 'component_reference' || child.type === 'function_application') {
                    parts.push(') := ', path.call(print, 'children', i));
                }
            }
            parts.push(';');
            return parts;
        }
        // ===========================================
        // Expressions
        // ===========================================
        case 'expression':
            return printChildren(path, print);
        case 'if_expression': {
            const children = node.children;
            let childIdx = 0;
            // Check if this is a simple if-then-else that can fit on one line
            const nodeText = node.text ?? '';
            const hasElseIf = children.some(c => c.type === 'else_if_clause');
            const isSimple = !hasElseIf && nodeText.length < 80;
            if (isSimple) {
                // Format simple if-then-else as flat - no internal breaks
                const condition = children[0] ? path.call(print, 'children', 0) : '';
                const thenExpr = children[1] ? path.call(print, 'children', 1) : '';
                const elseExpr = children[2] ? path.call(print, 'children', 2) : '';
                return ['if ', condition, ' then ', thenExpr, ' else ', elseExpr];
            }
            // Collect all parts for proper grouping and line breaking
            const conditionParts = [];
            const thenParts = [];
            const elseParts = [];
            // First child is condition
            if (children[childIdx]) {
                conditionParts.push(path.call(print, 'children', childIdx));
                childIdx++;
            }
            // Then expression (after 'then')
            if (children[childIdx]) {
                thenParts.push(path.call(print, 'children', childIdx));
                childIdx++;
            }
            // Handle elseif clauses and else expression
            while (childIdx < children.length) {
                const child = children[childIdx];
                if (child.type === 'else_if_clause') {
                    elseParts.push(line, path.call(print, 'children', childIdx));
                }
                else {
                    // else expression
                    elseParts.push(line, 'else ', path.call(print, 'children', childIdx));
                }
                childIdx++;
            }
            // Format with proper line breaking support
            // then/else aligned with if keyword (no indent)
            return group([
                'if ', ...conditionParts,
                line,
                group([
                    'then ', ...thenParts,
                    ...elseParts
                ])
            ]);
        }
        case 'else_if_clause': {
            const conditionParts = [];
            const thenParts = [];
            let seenCondition = false;
            for (let i = 0; i < node.children.length; i++) {
                if (!seenCondition) {
                    conditionParts.push(path.call(print, 'children', i));
                    seenCondition = true;
                }
                else {
                    thenParts.push(path.call(print, 'children', i));
                }
            }
            return group([
                'elseif ',
                ...conditionParts,
                line,
                'then ',
                ...thenParts
            ]);
        }
        case 'simple_expression':
            return printChildren(path, print);
        case 'range_expression':
            return join(':', path.map(print, 'children'));
        case 'binary_expression': {
            // Extract operator from the gap between children in source text
            if (node.children.length === 2) {
                const leftChild = node.children[0];
                const rightChild = node.children[1];
                const operator = extractOperator(node.text ?? '', leftChild, rightChild);
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
                    const operands = [];
                    const ops = [];
                    const flattenLogical = (p) => {
                        const n = p.getValue();
                        // Check if this is a binary_expression with the SAME logical operator
                        if (n.type === 'binary_expression' && n.children?.length === 2) {
                            const op = extractOperator(n.text ?? '', n.children[0], n.children[1]);
                            if (op === operator) {
                                p.call(flattenLogical, 'children', 0);
                                ops.push(op);
                                p.call(flattenLogical, 'children', 1);
                                return;
                            }
                        }
                        // Also handle simple_expression wrapper
                        if (n.type === 'simple_expression' && n.children?.length === 1) {
                            const child = n.children[0];
                            if (child.type === 'binary_expression' && child.children?.length === 2) {
                                const op = extractOperator(child.text ?? '', child.children[0], child.children[1]);
                                if (op === operator) {
                                    p.call((innerPath) => {
                                        innerPath.call(flattenLogical, 'children', 0);
                                        ops.push(op);
                                        innerPath.call(flattenLogical, 'children', 1);
                                    }, 'children', 0);
                                    return;
                                }
                            }
                        }
                        // Base case - not same operator, print normally
                        operands.push(print(p));
                    };
                    flattenLogical(path);
                    if (ops.length === 0) {
                        return operands[0];
                    }
                    // Build flat structure with sibling groups, same as arithmetic operators.
                    // Each operator+operand pair is an independent group that decides
                    // whether to break based on remaining space on the current line.
                    // This avoids cascading indentation when mixed and/or operators nest.
                    const parts = [operands[0]];
                    for (let i = 0; i < ops.length; i++) {
                        parts.push(' ', ops[i], group([line, operands[i + 1]]));
                    }
                    return parts;
                }
                // Arithmetic operators: allow breaking after operator when line is too long
                // Includes additive (+, -) and multiplicative (*, /) operators
                // Exponent (^) is excluded as x^2 should stay together
                const additiveOperators = ['+', '-', '.+', '.-'];
                const multiplicativeOperators = ['*', '/', '.*', './'];
                const arithmeticOperators = [...additiveOperators, ...multiplicativeOperators];
                if (arithmeticOperators.includes(operator)) {
                    // Flatten same-precedence arithmetic operators into a single structure.
                    // This avoids nested groups that cause cascading indentation.
                    const operands = [];
                    const ops = [];
                    // Helper to unwrap simple_expression to find binary_expression
                    const unwrapToBinary = (n) => {
                        if (n.type === 'binary_expression')
                            return n;
                        if (n.type === 'simple_expression' && n.children?.length === 1) {
                            return unwrapToBinary(n.children[0]);
                        }
                        return null;
                    };
                    // Recursive flatten - collects all operands and operators
                    const flatten = (p) => {
                        const n = p.getValue();
                        // Check if this is a binary_expression (directly or wrapped in simple_expression)
                        const binaryNode = unwrapToBinary(n);
                        if (binaryNode && binaryNode.children?.length === 2) {
                            const op = extractOperator(binaryNode.text ?? '', binaryNode.children[0], binaryNode.children[1]);
                            if (arithmeticOperators.includes(op)) {
                                // Need to navigate to the actual binary_expression in the path
                                if (n.type === 'simple_expression' && n.children?.length === 1) {
                                    // Recurse through the simple_expression wrapper
                                    p.call((innerPath) => {
                                        const innerNode = innerPath.getValue();
                                        if (innerNode.type === 'binary_expression') {
                                            // Now recurse into left and right children
                                            innerPath.call(flatten, 'children', 0);
                                            ops.push(op);
                                            innerPath.call(flatten, 'children', 1);
                                        }
                                        else {
                                            flatten(innerPath);
                                        }
                                    }, 'children', 0);
                                    return;
                                }
                                else if (n.type === 'binary_expression') {
                                    // Direct binary_expression
                                    p.call(flatten, 'children', 0);
                                    ops.push(op);
                                    p.call(flatten, 'children', 1);
                                    return;
                                }
                            }
                        }
                        // Base case - not an arithmetic binary_expression, print normally
                        operands.push(print(p));
                    };
                    flatten(path);
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
                        return operands[0];
                    }
                    // Build flat structure: first operand, then sibling groups for each subsequent
                    const parts = [operands[0]];
                    for (let i = 0; i < ops.length; i++) {
                        // Each operator+operand pair is wrapped in its own group.
                        // The group independently decides whether to break based on
                        // whether its content fits on the remaining line space.
                        parts.push(' ', ops[i], group([line, operands[i + 1]]));
                    }
                    return parts;
                }
                // Short expressions and comparisons: stay inline
                return [
                    path.call(print, 'children', 0),
                    ' ', operator, ' ',
                    path.call(print, 'children', 1)
                ];
            }
            // Fallback
            return printChildrenWithSpaces(path, print);
        }
        case 'unary_expression': {
            // Check for operator at start of text
            const text = node.text ?? '';
            const parts = [];
            if (text.startsWith('not ')) {
                parts.push('not ');
            }
            else if (text.startsWith('.-')) {
                parts.push('.-');
            }
            else if (text.startsWith('.+')) {
                parts.push('.+');
            }
            else if (text.startsWith('-')) {
                parts.push('-');
            }
            else if (text.startsWith('+')) {
                parts.push('+');
            }
            for (let i = 0; i < node.children.length; i++) {
                parts.push(path.call(print, 'children', i));
            }
            return parts;
        }
        case 'primary_expression':
            return printChildren(path, print);
        case 'end_expression':
            return 'end';
        case 'literal_expression':
        case 'string_literal_expression':
        case 'unsigned_integer_literal_expression':
        case 'unsigned_real_literal_expression':
            if (node.children.length === 0) {
                return node.text ?? '';
            }
            return printChildren(path, print);
        case 'logical_literal_expression':
            return node.text ?? '';
        case 'parenthesized_expression': {
            // Wrap in parens - use indent for line breaks in content
            // Don't create a new group - let parent control breaking
            const content = path.map(print, 'children');
            return ['(', indent(content), ')'];
        }
        case 'output_expression_list':
            return join(', ', path.map(print, 'children'));
        case 'expression_list':
            return join(', ', path.map(print, 'children'));
        // ===========================================
        // Arrays
        // ===========================================
        case 'array_constructor': {
            const args = path.map(print, 'children');
            const inAnnotation = isInsideAnnotation(path);
            if (inAnnotation) {
                // In annotations, prefer compact array formatting
                return group(['{', join(', ', args), '}']);
            }
            return group([
                '{',
                indent([softline, join([',', line], args)]),
                softline,
                '}'
            ]);
        }
        case 'array_arguments':
            return join(', ', path.map(print, 'children'));
        case 'array_concatenation': {
            const rows = path.map(print, 'children');
            const inAnnotation = isInsideAnnotation(path);
            if (inAnnotation) {
                // In annotations, prefer compact formatting
                return group(['[', join('; ', rows), ']']);
            }
            return group([
                '[',
                indent([softline, join([';', line], rows)]),
                softline,
                ']'
            ]);
        }
        case 'array_comprehension': {
            const parts = ['{'];
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'for_indices') {
                    parts.push(' for ', path.call(print, 'children', i));
                }
                else {
                    parts.push(path.call(print, 'children', i));
                }
            }
            parts.push('}');
            return parts;
        }
        case 'array_subscripts':
            return ['[', join(', ', path.map(print, 'children')), ']'];
        case 'subscript':
            // Could be ':' or an expression
            if (node.text === ':') {
                return ':';
            }
            return printChildren(path, print);
        // ===========================================
        // Function calls
        // ===========================================
        case 'function_application': {
            // Check if this is a graphical primitive in an annotation
            const inAnnotation = isInsideAnnotation(path);
            if (inAnnotation) {
                // Get function name from first child
                const funcRef = node.children.find(c => c.type === 'component_reference' || c.type === 'name');
                const funcName = funcRef?.text ?? '';
                if (GRAPHICAL_PRIMITIVES.has(funcName)) {
                    // For graphical primitives, use normalized compact text
                    // only if it fits within reasonable line length
                    const text = node.text ?? '';
                    const normalized = normalizeGraphicalText(text);
                    if (normalized.length <= 70) {
                        return normalized;
                    }
                    // Otherwise fall through to normal formatting with indentation
                }
            }
            const parts = [];
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'component_reference' || child.type === 'name') {
                    parts.push(path.call(print, 'children', i));
                }
                else if (child.type === 'function_call_args') {
                    parts.push(path.call(print, 'children', i));
                }
            }
            return parts;
        }
        case 'function_call_args': {
            if (node.children.length === 0) {
                return '()';
            }
            const args = path.map(print, 'children');
            const inAnnotation = isInsideAnnotation(path);
            if (inAnnotation) {
                // In annotations, use fill to pack as many attributes as possible per line
                const fillItems = [];
                for (let i = 0; i < args.length; i++) {
                    if (i > 0) {
                        fillItems.push([',', line]);
                    }
                    fillItems.push(args[i]);
                }
                return group([
                    '(',
                    indent([softline, fill(fillItems)]),
                    ')'
                ]);
            }
            // Check if this is a simple single-argument function call
            // function_call_args has children like function_arguments or named_arguments
            // We need to check if those have only one actual argument
            const firstChild = node.children[0];
            const isSingleArg = firstChild &&
                (firstChild.type === 'function_arguments' || firstChild.type === 'named_arguments') &&
                firstChild.children.length === 1;
            if (isSingleArg) {
                // Simple single-argument call - keep on one line
                return group(['(', args[0], ')']);
            }
            return group([
                '(',
                indent([softline, join([',', line], args)]),
                ')'
            ]);
        }
        case 'function_arguments': {
            const inAnnotation = isInsideAnnotation(path);
            if (inAnnotation) {
                // Use fill to pack as many arguments as possible on each line
                const args = path.map(print, 'children');
                const fillItems = [];
                for (let i = 0; i < args.length; i++) {
                    if (i > 0) {
                        fillItems.push([',', line]);
                    }
                    fillItems.push(args[i]);
                }
                return fill(fillItems);
            }
            return join([',', line], path.map(print, 'children'));
        }
        case 'named_arguments': {
            const inAnnotation = isInsideAnnotation(path);
            if (inAnnotation) {
                // Use fill to pack as many arguments as possible on each line
                const args = path.map(print, 'children');
                const fillItems = [];
                for (let i = 0; i < args.length; i++) {
                    if (i > 0) {
                        fillItems.push([',', line]);
                    }
                    fillItems.push(args[i]);
                }
                return fill(fillItems);
            }
            return join([',', line], path.map(print, 'children'));
        }
        case 'named_argument': {
            const parts = [];
            const inAnnotation = isInsideAnnotation(path);
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'IDENT') {
                    parts.push(child.text ?? '', '=');
                }
                else {
                    // In annotations, don't add extra indent - top-level annotation already handles it
                    // In non-annotation contexts, wrap expression in indent for continuation lines
                    if (inAnnotation) {
                        parts.push(path.call(print, 'children', i));
                    }
                    else {
                        parts.push(indent(path.call(print, 'children', i)));
                    }
                }
            }
            return parts;
        }
        case 'function_partial_application':
            return ['function ', ...printChildrenWithSpaces(path, print)];
        // ===========================================
        // Names and references
        // ===========================================
        case 'name': {
            const parts = [];
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'name') {
                    if (parts.length > 0)
                        parts.push('.');
                    parts.push(path.call(print, 'children', i));
                }
                else if (child.type === 'IDENT') {
                    if (parts.length > 0)
                        parts.push('.');
                    parts.push(child.text ?? '');
                }
                else if (child.text === '.') {
                    // global reference prefix
                    parts.push('.');
                }
            }
            return parts;
        }
        case 'component_reference': {
            const parts = [];
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'IDENT') {
                    if (parts.length > 0 && !endsWithDot(parts)) {
                        parts.push('.');
                    }
                    parts.push(child.text ?? '');
                }
                else if (child.type === 'array_subscripts') {
                    parts.push(path.call(print, 'children', i));
                }
                else if (child.type === 'component_reference') {
                    if (parts.length > 0)
                        parts.push('.');
                    parts.push(path.call(print, 'children', i));
                }
                else if (child.text === '.') {
                    parts.push('.');
                }
            }
            return parts;
        }
        case 'type_specifier':
            return printChildren(path, print);
        // ===========================================
        // Annotations and descriptions
        // ===========================================
        case 'description_string':
            return printChildren(path, print);
        case 'annotation_clause':
            return ['annotation', ...printChildren(path, print)];
        // ===========================================
        // External functions
        // ===========================================
        case 'external_clause': {
            const parts = ['external'];
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type === 'language_specification') {
                    parts.push(' ', path.call(print, 'children', i));
                }
                else if (child.type === 'external_function') {
                    parts.push(' ', path.call(print, 'children', i));
                }
                else if (child.type === 'annotation_clause') {
                    parts.push(' ', path.call(print, 'children', i));
                }
            }
            parts.push(';');
            return parts;
        }
        case 'language_specification':
            return printChildren(path, print);
        case 'external_function':
            return printChildrenWithSpaces(path, print);
        // ===========================================
        // Default fallback
        // ===========================================
        default:
            // For any unhandled node type, print children or text
            // If no children, this is a leaf/terminal node - use its text
            if (!node.children || node.children.length === 0) {
                return node.text ?? '';
            }
            return printChildrenWithSpaces(path, print);
    }
};
// ===========================================
// Helper functions
// ===========================================
/**
 * Normalize whitespace in graphical primitive text for compact output
 * Preserves structure but removes unnecessary whitespace
 */
function normalizeGraphicalText(text) {
    return text
        .replace(/\s+/g, ' ') // collapse whitespace
        .replace(/\(\s+/g, '(') // remove space after (
        .replace(/\s+\)/g, ')') // remove space before )
        .replace(/\{\s+/g, '{') // remove space after {
        .replace(/\s+\}/g, '}') // remove space before }
        .replace(/,\s*/g, ', ') // normalize comma spacing
        .replace(/=\s+/g, '=') // remove space after =
        .replace(/\s+=/g, '=') // remove space before =
        .trim();
}
/**
 * Print all children without separators
 */
function printChildren(path, print) {
    return path.map(print, 'children');
}
/**
 * Print all children with space separators
 */
function printChildrenWithSpaces(path, print) {
    const node = path.getValue();
    const parts = [];
    for (let i = 0; i < node.children.length; i++) {
        if (i > 0) {
            parts.push(' ');
        }
        parts.push(path.call(print, 'children', i));
    }
    return parts;
}
/**
 * Extract prefix keywords (parameter, final, etc.) from element node text
 */
function extractElementPrefix(node) {
    const text = node.text ?? '';
    // Get the start position of the first child
    const firstChild = node.children[0];
    if (!firstChild)
        return '';
    const startRow = node.range.start.row;
    const startCol = node.range.start.column;
    const childStartRow = firstChild.range.start.row;
    const childStartCol = firstChild.range.start.column;
    // If child starts at same position as node, no prefix
    if (startRow === childStartRow && startCol === childStartCol) {
        return '';
    }
    // Extract the prefix text from the node
    const lines = text.split('\n');
    let prefixText = '';
    if (startRow === childStartRow) {
        // Same line - extract from startCol to childStartCol
        prefixText = lines[0].substring(0, childStartCol - startCol).trim();
    }
    else {
        // Different lines - take the first line up to newline
        prefixText = lines[0].trim();
    }
    return prefixText;
}
/**
 * Extract prefix keywords (parameter, constant, final, etc.) from component_clause
 * These appear before the type_specifier
 */
function extractComponentClausePrefix(node) {
    const text = node.text ?? '';
    // Find the type_specifier child
    const typeSpec = node.children.find(c => c.type === 'type_specifier');
    if (!typeSpec)
        return '';
    const startRow = node.range.start.row;
    const startCol = node.range.start.column;
    const typeStartRow = typeSpec.range.start.row;
    const typeStartCol = typeSpec.range.start.column;
    // If type_specifier starts at same position as component_clause, no prefix
    if (startRow === typeStartRow && startCol === typeStartCol) {
        return '';
    }
    // Extract the prefix text
    const lines = text.split('\n');
    let prefixText = '';
    if (startRow === typeStartRow) {
        // Same line - extract from start to type_specifier start
        prefixText = lines[0].substring(0, typeStartCol - startCol).trim();
    }
    else {
        // Different lines - take the first line
        prefixText = lines[0].trim();
    }
    return prefixText;
}
/**
 * Extract modification prefix (each, final) from element_modification node
 */
function extractModificationPrefix(node) {
    const text = node.text ?? '';
    const firstChild = node.children[0];
    if (!firstChild)
        return '';
    const startCol = node.range.start.column;
    const childStartCol = firstChild.range.start.column;
    if (node.range.start.row === firstChild.range.start.row && childStartCol > startCol) {
        const lines = text.split('\n');
        const prefixText = lines[0].substring(0, childStartCol - startCol).trim();
        return prefixText;
    }
    return '';
}
/**
 * Extract redeclare prefix (redeclare, final, each) from redeclaration node
 */
function extractRedeclarePrefix(node) {
    const text = node.text ?? '';
    const firstChild = node.children[0];
    if (!firstChild)
        return 'redeclare';
    const startCol = node.range.start.column;
    const childStartCol = firstChild.range.start.column;
    if (node.range.start.row === firstChild.range.start.row && childStartCol > startCol) {
        const lines = text.split('\n');
        const prefixText = lines[0].substring(0, childStartCol - startCol).trim();
        if (prefixText)
            return prefixText;
    }
    return 'redeclare';
}
/**
 * Extract operator from binary expression text by finding what's between operands
 */
function extractOperator(fullText, leftChild, rightChild) {
    // Calculate positions relative to fullText
    const leftText = leftChild.text ?? '';
    const rightText = rightChild.text ?? '';
    // The operator is what's between leftText and rightText in fullText
    const leftEnd = fullText.indexOf(leftText) + leftText.length;
    const rightStart = fullText.lastIndexOf(rightText);
    if (leftEnd >= 0 && rightStart > leftEnd) {
        const operatorText = fullText.substring(leftEnd, rightStart).trim();
        if (operatorText) {
            return operatorText;
        }
    }
    // Fallback: try to detect common operators in the full text
    const operators = ['==', '<>', '<=', '>=', '.+', '.-', '.*', './', '.^',
        'and', 'or', '<', '>', '+', '-', '*', '/', '^', '='];
    for (const op of operators) {
        if (fullText.includes(` ${op} `) || fullText.includes(op)) {
            return op;
        }
    }
    return '?'; // Unknown operator
}
/**
 * Check if Doc array ends with a dot
 */
function endsWithDot(parts) {
    const last = parts[parts.length - 1];
    return typeof last === 'string' && last.endsWith('.');
}
//# sourceMappingURL=printer.js.map