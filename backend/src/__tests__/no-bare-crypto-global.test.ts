/**
 * Guard — no file under `src/` may use the bare `crypto.` global.
 *
 * Why this exists
 * ---------------
 * `globalThis.crypto` (the WebCrypto global) does **not** exist on Node 18 —
 * the exact major `backend/Dockerfile` ships in both stages
 * (`FROM node:18-alpine`). A service that calls `crypto.randomUUID()` while
 * relying on that global therefore throws
 * `ReferenceError: crypto is not defined` in production, even though it passes
 * on Node 20+ (where the global exists) — a portability bug that only the CI
 * matrix catches, never a local run.
 *
 * The fix is to import the built-in module explicitly
 * (`import crypto from 'crypto'`), whose `randomUUID` exists on Node 14.17+ and
 * which is independent of any version-specific global.
 *
 * How it works
 * ------------
 * The scan parses each file into an AST (not raw text) and flags any
 * `crypto.<member>` access whose object is the bare identifier `crypto`, unless
 * the file also introduces its own `crypto` binding (an import, or a local
 * declaration). Because it is AST-based, comments and string literals that
 * merely *mention* `crypto` (e.g. "Mock crypto.randomUUID for deterministic
 * IDs") never produce false positives.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

/** Root of the compiled source tree (`<repo>/backend/src`). */
const SRC_ROOT = path.resolve(__dirname, '..');

/** Recursively list every non-declaration `.ts` file under `dir`. */
function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * True when `node` is an identifier that *introduces* a binding named `crypto`
 * (as opposed to merely reading the global). Covers:
 *   - `import crypto from 'crypto'`            (ImportClause name)
 *   - `import * as crypto from 'crypto'`       (NamespaceImport)
 *   - `import { crypto } from 'crypto'`        (ImportSpecifier)
 *   - `const|let|var crypto = …`               (VariableDeclaration name)
 *   - function/class parameters and declarations, destructuring bindings
 */
function isCryptoBindingName(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent) return false;
  return (
    (ts.isVariableDeclaration(parent) && parent.name === node) ||
    ts.isParameter(parent) ||
    (ts.isFunctionDeclaration(parent) && parent.name === node) ||
    (ts.isFunctionExpression(parent) && parent.name === node) ||
    (ts.isClassDeclaration(parent) && parent.name === node) ||
    (ts.isClassExpression(parent) && parent.name === node) ||
    ts.isBindingElement(parent) ||
    ts.isImportClause(parent) ||
    ts.isImportSpecifier(parent) ||
    ts.isNamespaceImport(parent)
  );
}

interface FileFacts {
  /** Every `crypto.<member>` access whose object is the bare identifier `crypto`. */
  memberAccesses: Array<{ line: number; text: string }>;
  /** Whether the file introduces its own `crypto` binding. */
  hasCryptoBinding: boolean;
}

/** Collect the facts we need from a parsed source file in a single walk. */
function analyse(sourceFile: ts.SourceFile): FileFacts {
  const memberAccesses: Array<{ line: number; text: string }> = [];
  let hasCryptoBinding = false;

  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'crypto'
    ) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      memberAccesses.push({ line: line + 1, text: node.getText(sourceFile) });
    }
    if (ts.isIdentifier(node) && node.text === 'crypto' && isCryptoBindingName(node)) {
      hasCryptoBinding = true;
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return { memberAccesses, hasCryptoBinding };
}

describe('crypto global — static import guard (Node 18 portability)', () => {
  const files = listSourceFiles(SRC_ROOT);

  it('sanity: the sweep enumerates the source tree (fails loudly if it goes empty)', () => {
    expect(files.length).toBeGreaterThan(50);
    const relatives = files.map((f) => path.relative(SRC_ROOT, f));
    // The five files this guard was written for must be in scope.
    expect(relatives).toContain('services/sharingService.ts');
    expect(relatives).toContain('services/achievementService.ts');
  });

  it('no file accesses `crypto.` without declaring a crypto binding', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      const { memberAccesses, hasCryptoBinding } = analyse(sourceFile);
      if (memberAccesses.length === 0 || hasCryptoBinding) continue;
      const rel = path.relative(SRC_ROOT, file);
      offenders.push(
        `${rel} → ${memberAccesses.map((a) => `:${a.line} ${a.text}`).join(', ')}`,
      );
    }
    expect(offenders).toEqual([]);
  });

  it('pins the five Node-18 services to an explicit crypto import (regression pin)', () => {
    const pinned = [
      'services/sharingService.ts',
      'services/challengesService.ts',
      'services/achievementService.ts',
      'services/friendsService.ts',
      'services/messagingService.ts',
    ];
    for (const rel of pinned) {
      const source = fs.readFileSync(path.join(SRC_ROOT, rel), 'utf8');
      expect(source).toMatch(/^import crypto from '(node:)?crypto';$/m);
    }
  });
});
