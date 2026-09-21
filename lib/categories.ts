/**
 * أدوات مساعدة للتعامل مع شجرة التصنيفات (categories.parent_id).
 *
 * لا يوجد جدول منفصل لـ"الأقسام" — القسم هو أي تصنيف رئيسي بدون parent_id،
 * والتصنيف الفرعي هو أي تصنيف له parent_id. هذا يسمح بعمق غير محدود:
 * قسم -> تصنيف فرعي -> تصنيف فرعي فرعي ... إلخ.
 */
import type { Category } from './supabase';

/** الأقسام الرئيسية (بدون تصنيف أب)، مرتّبة حسب sort_order. */
export function getDepartments(categories: Category[]): Category[] {
  return categories
    .filter((c) => !c.parent_id)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

/** التصنيفات الفرعية المباشرة لتصنيف معيّن (أو الأقسام الرئيسية إن كان parentId = null). */
export function getChildren(categories: Category[], parentId: string | null): Category[] {
  return categories
    .filter((c) => (c.parent_id ?? null) === (parentId ?? null))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

export function hasChildren(categories: Category[], id: string): boolean {
  return categories.some((c) => c.parent_id === id);
}

/** معرّف التصنيف نفسه + كل أبنائه وأحفاده (بعمق غير محدود). مفيد لعرض كل منتجات قسم كامل. */
export function getDescendantIds(categories: Category[], rootId: string): string[] {
  const result: string[] = [rootId];
  const queue: string[] = [rootId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of categories.filter((c) => c.parent_id === current)) {
      result.push(child.id);
      queue.push(child.id);
    }
  }
  return result;
}

/** المسار الكامل من القسم الرئيسي وصولاً للتصنيف المحدد (شامل نفسه). */
export function getCategoryPath(categories: Category[], id: string | null | undefined): Category[] {
  if (!id) return [];
  const byId = new Map(categories.map((c) => [c.id, c]));
  const path: Category[] = [];
  let current = byId.get(id);
  const guard = new Set<string>();
  while (current && !guard.has(current.id)) {
    guard.add(current.id);
    path.unshift(current);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return path;
}

/** نص المسار الكامل، مثال: "إلكترونيات › موبايلات › آيفون". */
export function getCategoryPathLabel(
  categories: Category[],
  id: string | null | undefined,
  separator = ' › '
): string {
  return getCategoryPath(categories, id)
    .map((c) => c.name)
    .join(separator);
}

/** القسم الرئيسي الذي ينتمي إليه تصنيف معيّن (أول عنصر في مساره). */
export function getRootDepartment(categories: Category[], id: string | null | undefined): Category | null {
  const path = getCategoryPath(categories, id);
  return path.length > 0 ? path[0] : null;
}

/** ترتيب كل التصنيفات بشكل شجري (DFS) — قسم ثم فروعه بالترتيب ثم القسم التالي. */
export function flattenTree(categories: Category[]): { category: Category; depth: number }[] {
  const out: { category: Category; depth: number }[] = [];
  const visit = (node: Category, depth: number) => {
    out.push({ category: node, depth });
    getChildren(categories, node.id).forEach((child) => visit(child, depth + 1));
  };
  getDepartments(categories).forEach((dept) => visit(dept, 0));
  return out;
}
