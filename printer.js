const prettier = require("prettier");
const { doc } = prettier;
const {
  group,
  indent,
  softline,
  line,
  hardline,
  join,
  indentIfBreak,
} = doc.builders;

// ============================================================================
// AST Traversal Helpers
// ============================================================================

/**
 * Find the first ancestor with a groupId attribute
 */
function findParentGroupId(node, parents) {
  for (const parent of parents) {
    if (parent.__groupId) {
      return parent.__groupId;
    }
  }
  return null;
}

/**
 * Get child by fieldName
 */
function getChild(node, fieldName) {
  if (!node.children) return null;
  return node.children.find((c) => c.fieldName === fieldName);
}

/**
 * Get all children by fieldName
 */
function getChildren(node, fieldName) {
  if (!node.children) return [];
  return node.children.filter((c) => c.fieldName === fieldName);
}

/**
 * Get child by type
 */
function getChildByType(node, type) {
  if (!node.children) return null;
  return node.children.find((c) => c.type === type);
}

/**
 * Get all children (excluding field-named ones if needed)
 */
function getAllChildren(node) {
  return node.children || [];
}

// ============================================================================
// Printer Functions
// ============================================================================

function printNode(node, parents = []) {
  if (!node) return "";

  const newParents = [node, ...parents];

  switch (node.type) {
    case "stored_definitions":
      return printStoredDefinitions(node, newParents);

    case "within_clause":
      return "within;";

    case "stored_definition":
      return printStoredDefinition(node, newParents);

    case "class_definition":
      return printClassDefinition(node, newParents);

    case "class_prefixes":
      return node.text;

    case "long_class_specifier":
      return printLongClassSpecifier(node, newParents);

    case "element_list":
      return printElementList(node, newParents);

    case "named_element":
      return printNamedElement(node, newParents);

    case "component_clause":
      return printComponentClause(node, newParents);

    case "type_specifier":
    case "name":
      return printName(node, newParents);

    case "component_declaration":
      return printComponentDeclaration(node, newParents);

    case "declaration":
      return printDeclaration(node, newParents);

    case "modification":
      return printModification(node, newParents);

    case "expression":
    case "simple_expression":
    case "primary_expression":
      return printExpression(node, newParents);

    case "binary_expression":
      return printBinaryExpression(node, newParents);

    case "parenthesized_expression":
      return printParenthesizedExpression(node, newParents);

    case "output_expression_list":
      return printOutputExpressionList(node, newParents);

    case "function_application":
      return printFunctionApplication(node, newParents);

    case "function_call_args":
      return printFunctionCallArgs(node, newParents);

    case "function_arguments":
      return printFunctionArguments(node, newParents);

    case "component_reference":
      return printComponentReference(node, newParents);

    case "IDENT":
      return node.text;

    default:
      // Fallback: try to print children
      if (node.children && node.children.length > 0) {
        return node.children.map((c) => printNode(c, newParents));
      }
      return node.text || "";
  }
}

function printStoredDefinitions(node, parents) {
  const parts = [];
  for (const child of getAllChildren(node)) {
    parts.push(printNode(child, parents));
  }
  return [join(hardline, parts), hardline];
}

function printStoredDefinition(node, parents) {
  const classDef = getChild(node, "classDefinition");
  if (classDef) {
    return printNode(classDef, parents);
  }
  return "";
}

function printClassDefinition(node, parents) {
  const prefixes = getChild(node, "classPrefixes");
  const specifier = getChild(node, "classSpecifier");

  return [
    printNode(prefixes, parents),
    " ",
    printNode(specifier, parents),
    ";",
  ];
}

function printLongClassSpecifier(node, parents) {
  const ident = getChild(node, "identifier");
  const elementList = getChildByType(node, "element_list");
  const endIdent = getChild(node, "endIdentifier");

  const parts = [printNode(ident, parents)];

  if (elementList) {
    parts.push(indent([hardline, printNode(elementList, parents)]));
    parts.push(hardline);
  }

  parts.push("end ", printNode(endIdent, parents));

  return parts;
}

function printElementList(node, parents) {
  const elements = getAllChildren(node);
  return join(
    hardline,
    elements.map((e) => [printNode(e, parents), ";"])
  );
}

function printNamedElement(node, parents) {
  const parts = [];

  // Check for 'final' in the text
  if (node.text.startsWith("final ")) {
    parts.push("final ");
  }

  const componentClause = getChild(node, "componentClause");
  if (componentClause) {
    parts.push(printNode(componentClause, parents));
  }

  return parts;
}

function printComponentClause(node, parents) {
  const parts = [];

  // Check for 'parameter' prefix
  if (node.text.startsWith("parameter ")) {
    parts.push("parameter ");
  }

  const typeSpec = getChildByType(node, "type_specifier");
  const compDecl = getChild(node, "componentDeclarations");

  if (typeSpec) {
    parts.push(printNode(typeSpec, parents), " ");
  }

  if (compDecl) {
    parts.push(printNode(compDecl, parents));
  }

  return parts;
}

function printName(node, parents) {
  // Recursively build qualified name
  const qualifier = getChild(node, "qualifier");
  const ident = getChild(node, "identifier");

  if (qualifier && ident) {
    return [printNode(qualifier, parents), ".", printNode(ident, parents)];
  } else if (ident) {
    return printNode(ident, parents);
  }

  return node.text;
}

function printComponentDeclaration(node, parents) {
  const decl = getChild(node, "declaration");
  if (decl) {
    return printNode(decl, parents);
  }
  return "";
}

function printDeclaration(node, parents) {
  const ident = getChild(node, "identifier");
  const mod = getChild(node, "modification");

  const parts = [printNode(ident, parents)];

  if (mod) {
    parts.push(printNode(mod, parents));
  }

  return parts;
}

