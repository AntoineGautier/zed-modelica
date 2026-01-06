import { formatHTMLString } from './dist/html-formatter.js';

const html = `First line.<br/>Second line.<br/>Third line with some longer text.`;

console.log('Input:');
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
