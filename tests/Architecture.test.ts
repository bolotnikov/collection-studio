import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

function sources(folder: string): string[] {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(folder, entry.name);
    return entry.isDirectory() ? sources(file) : /\.tsx?$/.test(file) ? [file] : [];
  });
}
describe('application dependency rules', () => {
  it('keeps domain, application and shared contracts free of outward implementation dependencies', () => {
    const violations: string[] = [];
    for (const layer of ['domain', 'application', 'shared'])
      for (const file of sources(`src/${layer}`)) {
        const tree = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
        for (const node of tree.statements)
          if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
            const target = node.moduleSpecifier.text;
            if (
              /(infrastructure|renderer|preload|\/main\/)/.test(target) ||
              /^(electron|react|openai)(\/|$)/.test(target) ||
              (layer === 'domain' && target.includes('application')) ||
              (layer === 'shared' && /(application|domain)/.test(target))
            )
              violations.push(`${file} -> ${target}`);
          }
      }
    expect(violations).toEqual([]);
  });
  it('keeps transport access at the renderer composition root rather than in views', () => {
    const violations = sources('src/renderer/src')
      .filter((file) => !file.endsWith('/main.tsx') && !file.endsWith('.d.ts'))
      .filter((file) => /window\.studio/.test(fs.readFileSync(file, 'utf8')));
    expect(violations).toEqual([]);
  });
});
