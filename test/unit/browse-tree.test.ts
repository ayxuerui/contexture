import { describe, expect, it } from 'vitest';
import { buildPathTree, type TreeDirectory, type TreeNode } from '../../src/core/browse/tree.js';

const label = (p: string): string => `label:${p}`;
const href = (p: string): string => `/x/${p}`;

function tree(paths: readonly string[]): TreeNode[] {
  return buildPathTree(paths, label, href);
}

function directory(node: TreeNode | undefined): TreeDirectory {
  if (!node || node.kind !== 'directory') throw new Error(`expected a directory, got ${node?.kind ?? 'nothing'}`);
  return node;
}

/** A compact shape of the tree, for asserting structure without repeating every field. */
function shape(nodes: readonly TreeNode[]): unknown[] {
  return nodes.map((node) => (node.kind === 'directory' ? { dir: node.name, children: shape(node.children) } : node.name));
}

describe('buildPathTree', () => {
  it('places a path with no directory segment as a leaf at the top level', () => {
    const nodes = tree(['root-note.md']);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toEqual({
      kind: 'leaf',
      name: 'root-note.md',
      path: 'root-note.md',
      label: 'label:root-note.md',
      href: '/x/root-note.md',
    });
  });

  it('nests a leaf under every directory segment its path carries', () => {
    const nodes = tree(['folder-a/folder-b/folder-c/deep.md']);
    expect(shape(nodes)).toEqual([
      { dir: 'folder-a', children: [{ dir: 'folder-b', children: [{ dir: 'folder-c', children: ['deep.md'] }] }] },
    ]);

    const a = directory(nodes[0]);
    const b = directory(a.children[0]);
    const c = directory(b.children[0]);
    expect([a.path, b.path, c.path]).toEqual(['folder-a', 'folder-a/folder-b', 'folder-a/folder-b/folder-c']);
    expect(c.children[0]).toMatchObject({ kind: 'leaf', path: 'folder-a/folder-b/folder-c/deep.md', href: '/x/folder-a/folder-b/folder-c/deep.md' });
  });

  it('collapses two leaves sharing a directory prefix into one directory node', () => {
    const nodes = tree(['folder-a/one.md', 'folder-a/two.md']);
    expect(shape(nodes)).toEqual([{ dir: 'folder-a', children: ['one.md', 'two.md'] }]);
  });

  it('keeps a directory whose only child is another directory', () => {
    const nodes = tree(['folder-a/folder-b/only.md']);
    expect(shape(nodes)).toEqual([{ dir: 'folder-a', children: [{ dir: 'folder-b', children: ['only.md'] }] }]);
  });

  it('keeps a directory and a sibling leaf of the same name separate, directory first', () => {
    const nodes = tree(['same-name', 'same-name/inside.md']);
    expect(shape(nodes)).toEqual([{ dir: 'same-name', children: ['inside.md'] }, 'same-name']);
    expect(nodes[0]!.kind).toBe('directory');
    expect(nodes[1]!.kind).toBe('leaf');
  });

  it('orders directories before leaves at every level', () => {
    const nodes = tree(['zzz-folder/inside.md', 'aaa-leaf.md']);
    expect(shape(nodes)).toEqual([{ dir: 'zzz-folder', children: ['inside.md'] }, 'aaa-leaf.md']);
  });

  it('produces the same tree whatever order the paths arrive in', () => {
    const paths = ['folder-b/two.md', 'root.md', 'folder-a/folder-c/three.md', 'folder-a/one.md'];
    expect(shape(tree(paths))).toEqual(shape(tree([...paths].reverse())));
    expect(shape(tree(paths))).toEqual([
      { dir: 'folder-a', children: [{ dir: 'folder-c', children: ['three.md'] }, 'one.md'] },
      { dir: 'folder-b', children: ['two.md'] },
      'root.md',
    ]);
  });

  it('returns nothing for an empty enumeration', () => {
    expect(tree([])).toEqual([]);
  });
});
