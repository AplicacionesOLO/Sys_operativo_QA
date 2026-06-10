import { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';

export interface BulkField {
  key: string;
  label: string;
  required?: boolean;
}

interface ParsedRow {
  [key: string]: string;
}

interface BulkUploadModalProps {
  title: string;
  tableName: string;
  fixedFields: BulkField[];
  onClose: () => void;
  onUpload: (rows: ParsedRow[]) => Promise<{ inserted: number; errors: number }>;
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQuotes = !inQuotes; }
      else if ((line[i] === ',' || line[i] === ';') && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else { current += line[i]; }
    }
    cells.push(current.trim());
    return cells;
  };
  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

function parseXLSX(buffer: ArrayBuffer): { headers: string[]; rows: string[][] } {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' });
  if (data.length === 0) return { headers: [], rows: [] };
  const headers = (data[0] as string[]).map(h => String(h).trim());
  const rows = (data.slice(1) as string[][]).map(r => r.map(c => String(c).trim()));
  return { headers, rows };
}

export default function BulkUploadModal({
  title,
  tableName,
  fixedFields,
  onClose,
  onUpload,
}: BulkUploadModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ inserted: number; errors: number } | null>(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const processFile = useCallback(async (file: File) => {
    setError('');
    try {
      if (file.name.endsWith('.csv') || file.type === 'text/csv') {
        const text = await file.text();
        const { headers: h, rows: r } = parseCSV(text);
        if (h.length === 0) { setError('El archivo está vacío o no tiene encabezados.'); return; }
        setHeaders(h);
        setRawRows(r);
        const autoMap: Record<string, string> = {};
        fixedFields.forEach(f => {
          const match = h.find(header =>
            header.toLowerCase() === f.label.toLowerCase() ||
            header.toLowerCase() === f.key.toLowerCase()
          );
          if (match) autoMap[f.key] = match;
        });
        setMapping(autoMap);
        setStep('preview');
      } else if (
        file.name.endsWith('.xlsx') ||
        file.name.endsWith('.xls') ||
        file.type.includes('spreadsheetml') ||
        file.type.includes('excel')
      ) {
        const buffer = await file.arrayBuffer();
        const { headers: h, rows: r } = parseXLSX(buffer);
        if (h.length === 0) { setError('El archivo está vacío o no tiene encabezados.'); return; }
        setHeaders(h);
        setRawRows(r);
        const autoMap: Record<string, string> = {};
        fixedFields.forEach(f => {
          const match = h.find(header =>
            header.toLowerCase() === f.label.toLowerCase() ||
            header.toLowerCase() === f.key.toLowerCase()
          );
          if (match) autoMap[f.key] = match;
        });
        setMapping(autoMap);
        setStep('preview');
      } else {
        setError('Formato no soportado. Sube un archivo .csv, .xlsx o .xls');
      }
    } catch {
      setError('Error al leer el archivo. Verifica que no esté dañado.');
    }
  }, [fixedFields]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const buildRows = (): ParsedRow[] => {
    return rawRows
      .filter(row => row.some(cell => cell.trim()))
      .map(row => {
        const obj: ParsedRow = {};
        fixedFields.forEach(f => {
          const colHeader = mapping[f.key];
          if (colHeader) {
            const idx = headers.indexOf(colHeader);
            obj[f.key] = idx >= 0 ? (row[idx] ?? '') : '';
          } else {
            obj[f.key] = '';
          }
        });
        const extraCols = headers.filter(h => !Object.values(mapping).includes(h));
        const valores: Record<string, string> = {};
        extraCols.forEach(h => {
          const idx = headers.indexOf(h);
          if (idx >= 0 && row[idx]?.trim()) {
            valores[h] = row[idx];
          }
        });
        if (Object.keys(valores).length > 0) {
          obj['__valores__'] = JSON.stringify(valores);
        }
        return obj;
      });
  };

  const previewRows = buildRows().slice(0, 8);

  const handleImport = async () => {
    setLoading(true);
    setError('');
    try {
      const rows = buildRows();
      if (rows.length === 0) { setError('No hay filas válidas para importar.'); setLoading(false); return; }
      const res = await onUpload(rows);
      setResult(res);
      setStep('done');
    } catch {
      setError('Error al importar los datos. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const headers = fixedFields.map(f => f.label);
    const csvContent = headers.join(',') + '\n' + fixedFields.map(() => '').join(',');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plantilla_${tableName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-emerald-100">
              <i className="ri-upload-cloud-2-line text-emerald-600 text-lg" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800">Carga masiva — {title}</h2>
              <p className="text-xs text-slate-400 mt-0.5">Importa múltiples registros desde CSV o Excel</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-3 flex-shrink-0">
          {(['upload', 'preview', 'done'] as const).map((s, i) => {
            const labels = ['Subir archivo', 'Previsualizar', 'Resultado'];
            const current = ['upload', 'preview', 'done'].indexOf(step);
            const idx = ['upload', 'preview', 'done'].indexOf(s);
            return (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && <div className={`h-px w-8 ${current >= idx ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
                <div className={`flex items-center gap-1.5 text-xs font-medium ${current >= idx ? 'text-emerald-600' : 'text-slate-400'}`}>
                  <div className={`w-5 h-5 flex items-center justify-center rounded-full text-xs ${current >= idx ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'}`}>
                    {current > idx ? <i className="ri-check-line text-xs" /> : i + 1}
                  </div>
                  <span className="hidden sm:inline">{labels[i]}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                  dragOver ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-emerald-300 hover:bg-slate-50'
                }`}
              >
                <div className="w-14 h-14 flex items-center justify-center rounded-full bg-slate-100 mx-auto mb-3">
                  <i className="ri-file-excel-2-line text-2xl text-slate-400" />
                </div>
                <p className="text-slate-600 font-medium text-sm">Arrastra tu archivo aquí</p>
                <p className="text-slate-400 text-xs mt-1">o haz clic para seleccionar</p>
                <p className="text-slate-300 text-xs mt-3">Soporta: .csv · .xlsx · .xls</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">
                  <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                    <i className="ri-error-warning-line text-rose-500" />
                  </div>
                  <p className="text-sm text-rose-600">{error}</p>
                </div>
              )}

              <div className="bg-slate-50 rounded-lg px-4 py-3">
                <p className="text-xs font-medium text-slate-600 mb-2">Columnas esperadas en el archivo:</p>
                <div className="flex flex-wrap gap-2">
                  {fixedFields.map(f => (
                    <span key={f.key} className={`text-xs px-2 py-1 rounded-full ${f.required ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                      {f.label} {f.required && <span className="text-rose-500">*</span>}
                    </span>
                  ))}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); downloadTemplate(); }}
                  className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 font-medium cursor-pointer"
                >
                  <i className="ri-download-2-line" />
                  Descargar plantilla CSV
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    {rawRows.filter(r => r.some(c => c.trim())).length} filas detectadas
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">Mostrando primeras 8 filas</p>
                </div>
                <button
                  onClick={() => { setStep('upload'); setHeaders([]); setRawRows([]); setMapping({}); }}
                  className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 cursor-pointer"
                >
                  <i className="ri-arrow-left-line" /> Cambiar archivo
                </button>
              </div>

              {/* Column mapping */}
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">Mapeo de columnas</p>
                <div className="grid grid-cols-2 gap-3">
                  {fixedFields.map(f => (
                    <div key={f.key}>
                      <label className="block text-xs text-slate-500 mb-1">{f.label}</label>
                      <select
                        value={mapping[f.key] ?? ''}
                        onChange={e => setMapping(prev => ({ ...prev, [f.key]: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 cursor-pointer"
                      >
                        <option value="">— Sin mapear —</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview table */}
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-800">
                      {fixedFields.map(f => (
                        <th key={f.key} className="px-3 py-2.5 text-left text-slate-200 font-semibold whitespace-nowrap">
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        {fixedFields.map(f => (
                          <td key={f.key} className="px-3 py-2 text-slate-600 whitespace-nowrap max-w-[160px] overflow-hidden text-ellipsis">
                            {row[f.key] || <span className="text-slate-300">vacío</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">
                  <i className="ri-error-warning-line text-rose-500 flex-shrink-0" />
                  <p className="text-sm text-rose-600">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Done */}
          {step === 'done' && result && (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
              <div className={`w-16 h-16 flex items-center justify-center rounded-full ${result.errors === 0 ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                <i className={`text-3xl ${result.errors === 0 ? 'ri-checkbox-circle-line text-emerald-500' : 'ri-error-warning-line text-amber-500'}`} />
              </div>
              <div className="text-center">
                <p className="text-slate-800 font-semibold text-base">
                  {result.errors === 0 ? 'Importación completada' : 'Importación con advertencias'}
                </p>
                <p className="text-slate-500 text-sm mt-1">
                  <span className="text-emerald-600 font-semibold">{result.inserted}</span> registros importados
                  {result.errors > 0 && <>, <span className="text-amber-600 font-semibold">{result.errors}</span> con errores</>}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            {step === 'done' ? 'Cerrar' : 'Cancelar'}
          </button>
          {step === 'preview' && (
            <button
              onClick={handleImport}
              disabled={loading}
              className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2"
            >
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Importando...</>
              ) : (
                <><i className="ri-upload-2-line" /> Importar {rawRows.filter(r => r.some(c => c.trim())).length} filas</>
              )}
            </button>
          )}
          {step === 'done' && (
            <button
              onClick={() => { setStep('upload'); setHeaders([]); setRawRows([]); setMapping({}); setResult(null); }}
              className="px-5 py-2 border border-emerald-500 text-emerald-600 hover:bg-emerald-50 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-refresh-line mr-1.5" />
              Nueva importación
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
