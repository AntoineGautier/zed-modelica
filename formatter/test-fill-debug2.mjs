import * as prettier from 'prettier';
const { doc } = prettier;
const { builders, printer } = doc;
const { group, indent, line, softline, hardline, fill } = builders;

// More accurate simulation of what the actual printer generates
// The key insight: parenthesized_expression uses indent(content) 
// And the inner expression is a fill that returns its own Doc

// Inner binary expression inside parens: (A + B)
// The binary_expression handler returns fill([A +, line, B])
const innerBinaryFill = fill([
  '(if have_valHpInlIso then 1 else 0) +',
  line,
  '(if have_valHpOutIso then 1 else 0)'
]);

// parenthesized_expression wraps it with: ['(', indent(content), ')']
// NOTE: content here is an array from path.map(print, 'children')
// which would be [innerBinaryFill]
const parenExpr = ['(', indent([innerBinaryFill]), ')'];

// Now the OUTER expression: A + B * paren + C
// This also returns a fill
// But wait - does the outer fill include indent wrapping?

// Looking at named_argument: it does `parts.push(indent(path.call(print, 'children', i)))`
// So the fill gets wrapped in indent by named_argument

// Let's trace through the actual structure for dp_nominal=...
// modification handler for top-level assignment:
// group([' =', indent([line, expression])])

// The expression is a simple_expression containing binary_expression
// The binary_expression is: A + B * (...) + C
// Which produces fill([A +, line, B * (...) +, line, C])

const outerFill = fill([
  'hp.dpHeaWatHp_nominal +',
  line,
  // This is [operands[i], ' ', ops[i]] where operands[i] is the * expression result
  // which itself contains the parenthesized expression
  [['max(valIso.dpValveHeaWat_nominal) *', ' ', parenExpr], ' ', '+'],
  line,
  'dpValCheHeaWat_nominal'
]);

// This is what modification produces for top-level:
// group([' =', indent([line, expression])])
const modificationDoc = group([
  ' =',
  indent([line, outerFill])
]);

// And then named_argument wraps in indent again:
// parts.push(indent(path.call(print, 'children', i)))
// Wait, that would be DOUBLE indent...

// Let me check: for named_argument, the value is the modification node
// named_argument: IDENT=modification
// So we have: 'dp_nominal', '=', indent(modification content)
// But modification already adds ' =' with indent...

// Actually, looking at the code:
// named_argument handler: parts.push(child.text, '=') for IDENT, 
//                         then parts.push(indent(path.call(print, 'children', i))) for other
// The 'other' here is likely the expression, not the modification

// Let me look at the actual input - what AST nodes are involved?
// dp_nominal=expression  <- this is a named_argument
// The named_argument children are: IDENT, expression (or simple_expression)

// So named_argument does: dp_nominal=indent(expression)
// And expression just passes through to binary_expression
// Which returns the fill

// So structure is: ['dp_nominal', '=', indent(fill([...]))]

const namedArgDoc = ['dp_nominal', '=', indent(outerFill)];

console.log("=== Structure: named_argument wrapping fill ===");
const result1 = printer.printDocToString(namedArgDoc, {
  printWidth: 80,
  tabWidth: 2,
  useTabs: false
});
console.log(result1.formatted);
console.log("\n=== Line lengths ===");
result1.formatted.split('\n').forEach((l, i) => {
  console.log(`${i+1}: [${l.length} chars] ${l}`);
});
