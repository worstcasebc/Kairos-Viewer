import { describe, expect, test } from 'vitest';
import { buildTree, parentIds, visibleRows } from '../src/tree';
import { demoProject, task } from './fixtures/demo';

describe('buildTree', () => {
  test('ordnet nach Hierarchie und order_index, Nr ist Preorder', () => {
    const tree = buildTree(demoProject().tasks);
    expect(tree.preorder.map((n) => [n.nr, n.task.name, n.depth])).toEqual([
      [1, 'Konzeption', 0],
      [2, 'Anforderungen', 1],
      [3, 'Wireframes', 1],
      [4, 'Umsetzung', 0],
      [5, 'Frontend', 1],
      [6, 'Backend', 1],
      [7, 'Integration', 1],
      [8, 'Tests', 0],
      [9, 'Go-Live', 0],
    ]);
    expect(tree.byId.get('backend')?.nr).toBe(6);
  });

  test('gleicher order_index wird deterministisch über die id sortiert', () => {
    const tree = buildTree([task({ id: 'b', name: 'B' }), task({ id: 'a', name: 'A' })]);
    expect(tree.preorder.map((n) => n.task.id)).toEqual(['a', 'b']);
  });

  test('unbekannte parent_id wird zur Wurzel', () => {
    const tree = buildTree([task({ id: 'x', name: 'X', parentId: 'gibt-es-nicht' })]);
    expect(tree.roots.map((n) => n.task.id)).toEqual(['x']);
  });

  test('Selbstbezug und Eltern-Zyklus: jeder Vorgang genau einmal, kein Hängen', () => {
    const tree = buildTree([
      task({ id: 's', name: 'Selbst', parentId: 's' }),
      task({ id: 'a', name: 'A', parentId: 'b', orderIndex: 1 }),
      task({ id: 'b', name: 'B', parentId: 'a', orderIndex: 2 }),
    ]);
    expect(tree.preorder.map((n) => n.task.id).sort()).toEqual(['a', 'b', 's']);
    expect(tree.preorder.map((n) => n.nr)).toEqual([1, 2, 3]);
  });

  test('leere Liste ergibt leeren Baum', () => {
    const tree = buildTree([]);
    expect(tree.roots).toEqual([]);
    expect(tree.preorder).toEqual([]);
  });
});

describe('visibleRows', () => {
  test('alles aufgeklappt zeigt alle Zeilen', () => {
    const rows = visibleRows(buildTree(demoProject().tasks), new Set());
    expect(rows).toHaveLength(9);
    expect(rows[0]).toMatchObject({ hasChildren: true, collapsed: false });
    expect(rows[1]).toMatchObject({ hasChildren: false, collapsed: false });
  });

  test('eingeklappter Sammelvorgang verbirgt seine Kinder', () => {
    const rows = visibleRows(buildTree(demoProject().tasks), new Set(['umsetzung']));
    expect(rows.map((r) => r.node.task.name)).toEqual(['Konzeption', 'Anforderungen', 'Wireframes', 'Umsetzung', 'Tests', 'Go-Live']);
    expect(rows[3].collapsed).toBe(true);
  });

  test('ein Blatt kann nicht eingeklappt sein', () => {
    const rows = visibleRows(buildTree(demoProject().tasks), new Set(['tests']));
    expect(rows.find((r) => r.node.task.id === 'tests')?.collapsed).toBe(false);
  });
});

test('parentIds liefert alle Vorgänge mit Kindern', () => {
  expect([...parentIds(buildTree(demoProject().tasks))].sort()).toEqual(['konzeption', 'umsetzung']);
});
