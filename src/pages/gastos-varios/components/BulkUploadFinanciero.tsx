import { useState, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import type { ValorKey, TipoFila, GastoVarioFila } from '@/types/gastos_varios';

interface ParsedRow {
  concepto: string;
  rawConcepto: string;
  nivel: number;
  tipo_fila: TipoFila;
  es_total: boolean;
  valores: Record<ValorKey, number | undefined>;
}

interface ColumnMap {
  concepto: number | null;
  mes: number | null;
  ppto_mes: number | null;
  psdo_mes: number | null;
  acum: number | null;
  ppto_acum: number | null;
  psdo_acum: number | null;
}

const VALOR_FIELDS: ValorKey[] = ['mes', 'ppto_mes', 'psdo_mes', 'acum', 'ppto_acum', 'psdo_acum'];

const FIELD_LABELS: Record<string, string> = {
  concepto: 'Concepto',
  mes: 'Mes',
  ppto_mes: 'Ppto Mes',
  psdo_mes: 'Psdo Mes',
  acum: 'Acumulado',
  ppto_acum: 'Ppto Acum',
  psdo_acum: 'Psdo Acum',
};

const AUTO_DETECT: Record<string, ValorKey | 'concepto'> = {
  concepto: 'concepto', concept: 'concepto', descripcion: 'concepto', description: 'concepto', cuenta: 'concepto',
  mes: 'mes', mensual: 'mes', month: 'mes', actual: 'mes',
  ppto: 'ppto_mes', presupuesto: 'ppto_mes', budget: 'ppto_mes', budgetmonth: 'ppto_mes', pptomes: 'ppto_mes',
  psdo: 'psdo_mes', pasado: 'psdo_mes', anterior: 'psdo_mes', previous: 'psdo_mes', psdomes: 'psdo_mes',
  acum: 'acum', acumulado: 'acum', accumulated: 'acum', ytd: 'acum',
  pptoac: 'ppto_acum', presupuestoacum: 'ppto_acum', pptoacum: 'ppto_acum', budgetytd: 'ppto_acum',
  psdoac: 'psdo_acum', pasadoacum: 'psdo_acum', psdoacum: 'psdo_acum', previousytd: 'psdo_acum',
};

function detectFieldFromHeader(header: string): ValorKey | 'concepto' | null {
  const clean = header.toLowerCase().replace(/[\s_\-\.%$]/g, '');
  return AUTO_DETECT[clean] ?? null;
}

function detectLevel(rawText: string): number {
  const match = rawText.match(/^(\s+)/);
  if (!match) return 0;
  return Math.floor(match[1].length / 2);
}

function isTotalRow(concepto: string): boolean {
  const lower = concepto.toLowerCase().trim();
  return (
    lower.startsWith('total') ||
    lower.startsWith('subtotal') ||
    lower === 'gran total' ||
    lower.startsWith('suma') ||
    lower.endsWith('total')
  );
}

function parseNumericCell(val: unknown): number | undefined {
  if (val === null || val === undefined || val === '') return undefined;
  const n = typeof val === 'number' ? val : Number(String(val).replace(/[$,\s(]/g, '').replace(/\)$/, m => m === ')' ? '' : m));
  // handle parentheses notation for negatives: (1234) = -1234
  if (typeof val === 'string' && val.trim().startsWith('(') && val.trim().endsWith(')')) {
    const inner = val.trim().slice(1, -1);
    const n2 = Number(inner.replace(/[$,\s]/g, ''));
    return isNaN(n2) ? undefined : -n2;
  }
  return isNaN(n) ? undefined : n;
}

// ─── Template download ────────────────────────────────────────────────────────
function downloadTemplate(currentFilas: GastoVarioFila[] = []) {
  const S = '  ';   // 2 spaces = 1 indent level

  // Sheet 1 – Data template (use real DB data if available, else example)
  let dataRows: (string | number | null)[][];

  if (currentFilas.length > 0) {
    // Build from real DB categories sorted by orden
    const sorted = [...currentFilas].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    dataRows = [
      ['Concepto', 'Mes', 'Ppto Mes', 'Psdo Mes', 'Acumulado', 'Ppto Acum', 'Psdo Acum'],
      ...sorted.map(f => {
        const indent = S.repeat(Math.max(0, f.nivel ?? 0));
        return [
          indent + f.concepto,
          f.valores?.mes ?? null,
          f.valores?.ppto_mes ?? null,
          f.valores?.psdo_mes ?? null,
          f.valores?.acum ?? null,
          f.valores?.ppto_acum ?? null,
          f.valores?.psdo_acum ?? null,
        ];
      }),
    ];
  } else {
    // Fallback: example data
    dataRows = [
      ['Concepto', 'Mes', 'Ppto Mes', 'Psdo Mes', 'Acumulado', 'Ppto Acum', 'Psdo Acum'],
      ['Colocación', null, null, null, null, null, null],
      [S + 'EPA',         35000,  38000,  32000,  210000, 228000, 192000],
      [S + 'HGB',         28000,  30000,  26000,  168000, 180000, 156000],
      [S + 'Cofersa',     42000,  40000,  38000,  252000, 240000, 228000],
      [S + 'Terceros',    20000,  22000,  22000,  120000, 132000, 129000],
      ['Total Colocación', 125000, 130000, 118000, 750000, 780000, 705000],
      ['Renta Bruta', null, null, null, null, null, null],
      [S + 'Personal', null, null, null, null, null, null],
      [S + S + 'Personal Administración', 25000, 28000, 24000, 150000, 168000, 144000],
      [S + S + 'Personal Almacén',        20000, 20000, 18000, 120000, 120000, 108000],
      [S + 'Total Personal',              45000, 48000, 42000, 270000, 288000, 252000],
      [S + 'Operaciones', null, null, null, null, null, null],
      [S + S + 'Logística', 22000, 23000, 21000, 132000, 138000, 124000],
      [S + S + 'Servicios', 18000, 19000, 17000, 108000, 114000, 102000],
      [S + 'Total Operaciones', 40000, 42000, 38000, 240000, 252000, 226000],
      ['Total Renta Bruta', 85000, 90000, 80000, 510000, 540000, 478000],
      ['Total General', 210000, 220000, 198000, 1260000, 1320000, 1183000],
    ];
  }

  const ws1 = XLSX.utils.aoa_to_sheet(dataRows as (string | number)[][]);

  // Column widths
  ws1['!cols'] = [
    { wch: 38 }, // Concepto
    { wch: 14 }, // Mes
    { wch: 14 }, // Ppto Mes
    { wch: 14 }, // Psdo Mes
    { wch: 14 }, // Acumulado
    { wch: 14 }, // Ppto Acum
    { wch: 14 }, // Psdo Acum
  ];

  // Sheet 2 – Instructions
  const instrRows: string[][] = [
    ['INSTRUCCIONES PARA LA PLANTILLA DE CARGA MASIVA'],
    [''],
    ['JERARQUÍA (columna Concepto)'],
    ['• Sin espacios al inicio    → Nivel 0  (grupo raíz o encabezado)'],
    ['• 2 espacios al inicio      → Nivel 1  (sub-grupo)'],
    ['• 4 espacios al inicio      → Nivel 2  (detalle dentro de sub-grupo)'],
    ['• 6 espacios al inicio      → Nivel 3  (y así sucesivamente)'],
    [''],
    ['TIPOS DE FILA (detección automática)'],
    ['• Filas que empiecen con "Total" o "Subtotal" → se marcan como TOTAL (fondo oscuro)'],
    ['• Filas de nivel 0 sin "Total"                 → SUBTOTAL (fondo gris)'],
    ['• Todo lo demás                                → DETALLE (fondo blanco)'],
    [''],
    ['VALORES NUMÉRICOS'],
    ['• Usa números directamente (ej: 125000)'],
    ['• También acepta formato con comas (ej: 125,000.00)'],
    ['• Valores negativos: usa número negativo (-3300) o paréntesis: (3,300.00)'],
    ['• Celdas vacías se tratan como valor 0 o vacío'],
    [''],
    ['COLUMNAS RECONOCIDAS AUTOMÁTICAMENTE'],
    ['• Concepto, Descripción, Cuenta → columna Concepto'],
    ['• Mes, Mensual, Actual           → columna Mes'],
    ['• Ppto, Presupuesto, Budget      → columna Presupuesto Mes'],
    ['• Psdo, Pasado, Anterior         → columna Pasado Mes'],
    ['• Acum, Acumulado, YTD           → columna Acumulado'],
    ['• Ppto Acum, Presupuesto Acum    → columna Presupuesto Acum'],
    ['• Psdo Acum, Pasado Acum         → columna Pasado Acum'],
    [''],
    ['CONSEJO: Si tu archivo tiene columnas con nombres distintos, podrás mapearlas'],
    ['manualmente en el paso 2 del asistente de importación.'],
  ];

  const ws2 = XLSX.utils.aoa_to_sheet(instrRows);
  ws2['!cols'] = [{ wch: 72 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'Plantilla');
  XLSX.utils.book_append_sheet(wb, ws2, 'Instrucciones');

  XLSX.writeFile(wb, 'plantilla_gastos_varios.xlsx');
}

// ─────────────────────────────────────────────────────────────────────────────

interface BulkUploadFinancieroProps {
  filas: GastoVarioFila[];
  onClose: () => void;
  onImport: (rows: ParsedRow[]) => Promise<{ inserted: number; updated: number; errors: number }>;
}

type Step = 'upload' | 'mapping' | 'preview' | 'importing' | 'done';

export default function BulkUploadFinanciero({ filas, onClose, onImport }: BulkUploadFinancieroProps) {
  const [step, setStep] = useState<Step>('upload');
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawData, setRawData] = useState<unknown[][]>([]);
  const [columnMap, setColumnMap] = useState<ColumnMap>({
    concepto: null, mes: null, ppto_mes: null, psdo_mes: null,
    acum: null, ppto_acum: null, psdo_acum: null,
  });
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [result, setResult] = useState<{ inserted: number; updated: number; errors: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    setFileName(file.name);
    setError('');
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });

        if (!rows || rows.length < 2) { setError('El archivo no contiene datos suficientes.'); return; }

        const headers = (rows[0] as unknown[]).map(h => String(h ?? ''));
        const dataRows = rows.slice(1).filter((r: unknown[]) => (r as unknown[]).some(c => c !== '' && c !== null && c !== undefined)) as unknown[][];

        setRawHeaders(headers);
        setRawData(dataRows);

        // Auto-detect column mapping
        const detected: ColumnMap = {
          concepto: null, mes: null, ppto_mes: null, psdo_mes: null,
          acum: null, ppto_acum: null, psdo_acum: null,
        };
        headers.forEach((h, i) => {
          const field = detectFieldFromHeader(h);
          if (field && detected[field as keyof ColumnMap] === null) {
            detected[field as keyof ColumnMap] = i;
          }
        });
        // If concepto not detected, use first column
        if (detected.concepto === null) detected.concepto = 0;

        setColumnMap(detected);
        setStep('mapping');
      } catch {
        setError('No se pudo leer el archivo. Asegúrate de que sea .xlsx, .xls o .csv válido.');
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const buildParsedRows = useCallback((): ParsedRow[] => {
    return rawData
      .map((row): ParsedRow | null => {
        const concIdx = columnMap.concepto ?? 0;
        const rawConcepto = String(row[concIdx] ?? '');
        const concepto = rawConcepto.trim();
        if (!concepto) return null;

        const nivel = detectLevel(rawConcepto);
        const es_total = isTotalRow(concepto);
        const tipo_fila: TipoFila = es_total ? 'total' : nivel === 0 ? 'subtotal' : 'detalle';

        const valores: Record<ValorKey, number | undefined> = {
          mes: undefined, ppto_mes: undefined, psdo_mes: undefined,
          acum: undefined, ppto_acum: undefined, psdo_acum: undefined,
        };

        VALOR_FIELDS.forEach(field => {
          const idx = columnMap[field];
          if (idx !== null && idx !== undefined && row[idx] !== undefined) {
            valores[field] = parseNumericCell(row[idx]);
          }
        });

        return { concepto, rawConcepto, nivel, tipo_fila, es_total, valores };
      })
      .filter((r): r is ParsedRow => r !== null);
  }, [rawData, columnMap]);

  const handlePreview = () => {
    if (columnMap.concepto === null) { setError('Debes mapear al menos la columna Concepto.'); return; }
    const rows = buildParsedRows();
    if (rows.length === 0) { setError('No se encontraron filas válidas.'); return; }
    setParsedRows(rows);
    setStep('preview');
  };

  const handleImport = async () => {
    setStep('importing');
    const res = await onImport(parsedRows);
    setResult(res);
    setStep('done');
  };

  const fmtNum = (n: number | undefined) => {
    if (n === undefined || isNaN(n)) return '';
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl w-full max-w-4xl mx-4 overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Carga masiva de estado financiero</h2>
            <div className="flex items-center gap-2 mt-1">
              {(['upload', 'mapping', 'preview', 'done'] as Step[]).map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                    step === s ? 'bg-emerald-500 text-white'
                    : (['upload', 'mapping', 'preview', 'done'].indexOf(step) > i)
                    ? 'bg-emerald-100 text-emerald-600'
                    : 'bg-slate-100 text-slate-400'
                  }`}>{i + 1}</div>
                  <span className={`text-xs transition-colors ${step === s ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>
                    {s === 'upload' ? 'Archivo' : s === 'mapping' ? 'Columnas' : s === 'preview' ? 'Revisar' : 'Listo'}
                  </span>
                  {i < 3 && <i className="ri-arrow-right-s-line text-slate-300" />}
                </div>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer">
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* STEP 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
                  dragOver ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-emerald-300 hover:bg-slate-50'
                }`}
              >
                <div className="w-16 h-16 flex items-center justify-center rounded-full bg-slate-100 mx-auto mb-4">
                  <i className="ri-file-excel-2-line text-3xl text-slate-400" />
                </div>
                <p className="text-slate-700 font-semibold text-sm">Arrastra tu archivo aquí</p>
                <p className="text-slate-400 text-xs mt-1">Soporta <strong>.xlsx</strong>, <strong>.xls</strong> y <strong>.csv</strong></p>
                <div className="mt-4 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors inline-block">
                  Seleccionar archivo
                </div>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileInput} className="hidden" />

              {error && (
                <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600">
                  <i className="ri-error-warning-line" />
                  {error}
                </div>
              )}

              {/* Download template */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-4">
                <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-emerald-100 flex-shrink-0">
                  <i className="ri-file-excel-2-line text-emerald-600 text-xl" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-emerald-800">Plantilla de ejemplo</p>
                  <p className="text-xs text-emerald-600 mt-0.5">
                    {filas.length > 0
                      ? `La plantilla incluye las ${filas.length} categorías actuales de la base de datos con sus valores.`
                      : 'Descarga el archivo con estructura jerárquica de ejemplo e instrucciones de llenado.'}
                  </p>
                </div>
                <button
                  onClick={() => downloadTemplate(filas)}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap flex-shrink-0"
                >
                  <div className="w-4 h-4 flex items-center justify-center">
                    <i className="ri-download-2-line" />
                  </div>
                  Descargar plantilla
                </button>
              </div>

              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-600 mb-2">Reglas de jerarquía:</p>
                <div className="space-y-1.5">
                  {[
                    { spaces: '0 espacios', desc: 'Nivel 0 — grupo raíz', tag: 'Subtotal' },
                    { spaces: '2 espacios', desc: 'Nivel 1 — sub-grupo', tag: 'Detalle' },
                    { spaces: '4 espacios', desc: 'Nivel 2 — detalle anidado', tag: 'Detalle' },
                  ].map(r => (
                    <div key={r.spaces} className="flex items-center gap-2 text-xs text-slate-500">
                      <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-mono text-[10px]">{r.spaces}</code>
                      <span className="text-slate-300">→</span>
                      <span>{r.desc}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 pt-1 border-t border-slate-200">
                    <code className="bg-slate-700 text-white px-1.5 py-0.5 rounded font-mono text-[10px]">Total...</code>
                    <span className="text-slate-300">→</span>
                    <span>Fila de total (detección automática por nombre)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Column mapping */}
          {step === 'mapping' && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <i className="ri-file-check-line text-emerald-500" />
                <span className="text-sm text-emerald-700">
                  <strong>{fileName}</strong> — {rawData.length} filas detectadas
                </span>
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-700 mb-3">Mapeo de columnas</p>
                <p className="text-xs text-slate-500 mb-4">
                  Asocia cada campo del sistema con la columna correspondiente de tu archivo.
                  Se detectaron automáticamente las columnas marcadas con ✓.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {(['concepto', ...VALOR_FIELDS] as (keyof ColumnMap)[]).map(field => (
                    <div key={field}>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        {FIELD_LABELS[field]}
                        {field === 'concepto' && <span className="text-rose-500 ml-1">*</span>}
                        {columnMap[field] !== null && (
                          <span className="ml-2 text-emerald-500 text-[10px]">✓ auto</span>
                        )}
                      </label>
                      <select
                        value={columnMap[field] ?? ''}
                        onChange={e => setColumnMap(prev => ({ ...prev, [field]: e.target.value === '' ? null : Number(e.target.value) }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 cursor-pointer bg-white"
                      >
                        <option value="">— No mapear —</option>
                        {rawHeaders.map((h, i) => (
                          <option key={i} value={i}>{h || `Columna ${i + 1}`}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sample preview */}
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2">Muestra de datos ({Math.min(5, rawData.length)} filas):</p>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="text-xs w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        {rawHeaders.map((h, i) => (
                          <th key={i} className="px-3 py-2 text-left text-slate-600 font-medium border-r border-slate-200 whitespace-nowrap">
                            {h || `Col ${i+1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rawData.slice(0, 5).map((row, ri) => (
                        <tr key={ri} className="border-t border-slate-100">
                          {rawHeaders.map((_, ci) => (
                            <td key={ci} className="px-3 py-1.5 text-slate-600 border-r border-slate-100 whitespace-nowrap">
                              {String(row[ci] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600">
                  <i className="ri-error-warning-line" />
                  {error}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600">
                  Se importarán <strong className="text-emerald-600">{parsedRows.length} conceptos</strong>.
                  Revisa la estructura detectada antes de confirmar.
                </p>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-slate-700 inline-block" /> Total</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-slate-200 inline-block" /> Subtotal</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm border border-slate-200 inline-block" /> Detalle</span>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200 max-h-96">
                <table className="text-xs w-full">
                  <thead className="bg-slate-800 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2 text-left text-slate-300 font-medium min-w-[220px] border-r border-slate-700">Concepto</th>
                      <th className="px-3 py-2 text-center text-slate-300 font-medium border-r border-slate-700">Nivel</th>
                      <th className="px-3 py-2 text-center text-slate-300 font-medium border-r border-slate-700">Tipo</th>
                      <th className="px-2 py-2 text-right text-slate-300 font-medium border-r border-slate-700">Mes</th>
                      <th className="px-2 py-2 text-right text-slate-300 font-medium border-r border-slate-700">Ppto</th>
                      <th className="px-2 py-2 text-right text-slate-300 font-medium border-r border-slate-700">Psdo</th>
                      <th className="px-2 py-2 text-right text-slate-300 font-medium border-r border-slate-700">Acum</th>
                      <th className="px-2 py-2 text-right text-slate-300 font-medium border-r border-slate-700">Ppto A</th>
                      <th className="px-2 py-2 text-right text-slate-300 font-medium">Psdo A</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((row, i) => (
                      <tr
                        key={i}
                        className={`border-t border-slate-100 ${
                          row.tipo_fila === 'total' ? 'bg-slate-700 text-white'
                          : row.tipo_fila === 'subtotal' ? 'bg-slate-100 font-medium'
                          : 'bg-white hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-3 py-1.5 border-r border-slate-200" style={{ paddingLeft: `${12 + row.nivel * 12}px` }}>
                          {row.concepto}
                        </td>
                        <td className="px-3 py-1.5 text-center border-r border-slate-200">{row.nivel}</td>
                        <td className="px-3 py-1.5 text-center border-r border-slate-200 capitalize">{row.tipo_fila}</td>
                        {(['mes', 'ppto_mes', 'psdo_mes', 'acum', 'ppto_acum', 'psdo_acum'] as ValorKey[]).map(k => (
                          <td key={k} className="px-2 py-1.5 text-right border-r border-slate-200 tabular-nums">
                            {fmtNum(row.valores[k])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Importing */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-12 h-12 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-600 text-sm font-medium">Importando datos...</p>
            </div>
          )}

          {/* Done */}
          {step === 'done' && result && (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
              <div className={`w-16 h-16 flex items-center justify-center rounded-full ${result.errors === 0 ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                <i className={`text-3xl ${result.errors === 0 ? 'ri-checkbox-circle-line text-emerald-500' : 'ri-error-warning-line text-amber-500'}`} />
              </div>
              <div>
                <p className="text-slate-800 font-bold text-lg">
                  {result.errors === 0 ? '¡Importación exitosa!' : 'Importación con errores'}
                </p>
                <p className="text-slate-500 text-sm mt-1">
                  {result.updated > 0 && <><strong className="text-sky-600">{result.updated}</strong> actualizados &nbsp;</>}
                  <strong className="text-emerald-600">{result.inserted}</strong> nuevos insertados
                  {result.errors > 0 && <>, <strong className="text-rose-500">{result.errors}</strong> fallaron</>}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap">
            {step === 'done' ? 'Cerrar' : 'Cancelar'}
          </button>
          <div className="flex items-center gap-2">
            {step === 'mapping' && (
              <button onClick={() => setStep('upload')} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap">
                <i className="ri-arrow-left-line mr-1.5" />Atrás
              </button>
            )}
            {step === 'preview' && (
              <button onClick={() => setStep('mapping')} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap">
                <i className="ri-arrow-left-line mr-1.5" />Atrás
              </button>
            )}
            {step === 'mapping' && (
              <button onClick={handlePreview} className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap">
                Vista previa <i className="ri-arrow-right-line ml-1.5" />
              </button>
            )}
            {step === 'preview' && (
              <button onClick={handleImport} className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap">
                <i className="ri-upload-cloud-2-line mr-1.5" />
                Importar {parsedRows.length} conceptos
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
