#!/usr/bin/env node

import * as process from 'node:process';
import * as path from 'node:path';
import { buildGraph } from './graph.js';
import { pruneContext, detectCycles } from './analyzer.js';

function printHelp() {
  console.log(`
@swaraj792725/codebase-dependency-graph - Zero-dependency JS/TS module dependency graph analyzer

Usage:
  codebase-dep-graph [options]

Options:
  --dir <path>          Target codebase directory (default: current working directory)
  --entry <path...>     Entry point file(s) to trace reachability from
  --format <fmt>        Output format: xml | markdown | json (default: xml)
  --max-tokens <num>    Maximum token budget for pruned context output
  --detect-cycles       Check and display circular dependency cycles
  --no-content          Omit file source code in output (metadata only)
  --help                Show this help message

Examples:
  npx @swaraj792725/codebase-dependency-graph --dir ./src --entry src/index.ts --format markdown
  npx @swaraj792725/codebase-dependency-graph --dir . --max-tokens 8000 --detect-cycles
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  let dir = process.cwd();
  const entryPoints: string[] = [];
  let format: 'xml' | 'markdown' | 'json' = 'xml';
  let maxTokenBudget = Number.POSITIVE_INFINITY;
  let checkCycles = false;
  let includeContent = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dir' && args[i + 1]) {
      dir = path.resolve(args[++i]);
    } else if (arg === '--entry' && args[i + 1]) {
      while (args[i + 1] && !args[i + 1].startsWith('--')) {
        entryPoints.push(args[++i]);
      }
    } else if (arg === '--format' && args[i + 1]) {
      const fmt = args[++i].toLowerCase();
      if (fmt === 'xml' || fmt === 'markdown' || fmt === 'json') {
        format = fmt;
      }
    } else if (arg === '--max-tokens' && args[i + 1]) {
      maxTokenBudget = parseInt(args[++i], 10) || Number.POSITIVE_INFINITY;
    } else if (arg === '--detect-cycles') {
      checkCycles = true;
    } else if (arg === '--no-content') {
      includeContent = false;
    }
  }

  const graph = buildGraph({ rootDir: dir, entryFiles: entryPoints });

  if (checkCycles) {
    const cycles = detectCycles(graph);
    if (cycles.length > 0) {
      console.error(`\n[WARNING] Found ${cycles.length} circular dependency cycle(s):`);
      for (let i = 0; i < cycles.length; i++) {
        console.error(`  Cycle ${i + 1}: ${cycles[i].cycle.join(' -> ')}`);
      }
    } else {
      console.error(`\n[INFO] No circular dependency cycles found.`);
    }
  }

  const result = pruneContext(graph, {
    entryPoints,
    maxTokenBudget,
    format,
    includeContent
  });

  console.log(result.formattedOutput);
}

main().catch(err => {
  console.error('Error running codebase-dependency-graph CLI:', err);
  process.exit(1);
});
