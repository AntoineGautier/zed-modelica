import * as prettier from 'prettier';
const { doc } = prettier;
const { builders, printer } = doc;
const { group, indent, line, softline, hardline, fill } = builders;

// Test WITHOUT indent in parenthesized_expression

const innerBinaryFill = fill([
  '(if have_valHpInlIso then 1 else 0) +',
  line,
  '(if have_valHpOutIso then 1 else 0)'
]);

// Without indent:
const parenExprNoIndent = ['(', innerBinaryFill, ')'];

const outerFill = fill([
  'hp.dpHeaWatHp_nominal +',
  line,
  [['max(valIso.dpValveHeaWat_nominal) *', ' ', parenExprNoIndent], ' ', '+'],
  line,
  'dpValCheHeaWat_nominal'
]);

const namedArgDoc = ['dp_nominal', '=', indent(outerFill)];

console.log("=== WITHOUT indent in paren expr ===");
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
