import { formatHTMLString } from './dist/html-formatter.js';

// Test case from Algorithm.mo
const html = `Block that outputs <code>Integer</code> time table values.`;

console.log('Input HTML:');
console.log(html);
console.log(`Length: ${html.length} characters\n`);

const formatted = formatHTMLString(html, {
  maxWidth: 80,
  baseIndent: "",
  removeEmptyLines: true,
  preservedTags: ["pre", "code"],
});

console.log('Formatted HTML:');
console.log(formatted);
console.log(`\nNumber of lines: ${formatted.split('\n').length}`);

// Test with longer content
const html2 = `where the first column of <code>table</code> is time and the remaining column(s) are the table values. The time column contains <code>Real</code> values that are in units of seconds if <code>timeScale = 1</code>.`;

console.log('\n\n--- Test 2 ---');
console.log('Input HTML:');
console.log(html2);
console.log(`Length: ${html2.length} characters\n`);

const formatted2 = formatHTMLString(html2, {
  maxWidth: 80,
  baseIndent: "",
  removeEmptyLines: true,
  preservedTags: ["pre", "code"],
});

console.log('Formatted HTML:');
console.log(formatted2);
console.log(`\nNumber of lines: ${formatted2.split('\n').length}`);

// Test the specific problem case
const html2b = `be used to scale the time values, for example, use <code>timeScale = 3600</code> if the values in the first column are interpreted as hours.`;

console.log('\n\n--- Test 2b (problem case) ---');
console.log('Input HTML:');
console.log(html2b);
console.log(`Length: ${html2b.length} characters\n`);

const formatted2b = formatHTMLString(html2b, {
  maxWidth: 80,
  baseIndent: "",
  removeEmptyLines: true,
  preservedTags: ["pre", "code"],
});

console.log('Formatted HTML:');
console.log(formatted2b);
console.log(`\nNumber of lines: ${formatted2b.split('\n').length}`);
formatted2b.split('\n').forEach((line, i) => {
  console.log(`Line ${i + 1} (${line.length} chars): ${line}`);
});

// Test the full paragraph context
const html2c = `The parameter <code>timeScale</code> can be used to scale the time values, for example, use <code>timeScale = 3600</code> if the values in the first column are interpreted as hours.`;

console.log('\n\n--- Test 2c (full context) ---');
console.log('Input HTML:');
console.log(html2c);
console.log(`Length: ${html2c.length} characters\n`);

const formatted2c = formatHTMLString(html2c, {
  maxWidth: 80,
  baseIndent: "",
  removeEmptyLines: true,
  preservedTags: ["pre", "code"],
});

console.log('Formatted HTML:');
console.log(formatted2c);
console.log(`\nNumber of lines: ${formatted2c.split('\n').length}`);
formatted2c.split('\n').forEach((line, i) => {
  console.log(`Line ${i + 1} (${line.length} chars): ${line}`);
});

// Test with newlines in text (like actual HTML)
const html2d = `The parameter <code>timeScale</code> can
be used to scale the time values, for example, use
<code>timeScale = 3600</code>
if the values in the first column are interpreted as hours.`;

console.log('\n\n--- Test 2d (with newlines in text) ---');
console.log('Input HTML:');
console.log(html2d);
console.log(`Lengthraph tags
const html3 = `<p>
where the first column of <code>table</code> is time and the remaining column(s) are the table values. The time column contains <code>Real</code> values that are in units of seconds if <code>timeScale = 1</code>.
The parameter <code>timeScale</code> can be used to scale the time values, for example, use <code>timeScale = 3600</code> if the values in the first column are interpreted as hours.
</p>`;

console.log('\n\n--- Test 3 (with paragraph tags) ---');
console.log('Input HTML:');
console.log(html3);
console.log(`Length: ${html3.length} characters\n`);

const formatted3 = formatHTMLString(html3, {
  maxWidth: 80,
  baseIndent: "",
  removeEmptyLines: true,
  preservedTags: ["pre", "code"],
});

console.log('Formatted HTML:');
console.log(formatted3);
console.log(`\nNumber of lines: ${formatted3.split('\n').length}`);

// Test simpler case
const html4 = `<p>
Block that outputs <code>Integer</code> time table values.
</p>`;

console.log('\n\n--- Test 4 (simple paragraph) ---');
console.log('Input HTML:');
console.log(html4);
console.log(`Length: ${html4.length} characters\n`);

const formatted4 = formatHTMLString(html4, {
  maxWidth: 80,
  baseIndent: "",
  removeEmptyLines: true,
  preservedTags: ["pre", "code"],
});

console.log('Formatted HTML:');
console.log(formatted4);
console.log(`\nNumber of lines: ${formatted4.split('\n').length}`);