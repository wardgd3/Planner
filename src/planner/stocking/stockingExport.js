import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

/**
 * Counted items for one location, in catalog order, grouped by category.
 * A stored 0 is kept: "we checked and there were none" is real information.
 */
export function buildExportRows(categories, items, counts) {
  const rows = []
  for (const category of categories) {
    const catItems = items.filter(
      (i) => i.category_id === category.id && counts[i.id] !== undefined,
    )
    for (const item of catItems) {
      rows.push({ category: category.name, item: item.name, qty: counts[item.id] })
    }
  }
  return rows
}

/** Legs that actually have counts, each with its rows resolved. */
function resolveLegs(inventory, categories, items) {
  return (inventory.legs || [])
    .map((leg) => ({ storeName: leg.storeName, rows: buildExportRows(categories, items, leg.counts) }))
    .filter((leg) => leg.rows.length > 0)
}

export function exportFileName(inventory, ext) {
  return `inventory-${inventory.date}.${ext}`
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke on the next tick so the download has taken hold first.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function csvCell(value) {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function exportCsv(inventory, categories, items) {
  const legs = resolveLegs(inventory, categories, items)
  const lines = [['Store', 'Date', 'Category', 'Item', 'Qty'].join(',')]
  let total = 0
  for (const leg of legs) {
    for (const r of leg.rows) {
      lines.push(
        [leg.storeName, inventory.date, r.category, r.item, r.qty].map(csvCell).join(','),
      )
      total++
    }
  }
  // BOM so Excel opens UTF-8 cleanly.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, exportFileName(inventory, 'csv'))
  return total
}

/** Builds the document without writing it, so it can be inspected in tests. */
export function buildPdfDoc(inventory, categories, items) {
  const legs = resolveLegs(inventory, categories, items)
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const marginX = 40

  const totalItems = legs.reduce((n, leg) => n + leg.rows.length, 0)
  const totalUnits = legs.reduce(
    (n, leg) => n + leg.rows.reduce((s, r) => s + r.qty, 0),
    0,
  )

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('Inventory', marginX, 48)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(120)
  doc.text(formatLongDate(inventory.date), marginX, 66)
  doc.text(
    `${legs.length} ${legs.length === 1 ? 'location' : 'locations'} · ${totalItems} items · ${totalUnits} units`,
    marginX,
    82,
  )
  doc.setTextColor(0)

  let startY = 106

  for (const leg of legs) {
    // Keep a location heading with at least the start of its first table.
    if (startY > 660) {
      doc.addPage()
      startY = 56
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text(leg.storeName, marginX, startY)
    startY += 12

    for (const category of categories) {
      const catRows = leg.rows.filter((r) => r.category === category.name)
      if (catRows.length === 0) continue

      autoTable(doc, {
        startY,
        head: [[category.name, 'Qty']],
        body: catRows.map((r) => [r.item, String(r.qty)]),
        theme: 'striped',
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [212, 152, 26], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 400 },
          1: { cellWidth: 60, halign: 'right' },
        },
        margin: { left: marginX, right: marginX },
      })
      startY = doc.lastAutoTable.finalY + 16
    }
    startY += 8
  }

  if (legs.length === 0) {
    doc.setFontSize(11)
    doc.text('Nothing was counted in this inventory.', marginX, startY)
  }

  return { doc, totalItems }
}

export function exportPdf(inventory, categories, items) {
  const { doc, totalItems } = buildPdfDoc(inventory, categories, items)
  doc.save(exportFileName(inventory, 'pdf'))
  return totalItems
}

function formatLongDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}
