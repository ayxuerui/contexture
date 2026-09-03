/**
 * browse-navigation-by-folder design.md D2: notes and published pages are
 * both addressed by `/`-separated relative strings, so one primitive builds
 * both trees. Folder collapsing has exactly one set of edge cases — a leaf
 * at the root, a directory sharing a name with a sibling leaf, a directory
 * whose only child is another directory — and handling them once means the
 * two areas cannot disagree about the shape of the store.
 */

export interface TreeLeaf {
  kind: 'leaf';
  /** The entry's own last path segment, which is what orders it among its siblings. */
  name: string;
  /** The full `/`-separated path this leaf was built from, unchanged. */
  path: string;
  label: string;
  href: string;
}

export interface TreeDirectory {
  kind: 'directory';
  name: string;
  /** The full `/`-separated path of this directory, for a stable node key. */
  path: string;
  children: TreeNode[];
}

export type TreeNode = TreeDirectory | TreeLeaf;

interface DirectoryBuilder {
  path: string;
  directories: Map<string, DirectoryBuilder>;
  leaves: TreeLeaf[];
}

/**
 * Directories before leaves, then by codepoint — the same ordering
 * `listNotes()` and `publishPages()` already produce, so the tree is a
 * regrouping of a sorted enumeration rather than a reordering of it.
 */
function compareNodes(a: TreeNode, b: TreeNode): number {
  if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
  if (a.name < b.name) return -1;
  if (a.name > b.name) return 1;
  return 0;
}

function finalize(builder: DirectoryBuilder): TreeNode[] {
  const directories = [...builder.directories.entries()].map(
    ([name, child]): TreeDirectory => ({ kind: 'directory', name, path: child.path, children: finalize(child) }),
  );
  return [...directories, ...builder.leaves].sort(compareNodes);
}

/**
 * Groups `paths` by their directory segments, to the full depth they carry.
 * A path with no directory segment becomes a leaf at the top level. The
 * result is deterministic for a given set of paths, whatever order they
 * arrive in.
 */
export function buildPathTree(
  paths: readonly string[],
  labelFor: (path: string) => string,
  hrefFor: (path: string) => string,
): TreeNode[] {
  const root: DirectoryBuilder = { path: '', directories: new Map(), leaves: [] };

  for (const entryPath of paths) {
    const segments = entryPath.split('/').filter((segment) => segment.length > 0);
    const name = segments.pop();
    if (name === undefined) continue;

    let node = root;
    for (const segment of segments) {
      let child = node.directories.get(segment);
      if (!child) {
        child = { path: node.path ? `${node.path}/${segment}` : segment, directories: new Map(), leaves: [] };
        node.directories.set(segment, child);
      }
      node = child;
    }
    node.leaves.push({ kind: 'leaf', name, path: entryPath, label: labelFor(entryPath), href: hrefFor(entryPath) });
  }

  return finalize(root);
}
