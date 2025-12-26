import * as prettier from 'prettier';
const { doc } = prettier;
const { builders } = doc;
const { group, indent, line, softline, hardline, fill } = builders;

// Simulate the Doc structure that the printer generates for:
// dp_nominal=hp.dpHeaWatHp_nominal + max(...) * ((...) + (...)) + dpValCheHeaWat_nominal
// 
// The fill should pack: [A +, line, B *, line, C +, line, D]
// Where C = parenthesized expression containing its own fill that breaks

// Inner parenthesized expression - its fill breaks internally
const innerFill = fill([
  '(if have_valHpInlIso then 1 else 0) +',
  line,
  '(if have_valHpOutIso then 1 else 0)'
]);

const parenExpr = ['(', indent([innerFill]), ')'];

// Outer fill for: A + B * (inner) + D
const outerFill = fill([
  'hp.dpHeaWatHp_nominal +',
  line,
  ['max(valIso.dpValveHeaWat_nominal) *', ' ', parenExpr, ' ', '+'],
  line,
  'dpValCheHeaWat_nominal'
]);

// The full doc
const docStructure = group([
  'dp_nominal=',
  indent([line, outerFill])
]);

// Print it
const result = prettier.doc.printer.printDocToString(docStructure, {
  printWidth: 80,
  tabWidth: 2,
  useTabs: false
});

console.log("=== Simulated output ===");
console.log(result.formatted);
console.log("\n=== Line lengths ===");
result.formatted.split('\n').forEach((line, i) => {
  console.log(`${i+1}: [${line.length} chars] ${line}`);
});
