import * as fs from 'node:fs';
import { CodebaseGraph, CodebaseNode } from './graph.js';

export interface CircularCycle {
  cycle: string[]; // e.g. ["src/a.ts", "src/b.ts", "src/a.ts"]
}

export interface PrunedContextResult {
  reachableFiles: CodebaseNode[];
  omittedFiles: CodebaseNode[];
  totalTokens: number;
  totalLines: number;
  hasCycle: boolean;
  cycles: CircularCycle[];
  formattedOutput: string;
}

/**
 * Performs a topological sort of graph nodes so dependencies appear BEFORE dependent files.
 */
export function topologicalSort(graph: CodebaseGraph): { sortedIds: string[]; hasCycle: boolean } {
  const depCount = new Map<string, number>();
  // Map of imported dependency ID -> list of importer IDs (reverse edges)
  const dependentsMap = new Map<string, string[]>();

  for (const id of graph.nodes.keys()) {
    depCount.set(id, 0);
    dependentsMap.set(id, []);
  }

  for (const [id, node] of graph.nodes.entries()) {
    for (const depId of node.internalImports) {
      if (graph.nodes.has(depId)) {
        // id depends on depId
        depCount.set(id, (depCount.get(id) || 0) + 1);
        const list = dependentsMap.get(depId) || [];
        list.push(id);
        dependentsMap.set(depId, list);
      }
    }
  }

  const queue: string[] = [];
  for (const [id, count] of depCount.entries()) {
    if (count === 0) {
      queue.push(id);
    }
  }

  const sortedIds: string[] = [];
  while (queue.length > 0) {
    const u = queue.shift()!;
    sortedIds.push(u);

    const dependents = dependentsMap.get(u) || [];
    for (const dep of dependents) {
      const remaining = (depCount.get(dep) || 0) - 1;
      depCount.set(dep, remaining);
      if (remaining === 0) {
        queue.push(dep);
      }
    }
  }

  const hasCycle = sortedIds.length !== graph.nodes.size;
  if (hasCycle) {
    for (const id of graph.nodes.keys()) {
      if (!sortedIds.includes(id)) {
        sortedIds.push(id);
      }
    }
  }

  return { sortedIds, hasCycle };
}

/**
 * Detects circular dependency cycles using DFS stack inspection.
 */
export function detectCycles(graph: CodebaseGraph): CircularCycle[] {
  const cycles: CircularCycle[] = [];
  const visited = new Map<string, 'unvisited' | 'visiting' | 'visited'>();

  for (const id of graph.nodes.keys()) {
    visited.set(id, 'unvisited');
  }

  function dfs(u: string, stack: string[]) {
    visited.set(u, 'visiting');
    stack.push(u);

    const node = graph.nodes.get(u);
    if (node) {
      for (const v of node.internalImports) {
        if (!graph.nodes.has(v)) continue;
        const state = visited.get(v);
        if (state === 'visiting') {
          const cycleStartIndex = stack.indexOf(v);
          if (cycleStartIndex !== -1) {
            const cyclePath = [...stack.slice(cycleStartIndex), v];
            cycles.push({ cycle: cyclePath });
          }
        } else if (state === 'unvisited') {
          dfs(v, stack);
        }
      }
    }

    stack.pop();
    visited.set(u, 'visited');
  }

  for (const id of graph.nodes.keys()) {
    if (visited.get(id) === 'unvisited') {
      dfs(id, []);
    }
  }

  return cycles;
}

export interface PruneOptions {
  entryPoints?: string[];
  maxTokenBudget?: number;
  format?: 'xml' | 'markdown' | 'json';
  includeContent?: boolean;
}

/**
 * Prunes the dependency graph to only include reachable modules from entry files, sorted topologically, within a token budget.
 */
