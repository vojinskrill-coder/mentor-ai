/**
 * Generates curriculum.json from the Obsidian vault data (obsidian-pages.json).
 *
 * This script parses the vault's file paths to extract the complete folder hierarchy
 * and produces a flat array of CurriculumNode objects with proper parentId chains.
 *
 * Usage: npx ts-node prisma/generate-curriculum.ts
 *
 * Reads from: $TEMP/obsidian-pages.json (or C:/Users/tanjav/AppData/Local/Temp/)
 * Writes to:  src/app/knowledge/data/curriculum.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface CurriculumNode {
  id: string;
  parentId: string | null;
  label: string;
  sortOrder: number;
}

// Excluded folders — these are NOT business concepts
const EXCLUDED_FOLDERS = ['1. Kako koristiti Mentor AI?'];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[čć]/g, 'c')
    .replace(/[š]/g, 's')
    .replace(/[ž]/g, 'z')
    .replace(/[đ]/g, 'dj')
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Strips number prefix from folder/file name and extracts sortOrder.
 *
 * Vault naming patterns:
 *   Folders: "3. Marketing", "2.1. Oblici Vrednosti", "3.1 Uvod u AK"
 *   Pages:   "2.1.1 Proizvod", "3.1.2 Benefiti AK", "2.1 Oblici Vrednosti"
 *
 * Strategy: match the full numeric prefix (digits and dots), then use the
 * LAST number segment as sortOrder (local position within parent).
 *
 * Examples:
 *   "3. Marketing" → { label: "Marketing", sortOrder: 3 }
 *   "2.1. Oblici Vrednosti" → { label: "Oblici Vrednosti", sortOrder: 1 }
 *   "2.1.1 Proizvod" → { label: "Proizvod", sortOrder: 1 }
 *   "3.1.2 Benefiti AK" → { label: "Benefiti AK", sortOrder: 2 }
 *   "Tok Vrednosti" → { label: "Tok Vrednosti", sortOrder: 999 }
 */
function parseNameAndOrder(name: string): { label: string; sortOrder: number } {
  // Match: one or more digit groups separated by dots, optionally ending with dot,
  // followed by space(s), then the actual name.
  // Pattern: "2.1. Name" or "2.1.1 Name" or "3 Name" or "3. Name"
  const match = name.match(/^([\d]+(?:\.[\d]+)*)\.?\s+(.+)$/);
  if (match && match[1] && match[2]) {
    const numParts = match[1].split('.').map(Number);
    // Use LAST segment as sortOrder (local position within parent)
    const sortOrder = numParts[numParts.length - 1] ?? 0;
    return { label: match[2].trim(), sortOrder };
  }

  // No number prefix
  return { label: name.trim(), sortOrder: 999 };
}

function stripFileExtension(name: string): string {
  return name.replace(/\.md$/, '');
}

