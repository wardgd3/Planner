import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

/**
 * Shape one inventory into the rows both exporters share.
 * Only counted items are included, in catalog order, grouped by category.
 * A stored 0 is kept: "we checked and there were none" is real information.
 */
export function buildExportRows(categories, items, counts) {
  const rows = []
  for (const category of categories) {
    const catItems = items.filter(
      (i) => i.category_id === category.id && counts[i.id] !== undefined,
    )
    for (const item of catItems) {
      rows.push({
        category: category.name,
        subgroup: item.subgroup || '',
        item: item.name,
        qty: counts[item.id],
      })
    }
  }
  return rows
}

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function exportFileName(session, ext) {
  return `inventory-${slug(session.storeName)}-${session.session_date}.${ext}`
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

export function exportCsv(session, categories, items, counts) {
  const rows = buildExportRows(categories, items, counts)
  const lines = [
    ['Store', 'Date', 'Category', 'Group', 'Item', 'Qty'].join(','),
    ...rows.map((r) =>
      [session.storeName, session.session_date, r.category, r.subgroup, r.item, r.qty]
        .map(csvCell)
        .join(','),
    ),
  ]
  // BOM so Excel opens UTF-8 cleanly.
  const blob = new Blob(['﻿' + lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  })
  triggerDownload(blob, exportFileName(session, 'csv'))
  return rows.length
}

export function exportPdf(session, categories, items, counts) {
  const rows = buildExportRows(categories, items, counts)
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const marginX = 40

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('Inventory', marginX, 48)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text(session.storeName, marginX, 68)
  doc.setTextColor(120)
  doc.text(formatLongDate(session.session_date), marginX, 84)

  const totalUnits = rows.reduce((sum, r) => sum + r.qty, 0)
  doc.text(`${rows.length} items counted · ${totalUnits} units`, marginX, 100)
  doc.setTextColor(0)

  // One table per category keeps the PDF readable instead of one long run.
  let startY = 122
  for (const category of categories) {
    const catRows = rows.filter((r) => r.category === category.name)
    if (catRows.length === 0) continue

    autoTable(doc, {
      startY,
      head: [[category.name, 'Group', 'Qty']],
      body: catRows.map((r) => [r.item, r.subgroup, String(r.qty)]),
      theme: 'striped',
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [212, 152, 26], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 240 },
        1: { cellWidth: 160, textColor: 120 },
        2: { cellWidth: 50, halign: 'right' },
      },
      margin: { left: marginX, right: marginX },
    })
    startY = doc.lastAutoTable.finalY + 18
  }

  if (rows.length === 0) {
    doc.setFontSize(11)
    doc.text('No items were counted in this inventory.', marginX, startY)
  }

  doc.save(exportFileName(session, 'pdf'))
  return rows.length
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
