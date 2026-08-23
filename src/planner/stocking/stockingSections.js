/**
 * One section per subgroup, ordered by where that subgroup first appears so the
 * list still follows the shelf.
 *
 * Deliberately not grouping by consecutive runs: sort_order is not guaranteed
 * to keep a subgroup contiguous once items are added or moved between groups,
 * and a run-based grouping silently splits a subgroup into repeated sections
 * scattered down the page.
 */
function groupBySubgroup(items) {
  const buckets = new Map()
  for (const item of items) {
    const label = item.subgroup || ''
    if (!buckets.has(label)) buckets.set(label, [])
    buckets.get(label).push(item)
  }
  return [...buckets.entries()].map(([label, list]) => ({ label: label || null, items: list }))
}

/**
 * Sections for the checklist. Built in the view rather than the list so the
 * toolbar's category chips and the rows below agree on one set of counts.
 */
export function buildSections({ categories, items, counts, query, companyId }) {
  const needle = query.trim().toLowerCase()
  return categories
    .map((category) => {
      const inCategory = items.filter((i) => i.category_id === category.id)
      // The company filter narrows the totals too, so a category reads
      // "4/9 of this brand" rather than against items it is hiding.
      const scoped = companyId
        ? inCategory.filter((i) => i.company_id === companyId)
        : inCategory
      const visible = needle
        ? scoped.filter((i) => i.name.toLowerCase().includes(needle))
        : scoped
      return {
        category,
        total: scoped.length,
        counted: scoped.filter((i) => counts[i.id] !== undefined).length,
        groups: groupBySubgroup(visible),
      }
    })
    .filter((s) => s.groups.length > 0)
}