function main() {
  // Find obsidian-pages.json
  const possiblePaths = [
    join('C:', 'Users', 'tanjav', 'AppData', 'Local', 'Temp', 'obsidian-pages.json'),
    '/tmp/obsidian-pages.json',
  ];

  let rawData: string | null = null;
  let loadedPath = '';
  for (const p of possiblePaths) {
    try {
      rawData = readFileSync(p, 'utf-8');
      loadedPath = p;
      break;
    } catch {
      // Try next
    }
  }

  if (!rawData) {
    console.error('Could not find obsidian-pages.json');
    process.exit(1);
  }

  console.log(`Loaded vault data from: ${loadedPath}`);
  const vaultPages: Record<string, string> = JSON.parse(rawData);
  const keys = Object.keys(vaultPages);
  console.log(`Total pages in vault: ${keys.length}`);

  // Step 1: Extract all unique folder paths and page paths
  const folderSet = new Set<string>();
  const pagePaths: string[] = [];

  for (const key of keys) {
    const parts = key.split('/');
    // Skip root "Poslovanje" — we'll make chapters top-level
    if (parts[0] !== 'Poslovanje') {
      console.warn(`Unexpected root: ${parts[0]} in key: ${key}`);
      continue;
    }

    // Check if any part of the path is in EXCLUDED_FOLDERS
    const isExcluded = parts.some((part) => EXCLUDED_FOLDERS.includes(part));
    if (isExcluded) {
      console.log(`  Excluding: ${key}`);
      continue;
    }

    // Record all folder paths (from depth 2 onward, skipping "Poslovanje")
    for (let i = 2; i < parts.length; i++) {
      folderSet.add(parts.slice(1, i).join('/'));
    }

    pagePaths.push(key);
  }

  console.log(`Folders found: ${folderSet.size}`);
  console.log(`Pages (after exclusion): ${pagePaths.length}`);

  // Step 2: Build folder nodes
  const nodeMap = new Map<string, CurriculumNode>();
  const sortedFolders = [...folderSet].sort();

  for (const folderPath of sortedFolders) {
    const parts = folderPath.split('/');
    const folderName = parts[parts.length - 1] ?? folderPath;
    const { label, sortOrder } = parseNameAndOrder(folderName);
    const id = slugify(label);

    // Parent is the folder path without the last part, or null if top-level (depth 1)
    let parentId: string | null = null;
    if (parts.length > 1) {
      const parentPath = parts.slice(0, -1).join('/');
      const parentNode = nodeMap.get(parentPath);
      if (parentNode) {
        parentId = parentNode.id;
      } else {
        console.warn(`Parent folder not found for: ${folderPath} (parent path: ${parentPath})`);
      }
    }

    // Handle ID collisions: if this id already exists, append parent context
    let uniqueId = id;
    const existingWithId = [...nodeMap.values()].find((n) => n.id === id);
    if (existingWithId) {
      // Make unique by prepending parent label
      const parentFolderName = parts.length > 1 ? (parts[parts.length - 2] ?? '') : '';
      const parentLabel = slugify(parseNameAndOrder(parentFolderName).label);
      uniqueId = parentLabel ? `${parentLabel}-${id}` : `${id}-folder`;
      console.log(`  ID collision: "${id}" → "${uniqueId}" (for "${folderPath}")`);
    }

    const node: CurriculumNode = {
      id: uniqueId,
      parentId,
      label,
      sortOrder,
    };

    nodeMap.set(folderPath, node);
  }

  // Step 3: Build page (leaf) nodes
  const pageNodes: CurriculumNode[] = [];
  const usedIds = new Set([...nodeMap.values()].map((n) => n.id));

  for (const key of pagePaths) {
    const parts = key.split('/');
    // Remove "Poslovanje/" and get filename
    const fileName = stripFileExtension(parts[parts.length - 1] ?? 'unknown');
    const { label, sortOrder } = parseNameAndOrder(fileName);

    // Parent is the folder containing this file
    const parentFolderPath = parts.slice(1, -1).join('/');
    const parentNode = parentFolderPath ? nodeMap.get(parentFolderPath) : undefined;
    const parentId = parentNode?.id ?? null;

    let id = slugify(label);

    // Handle ID collisions for pages
    if (usedIds.has(id)) {
      const parentLabel = parentNode ? slugify(parentNode.label) : '';
      const candidateId = parentLabel ? `${parentLabel}-${id}` : `${id}-page`;
      if (usedIds.has(candidateId)) {
        // Try with full ancestor chain
        const grandParent = parentNode?.parentId ?? '';
        id = `${grandParent}-${parentLabel}-${id}`.replace(/^-+/, '');
      } else {
        id = candidateId;
      }
      console.log(`  Page ID collision resolved: "${slugify(label)}" → "${id}"`);
    }

    usedIds.add(id);

    pageNodes.push({
      id,
      parentId,
      label,
      sortOrder,
    });
  }

  // Step 4: Combine and sort
  const allNodes: CurriculumNode[] = [...nodeMap.values(), ...pageNodes];

  // Sort: top-level first by sortOrder, then children grouped under parents
  allNodes.sort((a, b) => {
    if (a.parentId === null && b.parentId === null) return a.sortOrder - b.sortOrder;
    if (a.parentId === null) return -1;
    if (b.parentId === null) return 1;
    if (a.parentId === b.parentId) return a.sortOrder - b.sortOrder;
    return (a.parentId ?? '').localeCompare(b.parentId ?? '');
  });

  // Step 5: Validate
  const folderNodeCount = nodeMap.size;
  const pageNodeCount = pageNodes.length;
  const totalNodes = allNodes.length;
  const rootNodes = allNodes.filter((n) => n.parentId === null);

  console.log('\n--- Validation ---');
  console.log(`Folder nodes: ${folderNodeCount}`);
  console.log(`Page (leaf) nodes: ${pageNodeCount}`);
  console.log(`Total nodes: ${totalNodes}`);
  console.log(`Root (top-level) nodes: ${rootNodes.length}`);
  rootNodes.forEach((r) => console.log(`  ${r.id}: ${r.label} (sortOrder: ${r.sortOrder})`));

  // Check for orphans
  const allIds = new Set(allNodes.map((n) => n.id));
  const orphans = allNodes.filter((n) => n.parentId !== null && !allIds.has(n.parentId));
  if (orphans.length > 0) {
    console.error(`\nORPHAN NODES (parentId not found):`);
    orphans.forEach((o) => console.error(`  ${o.id} → parentId: ${o.parentId}`));
  }

  // Check max depth
  function getDepth(node: CurriculumNode): number {
    let depth = 1;
    let current: CurriculumNode | undefined = node;
    while (current?.parentId) {
      const parent = allNodes.find((n) => n.id === current!.parentId);
      if (!parent) break;
      current = parent;
      depth++;
    }
    return depth;
  }

  let maxDepth = 0;
  let deepestNode = '';
  for (const node of allNodes) {
    const d = getDepth(node);
    if (d > maxDepth) {
      maxDepth = d;
      deepestNode = `${node.id} (${node.label})`;
    }
  }
  console.log(`Max depth: ${maxDepth} — deepest node: ${deepestNode}`);

  // Step 6: Write output
  const outputPath = join(__dirname, '..', 'src', 'app', 'knowledge', 'data', 'curriculum.json');
  writeFileSync(outputPath, JSON.stringify(allNodes, null, 2), 'utf-8');
  console.log(`\nWrote ${totalNodes} nodes to: ${outputPath}`);
}

main();
