import { formatHTMLString } from './dist/html-formatter.js';

// Test the exact case from Algorithm.mo line 96-99
const html = `The parameter <code>timeScale</code> can
be used to scale the time values, for example, use
<code>timeScale = 3600</code>
if the values in the first column are interpreted as hours.`;

console.log('Input (with newlines):');
console.log(html);
console.log('\nFormatted:');
const result = formatHTMLString(html, {
  maxWidth: 80,
  baseIndent: "",
  removeEmptyLines: true,
  preservedTags: ["pre", "code"],
});
console.log(result);
console.log('\nLines:');
result.split('\n').forEach((line, i) => console.log(`${i+1}: ${line}`));
