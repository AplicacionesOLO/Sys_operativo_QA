import { useState, useRef, useEffect, useCallback } from 'react';
import { downloadCsv, downloadExcel } from '@/lib/csvExport';

interface ExportMenuProps {
  filenameBase: string;
  /**
   * Puede ser síncrono o asíncrono.
   * Si es async, ExportMenu mostrará un spinner de "Preparando…" mientras espera.
   */
  getExportData: () =>
    | { headers: string[]; rows: (string | number | undefined | null)[][] }
    | Promise<{ headers: string[]; rows: (string | number | undefined | null)[][] }>;
  className?: string;
}

export default function ExportMenu({ filenameBase, getExportData, className }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const runExport = useCallback(
    async (format: 'csv' | 'excel') => {
      setOpen(false);
      setExporting(true);
      try {
        // Esperar al menos 4 segundos para asegurar que los datos están 100% listos
        const [result] = await Promise.all([
          Promise.resolve(getExportData()),
          new Promise(resolve => setTimeout(resolve, 4000)),
        ]);
        const { headers, rows } = await result;
        if (format === 'csv') {
          downloadCsv(`${filenameBase}.csv`, headers, rows);
        } else {
          downloadExcel(`${filenameBase}.xlsx`, headers, rows);
        }
      } catch (err) {
        console.error('Export error:', err);
      } finally {
        setExporting(false);
      }
    },
    [filenameBase, getExportData],
  );

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <button
        onClick={() => !exporting && setOpen(o => !o)}
        disabled={exporting}
        className={`flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 transition-colors cursor-pointer whitespace-nowrap ${exporting ? 'opacity-70 cursor-not-allowed bg-slate-50' : 'hover:bg-slate-50'}`}
      >
        {exporting ? (
          <>
            <div className="w-4 h-4 flex items-center justify-center">
              <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
            </div>
            Preparando...
          </>
        ) : (
          <>
            <div className="w-4 h-4 flex items-center justify-center"><i className="ri-download-2-line" /></div>
            Exportar
            <div className="w-3 h-3 flex items-center justify-center">
              <i className={`ri-arrow-down-s-line text-xs text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </div>
          </>
        )}
      </button>

      {open && !exporting && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg py-1 min-w-[180px]">
          <button
            onClick={() => runExport('csv')}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap text-left"
          >
            <div className="w-4 h-4 flex items-center justify-center text-emerald-500"><i className="ri-file-text-line" /></div>
            CSV (.csv)
          </button>
          <button
            onClick={() => runExport('excel')}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap text-left"
          >
            <div className="w-4 h-4 flex items-center justify-center text-teal-500"><i className="ri-file-excel-2-line" /></div>
            Excel (.xlsx)
          </button>
        </div>
      )}
    </div>
  );
}