function printModification(node, parents) {
  const expr = getChild(node, "expression");

  if (expr) {
    // Modification adds indent - create groupId
    const groupId = Symbol("modification");
    node.__groupId = groupId;

    // Look for parent groupId
    const parentGroupId = findParentGroupId(node, parents);

    const exprDoc = printNode(expr, [node, ...parents]);

    const content = [softline, exprDoc];

    // Use indentIfBreak if parent has groupId, otherwise regular indent
    const indentedContent = parentGroupId
      ? indentIfBreak(content, { groupId: parentGroupId })
      : indent(content);

    return group(["=", indentedContent], { id: groupId });
  }

  return "=";
}

function printExpression(node, parents) {
  // Pass-through wrapper nodes
  const child = getAllChildren(node)[0];
  if (child) {
    return printNode(child, parents);
  }
  return "";
}

function printBinaryExpression(node, parents) {
  // Binary expression: break at max line width WITHOUT indent
  const operand1 = getChild(node, "operand1");
  const operand2 = getChild(node, "operand2");

  // Find operator from node structure
  const op = extractOperator(node);

  const left = printNode(operand1, parents);
  const right = printNode(operand2, parents);

  // No indent for binary expression - just break with line
  return group([left, " ", op, line, right]);
}

function extractOperator(node) {
  // Get operator by comparing operand ranges with node text
  const operand1 = getChild(node, "operand1");
  const operand2 = getChild(node, "operand2");

  if (!operand1 || !operand2) {
    return "+"; // fallback
  }

  // The operator is between operand1.end and operand2.start
  const fullText = node.text;
  const op1End = operand1.range.end;
  const op2Start = operand2.range.start;
  const nodeStart = node.range.start;

  // Calculate relative positions
  const op1EndCol =
    op1End.row === nodeStart.row
      ? op1End.column - nodeStart.column
      : fullText.split("\n").slice(0, op1End.row - nodeStart.row).join("\n")
          .length +
        1 +
        op1End.column;

  // Extract text between operands
  // Simple approach: look for common operators after the first operand's text ends
  const op1Text = operand1.text;
  const afterOp1 = fullText.substring(fullText.indexOf(op1Text) + op1Text.length);

  // Find the operator at the start of the remaining text (after whitespace/newlines)
  const match = afterOp1.match(/^\s*([+\-*/^]|<=|>=|==|<>|<|>|and|or)/);
  if (match) {
    return match[1];
  }

  return "+"; // fallback
}

function printParenthesizedExpression(node, parents) {
  // Parenthesized expression: break at max line width WITH indent
  // Parens stay attached to content (no break after '(' or before ')')
  const groupId = Symbol("paren");
  node.__groupId = groupId;

  const parentGroupId = findParentGroupId(node, parents);

  // Get the inner content (output_expression_list)
  const inner = getChildByType(node, "output_expression_list");
  const innerDoc = inner ? printNode(inner, [node, ...parents]) : "";

  // Use indentIfBreak based on parent's break state for the inner content
  const indentedContent = parentGroupId
    ? indentIfBreak(innerDoc, { groupId: parentGroupId })
    : indent(innerDoc);

  // Parens attached - no softline after '(' or before ')'
  return group(["(", indentedContent, ")"], { id: groupId });
}

function printOutputExpressionList(node, parents) {
  // Just print the expression inside
  const expr = getChildByType(node, "expression");
  if (expr) {
    return printNode(expr, parents);
  }
  return "";
}

function printFunctionApplication(node, parents) {
  // Function call: break systematically WITH indent
  const groupId = Symbol("funcCall");
  node.__groupId = groupId;

  const parentGroupId = findParentGroupId(node, parents);

  const funcRef = getChild(node, "functionReference");
  const callArgs = getChildByType(node, "function_call_args");

  const namePart = printNode(funcRef, [node, ...parents]);
  const argsPart = callArgs ? printNode(callArgs, [node, ...parents]) : "()";

  return group([namePart, argsPart], { id: groupId });
}

function printFunctionCallArgs(node, parents) {
  const funcArgs = getChildByType(node, "function_arguments");

  if (!funcArgs) {
    return "()";
  }

  const argsDoc = printNode(funcArgs, parents);

  // Create group for the args - shouldBreak forces breaking
  const groupId = Symbol("funcArgs");

  // Always indent args - the indent is relative to where ( appears
  return group(["(", indent([softline, argsDoc]), ")"], {
    id: groupId,
    shouldBreak: true, // Always break function args
  });
}

function printFunctionArguments(node, parents) {
  // Collect all argument expressions
  const args = getAllChildren(node).filter(
    (c) => c.type === "expression" || c.fieldName === "argument"
  );

  const argDocs = args.map((arg) => printNode(arg, parents));

  return join([",", line], argDocs);
}

function printComponentReference(node, parents) {
  const qualifier = getChild(node, "qualifier");
  const ident = getChild(node, "identifier");

  if (qualifier && ident) {
    return [
      printNode(qualifier, parents),
      ".",
      printNode(ident, parents),
    ];
  } else if (ident) {
    return printNode(ident, parents);
  }

  return node.text;
}

// ============================================================================
// Main Entry Point
// ============================================================================

function print(ast, options = {}) {
  const doc = printNode(ast);
  const printWidth = options.printWidth || 80;
  const tabWidth = options.tabWidth || 2;

  return prettier.doc.printer.printDocToString(doc, {
    printWidth,
    tabWidth,
    useTabs: false,
  }).formatted;
}

// ============================================================================
// Test
// ============================================================================

const fs = require("fs");

const astJson = fs.readFileSync(process.argv[2] || "Min.json", "utf-8");
const ast = JSON.parse(astJson);

const result = print(ast, { printWidth: 80 });
console.log(result);
