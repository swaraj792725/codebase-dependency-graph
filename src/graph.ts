import * as path from 'node:path';
import * as fs from 'node:fs';
import { parseModuleImports, normalizePath, ModuleImportInfo } from './parser.js';

export interface CodebaseNode extends ModuleImportInfo {
  id: string; // Relative path from root, e.g. "src/index.ts"
  absolutePath: string;
  depth: number;
}

export interface Edge {
  from: string; // Importer ID
  to: string;   // Imported ID
}

export interface CodebaseGraph {
  rootDir: string;
  nodes: Map<string, CodebaseNode>;
  edges: Edge[];
  externalPackages: Set<string>;
  totalFiles: number;
  totalLines: number;
  totalEstimatedTokens: number;
}

export interface BuildGraphOptions {
  rootDir: string;
  entryFiles?: string[];
  extensions?: string[];
  ignorePatterns?: string[];
}

const DEFAULT_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const DEFAULT_IGNORE = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.turbo',
  '.gemini',
  'vendor'
];

/**
 * Builds a comprehensive module dependency graph for a codebase root directory.
 */
export function buildGraph(options: BuildGraphOptions): CodebaseGraph {
  const rootDir = path.resolve(options.rootDir);
  const extensions = options.extensions || DEFAULT_EXTENSIONS;
  const ignoreSet = new Set([...DEFAULT_IGNORE, ...(options.ignorePatterns || [])]);

  const nodes = new Map<string, CodebaseNode>();
  const edges: Edge[] = [];
  const externalPackages = new Set<string>();

  const filesToProcess: string[] = [];

  if (options.entryFiles && options.entryFiles.length > 0) {
    for (const entry of options.entryFiles) {
      const absPath = path.resolve(rootDir, entry);
      if (fs.existsSync(absPath)) {
        filesToProcess.push(absPath);
      }
    }
  } else {
    collectFiles(rootDir, rootDir, extensions, ignoreSet, filesToProcess);
  }

  let totalLines = 0;
  let totalEstimatedTokens = 0;

  for (const filePath of filesToProcess) {
    const relPath = normalizePath(path.relative(rootDir, filePath));
    if (nodes.has(relPath)) continue;

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const info = parseModuleImports(filePath, content, rootDir);

      const node: CodebaseNode = {
        ...info,
        id: relPath,
        absolutePath: filePath,
        depth: 0
      };

      nodes.set(relPath, node);
      totalLines += info.lineCount;
      totalEstimatedTokens += info.estimatedTokens;

      for (const extPkg of info.externalImports) {
        externalPackages.add(extPkg);
      }

      for (const importedRelPath of info.internalImports) {
        edges.push({ from: relPath, to: importedRelPath });
      }
    } catch {
      // Ignore unreadable or binary files
    }
  }

  // Assign depths using entry nodes or root-most nodes
  computeNodeDepths(nodes, edges);

  return {
    rootDir,
    nodes,
    edges,
    externalPackages,
    totalFiles: nodes.size,
    totalLines,
    totalEstimatedTokens
  };
}

function collectFiles(
  currentDir: string,
  rootDir: string,
  extensions: string[],
  ignoreSet: Set<string>,
  result: string[]
) {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    const relName = entry.name;

    if (ignoreSet.has(relName)) continue;

    if (entry.isDirectory()) {
      collectFiles(fullPath, rootDir, extensions, ignoreSet, result);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (extensions.includes(ext)) {
        result.push(fullPath);
      }
    }
  }
}

function computeNodeDepths(nodes: Map<string, CodebaseNode>, edges: Edge[]) {
  const inDegree = new Map<string, number>();
  for (const id of nodes.keys()) {
    inDegree.set(id, 0);
  }
  for (const edge of edges) {
    if (inDegree.has(edge.to)) {
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
    }
  }

  // Queue nodes with 0 in-degree (entrypoints/top-level modules)
  const queue: Array<{ id: string; depth: number }> = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) {
      queue.push({ id, depth: 0 });
    }
  }

  while (queue.length > 0) {
    const item = queue.shift()!;
    const node = nodes.get(item.id);
    if (!node) continue;
    node.depth = Math.max(node.depth, item.depth);

    for (const edge of edges) {
      if (edge.from === item.id) {
        queue.push({ id: edge.to, depth: item.depth + 1 });
      }
    }
  }
}
