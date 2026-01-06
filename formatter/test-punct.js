import { formatHTMLString } from './dist/html-formatter.js';

const testCases = [
  {
    name: "Period after link",
    html: `This is for <a href="test">#4152</a>.`,
  },
  {
    name: "Multiple punctuation",
    html: `Here is some text that is quite long and ends with a link <a href="url">link</a>, and continues.`,
  },
  {
    name: "Comma after code",
    html: `Use the parameter <code>value</code>, which sets the behavior.`,
  },
];

testCases.forEach(({ name, html }) => {
  console.log(`\n=== ${name} ===`);
  console.log(`Input: ${html}`);
  const result = formatHTMLString(html, {
    maxWidth: 80,
    baseIndent: "",
    removeEmptyLines: true,
    preservedTags: ["pre", "code"],
  });
  console.log(`Output:\n${result}`);
  
  // Check for punctuation at start of line
  const lines = result.split('\n');
  const badLines = lines.filter((line, i) => i > 0 && /^\s*[.,;:!?)\]\}]/.test(line));
  if (badLines.length > 0) {
    console.log(`❌ Found punctuation at start of line!`);
  } else {
    console.log(`✅ No punctuation at start of lines`);
  }
});
