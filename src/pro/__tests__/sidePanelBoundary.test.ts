/**
 * Side Panel Boundary & Static Import Graph Guard (Commit B, B7)
 *
 * Verifies that src/pro/index.ts (the side-panel entry point) does NOT statically
 * or transitively import `src/pro/sync/engine/syncEngine.ts`.
 *
 * The background service worker is the sole owner of the sync engine.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

function walkGraph(entryRelativePath: string, rootDir = process.cwd()): string[] {
  const entryFullPath = path.resolve(rootDir, entryRelativePath);
  const visitedFiles = new Set<string>();
  const queue: string[] = [entryFullPath];

  function resolveModule(fromFile: string, specifier: string): string | null {
    let candidatePath: string | null = null;
    if (specifier.startsWith('@/')) {
      candidatePath = path.resolve(rootDir, 'src', specifier.slice(2));
    } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
      candidatePath = path.resolve(path.dirname(fromFile), specifier);
    } else {
      // External npm package
      return null;
    }

    const extensions = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];
    for (const ext of extensions) {
      const full = candidatePath + ext;
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        return path.normalize(full);
      }
    }
    return null;
  }

  while (queue.length > 0) {
    const currentFile = queue.shift()!;
    if (visitedFiles.has(currentFile)) continue;
    visitedFiles.add(currentFile);

    const sourceText = fs.readFileSync(currentFile, 'utf-8');
    const sourceFile = ts.createSourceFile(
      currentFile,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
    );

    ts.forEachChild(sourceFile, (node) => {
      let specifier: string | null = null;
      if (
        ts.isImportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        specifier = node.moduleSpecifier.text;
      } else if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        specifier = node.moduleSpecifier.text;
      }

      if (specifier) {
        const resolved = resolveModule(currentFile, specifier);
        if (resolved && !visitedFiles.has(resolved)) {
          queue.push(resolved);
        }
      }
    });
  }

  return Array.from(visitedFiles).map((f) =>
    path.relative(rootDir, f).replace(/\\/g, '/'),
  );
}

describe('Side Panel Boundary Guard (Commit B, B7)', () => {
  it('src/pro/index.ts must NEVER import or reach syncEngine.ts', () => {
    const visited = walkGraph('src/pro/index.ts');
    const reachesSyncEngine = visited.some((file) =>
      file.endsWith('sync/engine/syncEngine.ts') || file.endsWith('sync/engine/syncEngine'),
    );

    expect(
      reachesSyncEngine,
      `Violation: src/pro/index.ts reaches syncEngine.ts!\nVisited files:\n${visited.join('\n')}`,
    ).toBe(false);
  });
});
