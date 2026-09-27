import * as path from 'node:path';
import * as fs from 'node:fs';

export interface ModuleImportInfo {
  filePath: string;
  internalImports: string[];
  externalImports: string[];
  reExports: string[];
  exportedSymbols: string[];
  lineCount: number;
  sizeBytes: number;
  estimatedTokens: number;
}

const SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];

/**
 * Parses source code to extract internal relative imports, external dependencies, and exported symbols.
 */
export function parseModuleImports(filePath: string, sourceCode: string, rootDir: string): ModuleImportInfo {
  const lineCount = sourceCode.split('\n').length;
  const sizeBytes = Buffer.byteLength(sourceCode, 'utf8');
  const estimatedTokens = Math.ceil(sourceCode.length / 4);

  const internalImports = new Set<string>();
  const externalImports = new Set<string>();
  const reExports = new Set<string>();
  const exportedSymbols = new Set<string>();

  const dirName = path.dirname(filePath);

  // 1. Match imports: import ... from 'specifier' or import 'specifier'
  const importRegex = /(?:import\s+(?:[\s\S]*?\s+from\s+)?|import\s*)(?:['"]([^'"]+)['"])/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(sourceCode)) !== null) {
    const specifier = match[1];
    if (!specifier) continue;
    processSpecifier(specifier, dirName, rootDir, internalImports, externalImports);
  }

  // 2. Match re-exports: export ... from 'specifier'
  const reExportFromRegex = /export\s+(?:[\s\S]*?\s+from\s+)(?:['"]([^'"]+)['"])/g;
  while ((match = reExportFromRegex.exec(sourceCode)) !== null) {
    const specifier = match[1];
    if (!specifier) continue;
    processSpecifier(specifier, dirName, rootDir, reExports, externalImports);
    processSpecifier(specifier, dirName, rootDir, internalImports, externalImports);
  }

  // 3. Match require & dynamic import: require('specifier') or import('specifier')
  const dynamicRegex = /(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicRegex.exec(sourceCode)) !== null) {
    const specifier = match[1];
    if (!specifier) continue;
    processSpecifier(specifier, dirName, rootDir, internalImports, externalImports);
  }

  // 4. Extract exported symbols
  const namedExportRegex = /export\s+(?:async\s+)?(?:const|let|var|function|class|type|interface|enum)\s+([a-zA-Z0-9_$]+)/g;
  while ((match = namedExportRegex.exec(sourceCode)) !== null) {
    if (match[1]) exportedSymbols.add(match[1]);
  }

  if (/export\s+default\b/.test(sourceCode)) {
    exportedSymbols.add('default');
  }

  const exportListRegex = /export\s*\{([^}]+)\}/g;
  while ((match = exportListRegex.exec(sourceCode)) !== null) {
    const list = match[1];
    if (list) {
      list.split(',').forEach(item => {
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

function processSpecifier(
  specifier: string,
  dirName: string,
  rootDir: string,
  internalSet: Set<string>,
  externalSet: Set<string>
) {
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    const resolved = resolveFilePath(path.resolve(dirName, specifier), rootDir);
    if (resolved) {
      internalSet.add(normalizePath(path.relative(rootDir, resolved)));
    }
  } else {
    const pkgName = specifier.startsWith('@')
      ? specifier.split('/').slice(0, 2).join('/')
      : specifier.split('/')[0];
    if (pkgName) {
      externalSet.add(pkgName);
    }
  }
}

function resolveFilePath(targetPath: string, rootDir: string): string | null {
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

  return basePath + (ext || '.ts');
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}
