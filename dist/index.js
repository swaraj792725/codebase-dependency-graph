"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  buildGraph: () => buildGraph,
  detectCycles: () => detectCycles,
  normalizePath: () => normalizePath,
  parseModuleImports: () => parseModuleImports,
  pruneContext: () => pruneContext,
  topologicalSort: () => topologicalSort
});
module.exports = __toCommonJS(index_exports);

// src/parser.ts
var path = __toESM(require("path"));
var fs = __toESM(require("fs"));
var SUPPORTED_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"];
function parseModuleImports(filePath, sourceCode, rootDir) {
  const lineCount = sourceCode.split("\n").length;
  const sizeBytes = Buffer.byteLength(sourceCode, "utf8");
  const estimatedTokens = Math.ceil(sourceCode.length / 4);
  const internalImports = /* @__PURE__ */ new Set();
  const externalImports = /* @__PURE__ */ new Set();
  const reExports = /* @__PURE__ */ new Set();
  const exportedSymbols = /* @__PURE__ */ new Set();
  const dirName = path.dirname(filePath);
  const importRegex = /(?:import\s+(?:[\s\S]*?\s+from\s+)?|import\s*)(?:['"]([^'"]+)['"])/g;
  let match;
  while ((match = importRegex.exec(sourceCode)) !== null) {
    const specifier = match[1];
    if (!specifier) continue;
    processSpecifier(specifier, dirName, rootDir, internalImports, externalImports);
  }
  const reExportFromRegex = /export\s+(?:[\s\S]*?\s+from\s+)(?:['"]([^'"]+)['"])/g;
  while ((match = reExportFromRegex.exec(sourceCode)) !== null) {
    const specifier = match[1];
    if (!specifier) continue;
    processSpecifier(specifier, dirName, rootDir, reExports, externalImports);
    processSpecifier(specifier, dirName, rootDir, internalImports, externalImports);
  }
  const dynamicRegex = /(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicRegex.exec(sourceCode)) !== null) {
    const specifier = match[1];
    if (!specifier) continue;
    processSpecifier(specifier, dirName, rootDir, internalImports, externalImports);
  }
  const namedExportRegex = /export\s+(?:async\s+)?(?:const|let|var|function|class|type|interface|enum)\s+([a-zA-Z0-9_$]+)/g;
  while ((match = namedExportRegex.exec(sourceCode)) !== null) {
    if (match[1]) exportedSymbols.add(match[1]);
  }
  if (/export\s+default\b/.test(sourceCode)) {
    exportedSymbols.add("default");
  }
  const exportListRegex = /export\s*\{([^}]+)\}/g;
  while ((match = exportListRegex.exec(sourceCode)) !== null) {
    const list = match[1];
    if (list) {
      list.split(",").forEach((item) => {
        const parts = item.trim().split(/\s+as\s+/);
        const name = parts[parts.length - 1]?.trim();
        if (name) exportedSymbols.add(name);
      });
    }
  }
  return {
    filePath: normalizePath(path.relative(rootDir, filePath)),
    internalImports: Array.from(internalImports),
    externalImports: Array.from(externalImports),
    reExports: Array.from(reExports),
    exportedSymbols: Array.from(exportedSymbols),
    lineCount,
    sizeBytes,
    estimatedTokens
  };
}
function processSpecifier(specifier, dirName, rootDir, internalSet, externalSet) {
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    const resolved = resolveFilePath(path.resolve(dirName, specifier), rootDir);
    if (resolved) {
      internalSet.add(normalizePath(path.relative(rootDir, resolved)));
    }
  } else {
    const pkgName = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
    if (pkgName) {
      externalSet.add(pkgName);
    }
  }
}
function resolveFilePath(targetPath, rootDir) {
  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
    return targetPath;
  }
  const ext = path.extname(targetPath);
  const basePath = ext ? targetPath.slice(0, -ext.length) : targetPath;
  for (const sExt of SUPPORTED_EXTENSIONS) {
    const candidate = basePath + sExt;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  for (const sExt of SUPPORTED_EXTENSIONS) {
    const indexPath = path.join(basePath, `index${sExt}`);
    if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) {
      return indexPath;
    }
  }
  return basePath + (ext || ".ts");
}
function normalizePath(p) {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

// src/graph.ts
var path2 = __toESM(require("path"));
var fs2 = __toESM(require("fs"));
var DEFAULT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
var DEFAULT_IGNORE = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".turbo",
  ".gemini",
  "vendor"
];
function buildGraph(options) {
  const rootDir = path2.resolve(options.rootDir);
  const extensions = options.extensions || DEFAULT_EXTENSIONS;
  const ignoreSet = /* @__PURE__ */ new Set([...DEFAULT_IGNORE, ...options.ignorePatterns || []]);
  const nodes = /* @__PURE__ */ new Map();
  const edges = [];
  const externalPackages = /* @__PURE__ */ new Set();
  const filesToProcess = [];
  if (options.entryFiles && options.entryFiles.length > 0) {
    for (const entry of options.entryFiles) {
      const absPath = path2.resolve(rootDir, entry);
      if (fs2.existsSync(absPath)) {
        filesToProcess.push(absPath);
      }
    }
  } else {
    collectFiles(rootDir, rootDir, extensions, ignoreSet, filesToProcess);
  }
  let totalLines = 0;
  let totalEstimatedTokens = 0;
  for (const filePath of filesToProcess) {
    const relPath = normalizePath(path2.relative(rootDir, filePath));
    if (nodes.has(relPath)) continue;
    try {
      const content = fs2.readFileSync(filePath, "utf8");
      const info = parseModuleImports(filePath, content, rootDir);
      const node = {
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
    }
  }
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
function collectFiles(currentDir, rootDir, extensions, ignoreSet, result) {
  let entries;
  try {
    entries = fs2.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path2.join(currentDir, entry.name);
    const relName = entry.name;
    if (ignoreSet.has(relName)) continue;
    if (entry.isDirectory()) {
      collectFiles(fullPath, rootDir, extensions, ignoreSet, result);
    } else if (entry.isFile()) {
      const ext = path2.extname(entry.name).toLowerCase();
      if (extensions.includes(ext)) {
        result.push(fullPath);
      }
    }
  }
}
function computeNodeDepths(nodes, edges) {
  const inDegree = /* @__PURE__ */ new Map();
  for (const id of nodes.keys()) {
    inDegree.set(id, 0);
  }
  for (const edge of edges) {
    if (inDegree.has(edge.to)) {
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
    }
  }
  const queue = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) {
      queue.push({ id, depth: 0 });
    }
  }
  while (queue.length > 0) {
    const item = queue.shift();
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

// src/analyzer.ts
var fs3 = __toESM(require("fs"));
function topologicalSort(graph) {
  const depCount = /* @__PURE__ */ new Map();
  const dependentsMap = /* @__PURE__ */ new Map();
  for (const id of graph.nodes.keys()) {
    depCount.set(id, 0);
    dependentsMap.set(id, []);
  }
  for (const [id, node] of graph.nodes.entries()) {
    for (const depId of node.internalImports) {
      if (graph.nodes.has(depId)) {
        depCount.set(id, (depCount.get(id) || 0) + 1);
        const list = dependentsMap.get(depId) || [];
        list.push(id);
        dependentsMap.set(depId, list);
      }
    }
  }
  const queue = [];
  for (const [id, count] of depCount.entries()) {
    if (count === 0) {
      queue.push(id);
    }
  }
  const sortedIds = [];
  while (queue.length > 0) {
    const u = queue.shift();
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
function detectCycles(graph) {
  const cycles = [];
  const visited = /* @__PURE__ */ new Map();
  for (const id of graph.nodes.keys()) {
    visited.set(id, "unvisited");
  }
  function dfs(u, stack) {
    visited.set(u, "visiting");
    stack.push(u);
    const node = graph.nodes.get(u);
    if (node) {
      for (const v of node.internalImports) {
        if (!graph.nodes.has(v)) continue;
        const state = visited.get(v);
        if (state === "visiting") {
          const cycleStartIndex = stack.indexOf(v);
          if (cycleStartIndex !== -1) {
            const cyclePath = [...stack.slice(cycleStartIndex), v];
            cycles.push({ cycle: cyclePath });
          }
        } else if (state === "unvisited") {
          dfs(v, stack);
        }
      }
    }
    stack.pop();
    visited.set(u, "visited");
  }
  for (const id of graph.nodes.keys()) {
    if (visited.get(id) === "unvisited") {
      dfs(id, []);
    }
  }
  return cycles;
}
function pruneContext(graph, options = {}) {
  const format = options.format || "xml";
  const includeContent = options.includeContent ?? true;
  const maxTokenBudget = options.maxTokenBudget || Number.POSITIVE_INFINITY;
  const reachableSet = /* @__PURE__ */ new Set();
  if (options.entryPoints && options.entryPoints.length > 0) {
    const queue = [];
    for (const entry of options.entryPoints) {
      const normEntry = entry.replace(/\\/g, "/").replace(/^\.\//, "");
      if (graph.nodes.has(normEntry)) {
        queue.push(normEntry);
      }
    }
    while (queue.length > 0) {
      const curr = queue.shift();
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
  const reachableFiles = [];
  const omittedFiles = [];
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
function formatOutput(graph, reachableFiles, omittedFiles, format, includeContent, accumulatedTokens, maxTokenBudget) {
  if (format === "json") {
    return JSON.stringify(
      {
        totalFiles: reachableFiles.length,
        totalTokens: accumulatedTokens,
        maxTokenBudget: maxTokenBudget === Number.POSITIVE_INFINITY ? null : maxTokenBudget,
        externalPackages: Array.from(graph.externalPackages),
        files: reachableFiles.map((f) => ({
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
  if (format === "markdown") {
    const lines2 = [];
    lines2.push(`# Codebase Dependency Graph Context`);
    lines2.push(`- **Total Reachable Modules**: ${reachableFiles.length}`);
    lines2.push(`- **Estimated Tokens**: ~${accumulatedTokens}`);
    lines2.push(`- **External Dependencies**: ${Array.from(graph.externalPackages).join(", ") || "None"}`);
    lines2.push(``);
    lines2.push(`## Topological Dependency Module List`);
    for (const file of reachableFiles) {
      lines2.push(`### \`${file.id}\``);
      lines2.push(`- **Lines**: ${file.lineCount} | **Tokens**: ~${file.estimatedTokens}`);
      if (file.exportedSymbols.length > 0) {
        lines2.push(`- **Exported Symbols**: \`${file.exportedSymbols.join("`, `")}\``);
      }
      if (file.internalImports.length > 0) {
        lines2.push(`- **Imports Internal**: \`${file.internalImports.join("`, `")}\``);
      }
      if (includeContent) {
        lines2.push(``);
        lines2.push(`\`\`\`typescript`);
        try {
          lines2.push(fs3.readFileSync(file.absolutePath, "utf8"));
        } catch {
          lines2.push(`// Could not read file content`);
        }
        lines2.push(`\`\`\``);
      }
      lines2.push(``);
    }
    return lines2.join("\n");
  }
  const lines = [];
  lines.push(`<codebase_dependency_context>`);
  lines.push(`  <summary>`);
  lines.push(`    <total_reachable_files>${reachableFiles.length}</total_reachable_files>`);
  lines.push(`    <estimated_tokens>${accumulatedTokens}</estimated_tokens>`);
  lines.push(`    <external_packages>${Array.from(graph.externalPackages).join(", ")}</external_packages>`);
  lines.push(`  </summary>`);
  lines.push(`  <modules_topological_order>`);
  for (const file of reachableFiles) {
    lines.push(`    <module path="${file.id}" lines="${file.lineCount}" tokens="${file.estimatedTokens}">`);
    if (file.exportedSymbols.length > 0) {
      lines.push(`      <exports>${file.exportedSymbols.join(", ")}</exports>`);
    }
    if (file.internalImports.length > 0) {
      lines.push(`      <imports>${file.internalImports.join(", ")}</imports>`);
    }
    if (includeContent) {
      lines.push(`      <content>`);
      try {
        lines.push(fs3.readFileSync(file.absolutePath, "utf8"));
      } catch {
        lines.push(`// Could not read file content`);
      }
      lines.push(`      </content>`);
    }
    lines.push(`    </module>`);
  }
  lines.push(`  </modules_topological_order>`);
  lines.push(`</codebase_dependency_context>`);
  return lines.join("\n");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildGraph,
  detectCycles,
  normalizePath,
  parseModuleImports,
  pruneContext,
  topologicalSort
});
