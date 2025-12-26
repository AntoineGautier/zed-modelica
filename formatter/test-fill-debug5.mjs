import * as prettier from 'prettier';
const { doc } = prettier;
const { builders, printer, utils } = doc;
const { group, indent, line, softline, hardline, fill, lineSuffix } = builders;

// Let me try a completely different approach:
// Instead of using fill, use a single group with conditional breaks

// Actually, let me first understand: what happens with a simple fill
// where one item is very long?

console.log("=== Test 1: Simple fill with long middle item ===");
const simpleFill = fill([
  'aaa +',
  line,
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb +',
  line,
  'ccc'
]);

const result1 = printer.printDocToString(simpleFill, {
  printWidth: 80,
  tabWidth: 2,
  useTabs: false
});
console.log(result1.formatted);

console.log("\n=== Test 2: Fill where middle item itself breaks ===");
// Now middle item breaks internally
const middleWithBreak = group([
  'start',
  indent([line, 'middle']),
  line,
  'end'
]);

const fillWithBreakingMiddle = fill([
  'aaa +',
  line,
  [middleWithBreak, ' +'],
  line,
  'ccc'
]);

const result2 = printer.printDocToString(fillWithBreakingMiddle, {
  printWidth: 80,
  tabWidth: 2,
  useTabs: false
});
console.log(result2.formatted);

console.log("\n=== Test 3: The actual structure from the formatter ===");
// The fill contains: [A +, line, B * (inner fill) +, line, C]
// When we process B * (inner fill) +, the inner fill breaks

// Let me see what "fits" means for fill
// According to Prettier docs, fill uses propagateBreaks() to determine
// if content "fits" on a line

// Key insight: fill processes items left-to-right
// When it hits an item that contains a break, it still tries to fit
// the REMAINING items on the current line

// So the question is: after printing "B * ((if ...) + (if ...))" 
// does fill try to fit "+" and "C" on the same line?

// Actually let me trace more carefully:
// fill([A +, line, B +, line, C])
// 
// fillParts[0] = "A +"       <- content
// fillParts[1] = line        <- separator  
// fillParts[2] = "B +"       <- content
// fillParts[3] = line        <- separator
// fillParts[4] = "C"         <- content

// fill algorithm (simplified):
// 1. Print content[0]
// 2. Check if separator[0] + content[1] fit on current line
//    - If yes: print " " (flat separator) + content[1], go to step 4
//    - If no: print "\n" (break separator), print content[1], go to step 4
// 4. Check if separator[1] + content[2] fit
//    etc.

// The issue: when content[1] internally breaks, how does fill measure it?
// I think it measures the LAST LINE of content[1], not the first

console.log("\n=== Test 4: Measuring what happens ===");
const innerFill = fill([
  'XXXX +',
  line,
  'YYYY'
]);

// This should internally break because XXXX + YYYY > threshold
// After breaking, last line is just "YYYY" which is short

const testFill = fill([
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa +',
  line,
  [innerFill, ' +'],  // This will break internally
  line,
  'ccc'               // Does this fit after ") +"?
]);

const result4 = printer.printDocToString(indent(testFill), {
  printWidth: 80,
  tabWidth: 2,
  useTabs: false
});
console.log(result4.formatted);
result4.formatted.split('\n').forEach((l, i) => {
  console.log(`${i+1}: [${l.length} chars]`);
});
