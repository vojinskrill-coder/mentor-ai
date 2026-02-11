/**
 * Extract concepts from the Training PDF and output as JSON.
 *
 * Usage:
 *   node Vector_DB_Source/extract-concepts.mjs
 *
 * Output:
 *   Vector_DB_Source/extracted-concepts.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dynamic import for pdf-parse (CommonJS module)
const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;

const pdfPath = path.join(__dirname, 'Training for Mentor AI New.pdf');
const outputPath = path.join(__dirname, 'extracted-concepts.json');

console.log('Reading PDF...');
const pdfBuffer = fs.readFileSync(pdfPath);

console.log('Parsing PDF text...');
const pdfData = await pdfParse(pdfBuffer);

const text = pdfData.text;
console.log(`Extracted ${text.length} characters from ${pdfData.numpages} pages`);

// Save raw text for debugging
fs.writeFileSync(path.join(__dirname, 'raw-text.txt'), text, 'utf-8');
console.log('Saved raw text to raw-text.txt');

// Parse concepts: look for patterns like "1.1 Concept Name" or "1.3.4 Concept Name"
// Concept headers start with a numbering pattern at the start of a line
const lines = text.split('\n');
const concepts = [];
let currentConcept = null;
let currentContent = [];

// Pattern: starts with digits and dots (e.g., "1.1", "2.3.4", "10.2")
// followed by a space and then the concept name (capitalized words)
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
    // Save previous concept
    if (currentConcept) {
      const content = currentContent.join('\n').trim();
      if (content.length > 20) { // Only keep concepts with meaningful content
        currentConcept.content = content;
        concepts.push(currentConcept);
      }
    }

    // Start new concept
    currentConcept = {
      numbering: match[1],
      name: match[2].trim(),
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

// Show first 10 for verification
console.log('\nFirst 10 concepts:');
for (const c of concepts.slice(0, 10)) {
  console.log(`  ${c.numbering} ${c.name} (${c.content.length} chars)`);
}

// Show numbering distribution
const topLevel = new Set(concepts.map(c => c.numbering.split('.')[0]));
console.log(`\nTop-level sections: ${[...topLevel].sort((a,b) => Number(a) - Number(b)).join(', ')}`);

// Save as JSON
fs.writeFileSync(outputPath, JSON.stringify(concepts, null, 2), 'utf-8');
console.log(`\nSaved ${concepts.length} concepts to extracted-concepts.json`);
