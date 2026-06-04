/**
 * Export Service for Trip Agent
 * Handles exporting trip data to PDF, JSON, and Markdown formats
 */

import type { Trip } from "@/types"
import type { Language } from "@/stores/uiStore"
import { useUiStore } from "@/stores/uiStore"
import { PdfExportService } from "@/lib/export/pdfExport"
import { MarkdownExportService } from "@/lib/export/markdownExport"
import { PrintExportService } from "@/lib/export/printStyles"

export class ExportService {
  private static lang(): Language {
    return useUiStore.getState().language ?? "zh"
  }

  /** Export as PDF (HTML+print, CJK-safe, language-aware) */
  static exportToPdf(trip: Trip): void {
    PdfExportService.exportToPdf(trip, this.lang())
  }

  /** Open a print preview (HTML) */
  static exportToPrint(trip: Trip): void {
    const printWindow = window.open("", "_blank")
    if (!printWindow) {
      alert(this.lang() === "zh"
        ? "无法打开打印窗口，请检查浏览器弹出窗口设置。"
        : "Cannot open print window. Check browser popup settings.")
      return
    }
    const html = PrintExportService.generatePrintHtml(trip, this.lang())
    printWindow.document.write(html)
    printWindow.document.close()
  }

  /** Export as Markdown */
  static exportToMarkdown(trip: Trip): void {
    MarkdownExportService.exportToMarkdown(trip, this.lang())
  }

}
