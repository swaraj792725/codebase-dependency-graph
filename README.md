# `@swaraj792725/codebase-dependency-graph`

> **Zero-dependency JS/TS codebase module dependency graph analyzer, topological sorter, circular dependency detector, and token-saving AI context pruner for Claude, Gemini, and GPT agents.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub Packages](https://img.shields.io/badge/registry-GitHub_Packages-green.svg)](https://github.com/swaraj792725?tab=packages)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)

---

## 🌟 Overview

When building AI coding assistants, agents, or LLM prompt pipelines, feeding raw unstructured source code wastes **40% to 80%** of context window tokens on unreachable files, circular dependencies, or misordered modules.

`@swaraj792725/codebase-dependency-graph` resolves this by building a zero-dependency directed dependency graph of your JavaScript and TypeScript codebases. It automatically:
- 🌲 **Extracts Import/Export ASTs**: Finds internal module imports, external package references (`react`, `node:fs`), and exported symbol signatures.
- 🔄 **Topological Sorting**: Guarantees utility & helper modules appear **before** the top-level files that import them, giving LLMs optimal context progression.
- ⭕ **Circular Dependency Detection**: Identifies cycle loops (`a.ts -> b.ts -> a.ts`) using DFS cycle analysis.
- ✂️ **AI Context Pruning**: Traces reachability starting from your entry point file(s) (e.g. `src/index.ts`) and prunes all dead/unreachable code, fitting within strict token budgets.
- 📦 **Zero Runtime Dependencies**: Ultra-fast, lightweight, Node.js native, ESM & CJS compliant.

---

## 📦 Installation

Install via GitHub Packages registry:

```bash
npm install @swaraj792725/codebase-dependency-graph --registry=https://npm.pkg.github.com
```

Or run directly via `npx`:

```bash
npx @swaraj792725/codebase-dependency-graph --dir ./src --entry src/index.ts --format xml
```

---

## 🚀 Programmatic Usage

### 1. Build Codebase Graph & Sort Topologically

```typescript
import { buildGraph, topologicalSort } from '@swaraj792725/codebase-dependency-graph';

const graph = buildGraph({
  rootDir: './src',
  extensions: ['.ts', '.tsx', '.js']
});

console.log(`Total Files: ${graph.totalFiles}, Total Tokens: ~${graph.totalEstimatedTokens}`);

const { sortedIds, hasCycle } = topologicalSort(graph);
console.log('Topological Module Execution Order:');
console.log(sortedIds);
```

---

### 2. Detect Circular Dependencies

```typescript
import { buildGraph, detectCycles } from '@swaraj792725/codebase-dependency-graph';

const graph = buildGraph({ rootDir: '.' });
const cycles = detectCycles(graph);

if (cycles.length > 0) {
  console.warn(`Found ${cycles.length} circular dependency cycle(s):`);
  cycles.forEach((c, idx) => {
    console.warn(`Cycle ${idx + 1}: ${c.cycle.join(' -> ')}`);
  });
}
```

---

### 3. Prune AI Prompt Context for Entry Point & Token Budget

```typescript
import { buildGraph, pruneContext } from '@swaraj792725/codebase-dependency-graph';

const graph = buildGraph({ rootDir: '.' });

const pruned = pruneContext(graph, {
  entryPoints: ['src/cli.ts'],
  maxTokenBudget: 8000, // Token budget limit
  format: 'xml',         // Output format: 'xml' | 'markdown' | 'json'
  includeContent: true
});

console.log(`Reachable Files Count: ${pruned.reachableFiles.length}`);
console.log(pruned.formattedOutput);
```

---

## 🖥️ Command Line Interface (CLI)

```bash
# Analyze current directory with an entrypoint in Markdown format
npx @swaraj792725/codebase-dependency-graph --dir . --entry src/index.ts --format markdown

# Detect circular dependencies and enforce max token budget of 12,000
npx @swaraj792725/codebase-dependency-graph --dir . --max-tokens 12000 --detect-cycles
```

---

## 📄 Output Formats

### XML (`--format xml`)

```xml
<codebase_dependency_context>
  <summary>
    <total_reachable_files>3</total_reachable_files>
    <estimated_tokens>420</estimated_tokens>
    <external_packages>node:path, node:fs</external_packages>
  </summary>
  <modules_topological_order>
    <module path="src/utils/logger.ts" lines="5" tokens="35">
      <exports>log</exports>
      <content>
export function log(msg: string) { console.log(msg); }
      </content>
    </module>
  </modules_topological_order>
</codebase_dependency_context>
```

---

## 📜 License

MIT © [Swaraj](https://github.com/swaraj792725)
