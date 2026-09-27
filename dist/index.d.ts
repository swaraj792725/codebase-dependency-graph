interface ModuleImportInfo {
    filePath: string;
    internalImports: string[];
    externalImports: string[];
    reExports: string[];
    exportedSymbols: string[];
    lineCount: number;
    sizeBytes: number;
    estimatedTokens: number;
}
/**
 * Parses source code to extract internal relative imports, external dependencies, and exported symbols.
 */
declare function parseModuleImports(filePath: string, sourceCode: string, rootDir: string): ModuleImportInfo;
declare function normalizePath(p: string): string;

interface CodebaseNode extends ModuleImportInfo {
    id: string;
    absolutePath: string;
    depth: number;
}
interface Edge {
    from: string;
    to: string;
}
interface CodebaseGraph {
    rootDir: string;
    nodes: Map<string, CodebaseNode>;
    edges: Edge[];
    externalPackages: Set<string>;
    totalFiles: number;
    totalLines: number;
    totalEstimatedTokens: number;
}
interface BuildGraphOptions {
    rootDir: string;
    entryFiles?: string[];
    extensions?: string[];
    ignorePatterns?: string[];
}
/**
 * Builds a comprehensive module dependency graph for a codebase root directory.
 */
declare function buildGraph(options: BuildGraphOptions): CodebaseGraph;

interface CircularCycle {
    cycle: string[];
}
interface PrunedContextResult {
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
declare function topologicalSort(graph: CodebaseGraph): {
    sortedIds: string[];
    hasCycle: boolean;
};
/**
 * Detects circular dependency cycles using DFS stack inspection.
 */
declare function detectCycles(graph: CodebaseGraph): CircularCycle[];
interface PruneOptions {
    entryPoints?: string[];
    maxTokenBudget?: number;
    format?: 'xml' | 'markdown' | 'json';
    includeContent?: boolean;
}
/**
 * Prunes the dependency graph to only include reachable modules from entry files, sorted topologically, within a token budget.
 */
declare function pruneContext(graph: CodebaseGraph, options?: PruneOptions): PrunedContextResult;

export { type BuildGraphOptions, type CircularCycle, type CodebaseGraph, type CodebaseNode, type Edge, type ModuleImportInfo, type PruneOptions, type PrunedContextResult, buildGraph, detectCycles, normalizePath, parseModuleImports, pruneContext, topologicalSort };
