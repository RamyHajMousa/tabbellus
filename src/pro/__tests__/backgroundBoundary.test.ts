/**
 * Background Boundary & Static Import Graph Guard (R4, T5)
 *
 * Enforces that src/pro/background.ts never reaches React, ReactDOM, Zustand,
 * `@/store/*`, or any `.tsx` UI components in its static import graph.
 *
 * Also audits src/background/index.ts to report baseline before Phase 2.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export interface WalkResult {
  entryFile: string;
  visitedFiles: string[];
  externalDependencies: string[];
  violations: {
    from: string;
    specifier: string;
    resolved?: string;
    rule: string;
  }[];
}

export function walkImportGraph(entryRelativePath: string, rootDir = process.cwd()): WalkResult {
  const entryFullPath = path.resolve(rootDir, entryRelativePath);
  const visitedFiles = new Set<string>();
  const externalDependencies = new Set<string>();
  const violations: WalkResult['violations'] = [];
  const queue: string[] = [entryFullPath];

  const FORBIDDEN_PACKAGES = ['react', 'react-dom', 'zustand'];

  function resolveModule(fromFile: string, specifier: string): string | null {
    // Check forbidden packages
    for (const pkg of FORBIDDEN_PACKAGES) {
      if (specifier === pkg || specifier.startsWith(`${pkg}/`)) {
        violations.push({
          from: path.relative(rootDir, fromFile).replace(/\\/g, '/'),
          specifier,
          rule: `Forbidden dependency: ${pkg}`,
        });
        return null;
      }
    }

    // Check @/store/*
    if (specifier === '@/store' || specifier.startsWith('@/store/')) {
      violations.push({
        from: path.relative(rootDir, fromFile).replace(/\\/g, '/'),
        specifier,
        rule: 'Forbidden import: @/store/*',
      });
      return null;
    }

    let candidatePath: string | null = null;
    if (specifier.startsWith('@/')) {
      candidatePath = path.resolve(rootDir, 'src', specifier.slice(2));
    } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
      candidatePath = path.resolve(path.dirname(fromFile), specifier);
    } else {
      // External dependency (e.g. dexie, webcrypto)
      externalDependencies.add(specifier);
      return null;
    }

    // Resolve extension or index
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

    const relCurrent = path.relative(rootDir, currentFile).replace(/\\/g, '/');

    // Rule: no .tsx file
    if (currentFile.endsWith('.tsx')) {
      violations.push({
        from: relCurrent,
        specifier: currentFile,
        rule: 'Forbidden .tsx file in import graph',
      });
    }

    // Rule: no file inside src/store/
    if (relCurrent.startsWith('src/store/')) {
      violations.push({
        from: relCurrent,
        specifier: currentFile,
        rule: 'Forbidden file inside src/store/',
      });
    }

    let content: string;
    try {
      content = fs.readFileSync(currentFile, 'utf-8');
    } catch {
      continue;
    }

    const sourceFile = ts.createSourceFile(
      currentFile,
      content,
      ts.ScriptTarget.Latest,
      true,
    );

    function visitNode(node: ts.Node) {
      let specifier: string | undefined;

      if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        specifier = node.moduleSpecifier.text;
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        specifier = node.moduleSpecifier.text;
      }

      if (specifier) {
        const resolved = resolveModule(currentFile, specifier);
        if (resolved) {
          const relResolved = path.relative(rootDir, resolved).replace(/\\/g, '/');
          if (relResolved.endsWith('.tsx')) {
            violations.push({
              from: relCurrent,
              specifier,
              resolved: relResolved,
              rule: 'Forbidden import of .tsx file',
            });
          }
          if (relResolved.startsWith('src/store/')) {
            violations.push({
              from: relCurrent,
              specifier,
              resolved: relResolved,
              rule: 'Forbidden import inside src/store/',
            });
          }
          if (!visitedFiles.has(resolved)) {
            queue.push(resolved);
          }
        }
      }

      ts.forEachChild(node, visitNode);
    }

    visitNode(sourceFile);
  }

  return {
    entryFile: entryRelativePath,
    visitedFiles: Array.from(visitedFiles).map((f) => path.relative(rootDir, f).replace(/\\/g, '/')),
    externalDependencies: Array.from(externalDependencies),
    violations,
  };
}

describe('Background Boundary & Import Graph Guard (R4 / T5)', () => {
  it('T5: src/pro/background.ts static import graph never reaches react, react-dom, zustand, @/store/*, or any .tsx file', () => {
    const result = walkImportGraph('src/pro/background.ts');
    expect(result.violations).toEqual([]);
  });

  it('Baseline report: walks src/background/index.ts and reports graph and any forbidden matches', () => {
    const result = walkImportGraph('src/background/index.ts');
    console.log('\n--- BASELINE IMPORT GRAPH REPORT FOR src/background/index.ts ---');
    console.log(`Visited files count: ${result.visitedFiles.length}`);
    console.log('Visited files:', result.visitedFiles);
    console.log('External dependencies:', result.externalDependencies);
    console.log('Violations / findings count:', result.violations.length);
    console.log('Violations / findings:', result.violations);
    console.log('--- END OF BASELINE REPORT ---\n');

    expect(result.visitedFiles.length).toBeGreaterThan(0);
  });
});
