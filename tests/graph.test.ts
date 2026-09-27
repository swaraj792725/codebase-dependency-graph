import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { parseModuleImports, buildGraph, topologicalSort, detectCycles, pruneContext } from '../src/index.js';

describe('codebase-dependency-graph', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-graph-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses imports, exports, and re-exports accurately', () => {
    const code = `
      import { mathHelper } from './utils/math.js';
      import express from 'express';
      export { calculateTotal } from './utils/calculator.js';
      export const API_VERSION = 'v1';
      export default class App {}
    `;

    const info = parseModuleImports(path.join(tmpDir, 'src/index.ts'), code, tmpDir);

    expect(info.internalImports).toContain('src/utils/math.js');
    expect(info.internalImports).toContain('src/utils/calculator.js');
    expect(info.externalImports).toContain('express');
    expect(info.exportedSymbols).toContain('calculateTotal');
    expect(info.exportedSymbols).toContain('API_VERSION');
    expect(info.exportedSymbols).toContain('default');
  });

  it('builds dependency graph and performs topological sorting', () => {
    // Create files: math.ts -> logger.ts (math depends on logger)
    // app.ts -> math.ts
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(path.join(srcDir, 'utils'), { recursive: true });

    fs.writeFileSync(
      path.join(srcDir, 'utils', 'logger.ts'),
      `export function log(msg: string) { console.log(msg); }`
    );

    fs.writeFileSync(
      path.join(srcDir, 'utils', 'math.ts'),
      `import { log } from './logger.js';\nexport function add(a: number, b: number) { log('adding'); return a + b; }`
    );

    fs.writeFileSync(
      path.join(srcDir, 'app.ts'),
      `import { add } from './utils/math.js';\nconsole.log(add(1, 2));`
    );

    const graph = buildGraph({ rootDir: tmpDir });
    expect(graph.nodes.size).toBe(3);

    const { sortedIds, hasCycle } = topologicalSort(graph);
    expect(hasCycle).toBe(false);

    // logger.ts has no internal dependencies, math.ts depends on logger.ts, app.ts depends on math.ts
    const loggerIdx = sortedIds.indexOf('src/utils/logger.ts');
    const mathIdx = sortedIds.indexOf('src/utils/math.ts');
    const appIdx = sortedIds.indexOf('src/app.ts');

    expect(loggerIdx).toBeLessThan(mathIdx);
    expect(mathIdx).toBeLessThan(appIdx);
  });

  it('detects circular dependencies correctly', () => {
    // a.ts -> b.ts -> a.ts
    fs.writeFileSync(path.join(tmpDir, 'a.ts'), `import './b.js'; export const A = 1;`);
    fs.writeFileSync(path.join(tmpDir, 'b.ts'), `import './a.js'; export const B = 2;`);

    const graph = buildGraph({ rootDir: tmpDir });
    const cycles = detectCycles(graph);

    expect(cycles.length).toBeGreaterThan(0);
    expect(cycles[0].cycle).toContain('a.ts');
    expect(cycles[0].cycle).toContain('b.ts');
  });

  it('prunes context reachable from entry point and enforces token budget', () => {
    fs.writeFileSync(path.join(tmpDir, 'dep1.ts'), `export const D1 = 'dep1';`);
    fs.writeFileSync(path.join(tmpDir, 'dep2.ts'), `export const D2 = 'dep2';`);
    fs.writeFileSync(
      path.join(tmpDir, 'main.ts'),
      `import { D1 } from './dep1.js';\nimport { D2 } from './dep2.js';`
    );
    // Unused orphaned file
    fs.writeFileSync(path.join(tmpDir, 'orphan.ts'), `export const ORPHAN = true;`);

    const graph = buildGraph({ rootDir: tmpDir });
    const result = pruneContext(graph, { entryPoints: ['main.ts'], format: 'xml' });

    const reachableIds = result.reachableFiles.map(f => f.id);
    expect(reachableIds).toContain('main.ts');
    expect(reachableIds).toContain('dep1.ts');
    expect(reachableIds).toContain('dep2.ts');
    expect(reachableIds).not.toContain('orphan.ts');

    expect(result.formattedOutput).toContain('<codebase_dependency_context>');
    expect(result.formattedOutput).toContain('module path="main.ts"');
  });
});
