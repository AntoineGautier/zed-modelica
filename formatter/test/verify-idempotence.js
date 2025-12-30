#!/usr/bin/env node

import { readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function removeWhitespace(content) {
  // Remove all whitespace characters (spaces, tabs, newlines, etc.)
  return content.replace(/\s+/g, '');
}

function runTests() {
  const testDir = __dirname;
  const files = readdirSync(testDir);
  
  let passed = 0;
  let failed = 0;
  const failures = [];

  // Find all .mo files that don't have '_formatted' in the name
  const sourceFiles = files.filter(f => 
    f.endsWith('.mo') && !f.includes('_formatted')
  );

  console.log('Verifying formatting idempotence...\n');

  for (const file of sourceFiles) {
    const base = basename(file, '.mo');
    const formattedFile = `${base}_formatted.mo`;
    
    // Check if formatted file exists
    if (!files.includes(formattedFile)) {
      console.log(`⚠ Skipping ${file}: no formatted version found`);
      continue;
    }

    const sourcePath = join(testDir, file);
    const formattedPath = join(testDir, formattedFile);

    const sourceContent = readFileSync(sourcePath, 'utf-8');
    const formattedContent = readFileSync(formattedPath, 'utf-8');

    const sourceNoWS = removeWhitespace(sourceContent);
    const formattedNoWS = removeWhitespace(formattedContent);

    if (sourceNoWS === formattedNoWS) {
      console.log(`✓ ${file}`);
      passed++;
    } else {
      console.log(`✗ ${file}`);
      failed++;
      failures.push({
        file,
        sourceLength: sourceNoWS.length,
        formattedLength: formattedNoWS.length
      });
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    console.log('\nFailures:');
    for (const failure of failures) {
      console.log(`  ${failure.file}:`);
      console.log(`    Original (no whitespace): ${failure.sourceLength} chars`);
      console.log(`    Formatted (no whitespace): ${failure.formattedLength} chars`);
      console.log(`    Difference: ${failure.formattedLength - failure.sourceLength} chars`);
    }
    process.exit(1);
  } else {
    console.log('\n✓ All files maintain identical content when formatted!');
    process.exit(0);
  }
}

runTests();
