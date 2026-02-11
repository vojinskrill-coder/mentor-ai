/**
 * Extract concepts from the Training PDF and output as JSON.
 *
 * Usage:
 *   node Vector_DB_Source/extract-concepts.cjs
 *
 * Output:
 *   Vector_DB_Source/extracted-concepts.json
 */

const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const pdfPath = path.join(__dirname, 'Training for Mentor AI New.pdf');
const outputPath = path.join(__dirname, 'extracted-concepts.json');

async function main() {
  console.log('Reading PDF...');
  const pdfBuffer = fs.readFileSync(pdfPath);

  console.log('Loading PDF into parser...');
  const parser = new PDFParse({ data: new Uint8Array(pdfBuffer), verbosity: 0 });
  const doc = await parser.load();
  console.log(`PDF loaded: ${doc.numPages} pages`);

  console.log('Extracting text...');
  const textResult = await parser.getText();
  const text = textResult.text || '';
  console.log(`Extracted ${text.length} characters`);

  // Save raw text for debugging
  const rawTextPath = path.join(__dirname, 'raw-text.txt');
  fs.writeFileSync(rawTextPath, text, 'utf-8');
  console.log('Saved raw text to raw-text.txt');

  // Parse concepts: look for patterns like "1.1 Name" or "1.3.4 Name"
  // Concept headers start with numbering at the start of a line
  const lines = text.split('\n');
  const concepts = [];
  let currentConcept = null;
  let currentContent = [];

  // Pattern: digits.digits(.digits)* followed by space and name
  // Must have at least 2 levels (e.g., "1.1", not just "1")
  const conceptHeaderPattern = /^(\d+(?:\.\d+)+)\s+(.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      if (currentConcept) {
        currentContent.push('');
      }
      continue;
    }

    const match = line.match(conceptHeaderPattern);

    if (match) {
      const numbering = match[1];
      const name = match[2].trim();

      // Filter out false positives: name should be meaningful (not just numbers/dates)
      // and numbering should be reasonable (not years like 2022.01)
      const parts = numbering.split('.');
      const firstPart = parseInt(parts[0], 10);
      if (firstPart > 20) {
        // Likely a date or other number, not a concept numbering
        if (currentConcept) currentContent.push(line);
        continue;
      }

      // Save previous concept
      if (currentConcept) {
        const content = currentContent.join('\n').trim();
        if (content.length > 20) {
          currentConcept.content = content;
          concepts.push(currentConcept);
        }
      }

      // Start new concept
      currentConcept = {
        numbering,
        name,
        content: '',
      };
      currentContent = [];
    } else if (currentConcept) {
      currentContent.push(line);
    }
  }

  // Don't forget the last concept
  if (currentConcept) {
    const content = currentContent.join('\n').trim();
    if (content.length > 20) {
      currentConcept.content = content;
      concepts.push(currentConcept);
    }
  }

  console.log(`\nFound ${concepts.length} concepts`);

  // Show first 20 for verification
  console.log('\nFirst 20 concepts:');
  for (const c of concepts.slice(0, 20)) {
    console.log(`  ${c.numbering} ${c.name} (${c.content.length} chars)`);
  }

  // Show last 5
  console.log('\nLast 5 concepts:');
  for (const c of concepts.slice(-5)) {
    console.log(`  ${c.numbering} ${c.name} (${c.content.length} chars)`);
  }

  // Show numbering distribution
  const topLevel = new Set(concepts.map(c => c.numbering.split('.')[0]));
  console.log(`\nTop-level sections: ${[...topLevel].sort((a, b) => Number(a) - Number(b)).join(', ')}`);

  // Show depth distribution
  const depths = {};
  for (const c of concepts) {
    const d = c.numbering.split('.').length;
    depths[d] = (depths[d] || 0) + 1;
  }
  console.log('Depth distribution:', depths);

  // Content length stats
  const contentLengths = concepts.map(c => c.content.length);
  const avg = Math.round(contentLengths.reduce((a, b) => a + b, 0) / contentLengths.length);
  const min = Math.min(...contentLengths);
  const max = Math.max(...contentLengths);
  console.log(`Content length: avg=${avg}, min=${min}, max=${max}`);

  // Save as JSON
  fs.writeFileSync(outputPath, JSON.stringify(concepts, null, 2), 'utf-8');
  console.log(`\nSaved ${concepts.length} concepts to extracted-concepts.json`);

  parser.destroy();
}

main().catch(err => {
  console.error('Failed:', err.message || err);
  process.exit(1);
});
