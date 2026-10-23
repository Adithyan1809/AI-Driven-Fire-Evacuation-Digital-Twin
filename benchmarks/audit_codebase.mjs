import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();

function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...scanDir(fullPath));
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
      files.push(fullPath);
    }
  }
  return files;
}

const jsFiles = scanDir(rootDir);
console.log(`Found ${jsFiles.length} JavaScript/ESM files to audit.`);

const findings = [];

jsFiles.forEach(file => {
  const relPath = path.relative(rootDir, file).replace(/\\/g, '/');
  const code = fs.readFileSync(file, 'utf8');
  const lines = code.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    // Check for hard-coded mappings, dictionaries, regex, ROOM_101 assumptions
    if (line.includes('buildEntityDict') || line.includes('FIELD_SYNONYMS') || line.includes('system_identifiers')) {
      findings.push({ file: relPath, lineNum, type: 'DICTIONARY_DEF', line: line.trim() });
    }
    if (line.includes('resolveEntity') || line.includes('resolveField')) {
      findings.push({ file: relPath, lineNum, type: 'RESOLVER_CALL', line: line.trim() });
    }
    if (line.includes('callGeminiSemanticAPI') || line.includes('/api/semantic/resolve')) {
      findings.push({ file: relPath, lineNum, type: 'GEMINI_AI_CALL', line: line.trim() });
    }
    if (line.includes('semanticCache.get') || line.includes('localCache.get')) {
      findings.push({ file: relPath, lineNum, type: 'CACHE_LOOKUP', line: line.trim() });
    }
    if (line.includes('validateSemanticMapping') || line.includes('validateBatch')) {
      findings.push({ file: relPath, lineNum, type: 'VALIDATION_FIREWALL', line: line.trim() });
    }
  });
});

console.log('--- Codebase Audit Results ---');
console.log(`Total key points found: ${findings.length}`);
findings.forEach(f => console.log(`[${f.type}] ${f.file}:${f.lineNum} -> ${f.line.slice(0, 100)}`));
