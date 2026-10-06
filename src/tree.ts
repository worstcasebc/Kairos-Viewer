import type { TaskDto } from './model';

export interface TreeNode {
  task: TaskDto;
  depth: number;
  /** 1-basierte Preorder-Nummer (Nr.-Spalte wie in Kairos). */
  nr: number;
  children: TreeNode[];
}

export interface Tree {
  roots: TreeNode[];
  byId: Map<string, TreeNode>;
  preorder: TreeNode[];
}

export interface VisibleRow {
  node: TreeNode;
  hasChildren: boolean;
  collapsed: boolean;
}

function compareTasks(a: TaskDto, b: TaskDto): number {
  if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildTree(tasks: TaskDto[]): Tree {
  const ids = new Set(tasks.map((t) => t.id));
  const childrenOf = new Map<string | null, TaskDto[]>();
  for (const t of tasks) {
    const parent = t.parentId !== null && t.parentId !== t.id && ids.has(t.parentId) ? t.parentId : null;
    const list = childrenOf.get(parent) ?? [];
    list.push(t);
    childrenOf.set(parent, list);
  }
  for (const list of childrenOf.values()) list.sort(compareTasks);

  const byId = new Map<string, TreeNode>();
  const preorder: TreeNode[] = [];
  const visit = (t: TaskDto, depth: number): TreeNode => {
    const node: TreeNode = { task: t, depth, nr: 0, children: [] };
    byId.set(t.id, node);
    preorder.push(node);
    node.nr = preorder.length;
    for (const child of childrenOf.get(t.id) ?? []) {
      if (!byId.has(child.id)) node.children.push(visit(child, depth + 1));
    }
    return node;
  };

  const roots = (childrenOf.get(null) ?? []).map((t) => visit(t, 0));
  // Vorgänge in Eltern-Zyklen sind von keiner Wurzel erreichbar – als zusätzliche Wurzeln anhängen.
  for (const t of [...tasks].sort(compareTasks)) {
    if (!byId.has(t.id)) roots.push(visit(t, 0));
  }
  return { roots, byId, preorder };
}

export function visibleRows(tree: Tree, collapsed: ReadonlySet<string>): VisibleRow[] {
  const rows: VisibleRow[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      const hasChildren = node.children.length > 0;
      const isCollapsed = hasChildren && collapsed.has(node.task.id);
      rows.push({ node, hasChildren, collapsed: isCollapsed });
      if (!isCollapsed) walk(node.children);
    }
  };
  walk(tree.roots);
  return rows;
}

export function parentIds(tree: Tree): Set<string> {
  return new Set(tree.preorder.filter((n) => n.children.length > 0).map((n) => n.task.id));
}
