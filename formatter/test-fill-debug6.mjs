import * as prettier from 'prettier';
const { doc } = prettier;
const { builders, printer } = doc;
const { group, indent, line, softline, hardline, fill } = builders;

console.log("=== Accurate simulation of the problem ===");

// Inner fill that WILL break (items too long for one line)
const innerFill = fill([
  '(if have_valHpInlIso then 1 else 0) +',  // 37 chars
  line,
  '(if have_valHpOutIso then 1 else 0)'     // 36 chars
]);

// Parenthesized expression with indent
const parenExpr = ['(', indent([innerFill]), ')'];

// The middle content: max(...) * (inner fill)
const middleContent = ['max(valIso.dpValveHeaWat_nominal) *', ' ', parenExpr];

// Outer fill
const outerFill = fill([
  'hp.dpHeaWatHp_nominal +',          // content 0
  line,                                 // separator 0
  [middleContent, ' ', '+'],           // content 1: ends with " +"
  line,                                 // separator 1
  'dpValCheHeaWat_nominal'             // content 2
]);

// Wrapped in indent (from named_argument)
const doc1 = ['dp_nominal=', indent(outerFill)];

const result = printer.printDocToString(doc1, {
  printWidth: 80,
  tabWidth: 2,
  useTabs: false
});

console.log(result.formatted);
console.log("\n=== Line by line ===");
result.formatted.split('\n').forEach((l, i) => {
  console.log(`${i+1}: [${l.length} chars] ${l}`);
});

// Now let's check: after printing content[1] which ends with ")) +"
// at position ~42, can we fit "dpValCheHeaWat_nominal" (24 chars)?
// 42 + 1 + 24 = 67 < 80, so YES it should fit

// But fill prints line as a BREAK because...?
// Let me check: is it because the FIRST check for content[1] fails?

console.log("\n=== What if content[1] is shorter? ===");
const outerFill2 = fill([
  'hp.dpHeaWatHp_nominal +',
  line,
  'short +',  // Short content that fits
  line,
  'dpValCheHeaWat_nominal'
]);

const result2 = printer.printDocToString(['dp_nominal=', indent(outerFill2)], {
  printWidth: 80,
  tabWidth: 2,
  useTabs: false
});
console.log(result2.formatted);

console.log("\n=== What if we use softline instead of line? ===");
const outerFill3 = fill([
  'hp.dpHeaWatHp_nominal +',
  softline,
  [middleContent, ' ', '+'],
  softline,
  'dpValCheHeaWat_nominal'
]);

const result3 = printer.printDocToString(['dp_nominal=', indent(outerFill3)], {
  printWidth: 80,
  tabWidth: 2,
  useTabs: false
});
console.log(result3.formatted);
