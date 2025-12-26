import * as prettier from 'prettier';
const { doc } = prettier;
const { builders, printer } = doc;
const { group, indent, line, softline, hardline, fill, ifBreak } = builders;

// The issue: fill expects alternating [content, separator, content, separator, ...]
// When a fill item itself contains line breaks, fill treats the whole content as "broken"
// and moves to the next line

// Let's trace fill's algorithm:
// 1. Try to fit content[0] + separator[0] + content[1] on current line
// 2. If doesn't fit, print content[0] + separator (which breaks to newline) + content[1]
// 3. Continue with content[2], etc.

// The PROBLEM: when content[1] (the middle term with parens) internally breaks,
// fill doesn't see it as "fitting" even though the OUTPUT would fit

// Let me verify this hypothesis:
const innerBinaryFill = fill([
  '(if have_valHpInlIso then 1 else 0) +',
  line,
  '(if have_valHpOutIso then 1 else 0)'
]);

const parenExpr = ['(', indent([innerBinaryFill]), ')'];

// What if I use group around the middle content?
// group allows breaking inside while still being considered as a unit
const middleTerm = group([
  'max(valIso.dpValveHeaWat_nominal) *',
  ' ',
  parenExpr
]);

const outerFill = fill([
  'hp.dpHeaWatHp_nominal +',
  line,
  // Wrap middle term in group, then add operator
  [middleTerm, ' ', '+'],
  line,
  'dpValCheHeaWat_nominal'
]);

const namedArgDoc = ['dp_nominal', '=', indent(outerFill)];

console.log("=== With group around middle term ===");
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