export function pruneContext(graph: CodebaseGraph, options: PruneOptions = {}): PrunedContextResult {
  const format = options.format || 'xml';
  const includeContent = options.includeContent ?? true;
  const maxTokenBudget = options.maxTokenBudget || Number.POSITIVE_INFINITY;

  const reachableSet = new Set<string>();

  if (options.entryPoints && options.entryPoints.length > 0) {
    const queue: string[] = [];
    for (const entry of options.entryPoints) {
      const normEntry = entry.replace(/\\/g, '/').replace(/^\.\//, '');
      if (graph.nodes.has(normEntry)) {
        queue.push(normEntry);
      }
    }

    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (reachableSet.has(curr)) continue;
      reachableSet.add(curr);

      const node = graph.nodes.get(curr);
      if (node) {
        for (const depId of node.internalImports) {
          if (graph.nodes.has(depId) && !reachableSet.has(depId)) {
            queue.push(depId);
          }
        }
      }
    }
  } else {
    for (const id of graph.nodes.keys()) {
      reachableSet.add(id);
    }
  }

  const { sortedIds, hasCycle } = topologicalSort(graph);
  const cycles = detectCycles(graph);

  const reachableFiles: CodebaseNode[] = [];
  const omittedFiles: CodebaseNode[] = [];

  let accumulatedTokens = 0;
  let accumulatedLines = 0;

  for (const id of sortedIds) {
    if (!reachableSet.has(id)) continue;
    const node = graph.nodes.get(id);
    if (!node) continue;

    if (accumulatedTokens + node.estimatedTokens <= maxTokenBudget) {
      reachableFiles.push(node);
      accumulatedTokens += node.estimatedTokens;
      accumulatedLines += node.lineCount;
    } else {
      omittedFiles.push(node);
    }
  }

  const formattedOutput = formatOutput(
    graph,
    reachableFiles,
    omittedFiles,
    format,
    includeContent,
    accumulatedTokens,
    maxTokenBudget
  );

  return {
    reachableFiles,
    omittedFiles,
    totalTokens: accumulatedTokens,
    totalLines: accumulatedLines,
    hasCycle,
    cycles,
    formattedOutput
  };
}

function formatOutput(
  graph: CodebaseGraph,
  reachableFiles: CodebaseNode[],
  omittedFiles: CodebaseNode[],
  format: 'xml' | 'markdown' | 'json',
  includeContent: boolean,
  accumulatedTokens: number,
  maxTokenBudget: number
): string {
  if (format === 'json') {
    return JSON.stringify(
      {
        totalFiles: reachableFiles.length,
        totalTokens: accumulatedTokens,
        maxTokenBudget: maxTokenBudget === Number.POSITIVE_INFINITY ? null : maxTokenBudget,
        externalPackages: Array.from(graph.externalPackages),
        files: reachableFiles.map(f => ({
          id: f.id,
          lineCount: f.lineCount,
          estimatedTokens: f.estimatedTokens,
          exportedSymbols: f.exportedSymbols,
          internalImports: f.internalImports,
          externalImports: f.externalImports
        }))
      },
      null,
      2
    );
  }

  if (format === 'markdown') {
    const lines: string[] = [];
    lines.push(`# Codebase Dependency Graph Context`);
    lines.push(`- **Total Reachable Modules**: ${reachableFiles.length}`);
    lines.push(`- **Estimated Tokens**: ~${accumulatedTokens}`);
    lines.push(`- **External Dependencies**: ${Array.from(graph.externalPackages).join(', ') || 'None'}`);
    lines.push(``);
    lines.push(`## Topological Dependency Module List`);

    for (const file of reachableFiles) {
      lines.push(`### \`${file.id}\``);
      lines.push(`- **Lines**: ${file.lineCount} | **Tokens**: ~${file.estimatedTokens}`);
      if (file.exportedSymbols.length > 0) {
        lines.push(`- **Exported Symbols**: \`${file.exportedSymbols.join('`, `')}\``);
      }
      if (file.internalImports.length > 0) {
        lines.push(`- **Imports Internal**: \`${file.internalImports.join('`, `')}\``);
      }
      if (includeContent) {
        lines.push(``);
        lines.push(`\`\`\`typescript`);
        try {
          lines.push(fs.readFileSync(file.absolutePath, 'utf8'));
        } catch {
          lines.push(`// Could not read file content`);
        }
        lines.push(`\`\`\``);
      }
      lines.push(``);
    }

    return lines.join('\n');
  }

  // XML Default Format for LLMs
  const lines: string[] = [];
  lines.push(`<codebase_dependency_context>`);
  lines.push(`  <summary>`);
  lines.push(`    <total_reachable_files>${reachableFiles.length}</total_reachable_files>`);
  lines.push(`    <estimated_tokens>${accumulatedTokens}</estimated_tokens>`);
  lines.push(`    <external_packages>${Array.from(graph.externalPackages).join(', ')}</external_packages>`);
  lines.push(`  </summary>`);
  lines.push(`  <modules_topological_order>`);

  for (const file of reachableFiles) {
    lines.push(`    <module path="${file.id}" lines="${file.lineCount}" tokens="${file.estimatedTokens}">`);
    if (file.exportedSymbols.length > 0) {
      lines.push(`      <exports>${file.exportedSymbols.join(', ')}</exports>`);
    }
    if (file.internalImports.length > 0) {
      lines.push(`      <imports>${file.internalImports.join(', ')}</imports>`);
    }
    if (includeContent) {
      lines.push(`      <content>`);
      try {
        lines.push(fs.readFileSync(file.absolutePath, 'utf8'));
      } catch {
        lines.push(`// Could not read file content`);
      }
      lines.push(`      </content>`);
    }
    lines.push(`    </module>`);
  }

  lines.push(`  </modules_topological_order>`);
  lines.push(`</codebase_dependency_context>`);

  return lines.join('\n');
}
