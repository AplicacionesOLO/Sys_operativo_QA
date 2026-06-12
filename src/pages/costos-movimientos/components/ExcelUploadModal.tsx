import { useState, useRef, useCallback, DragEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { parseMovimientosMasivoExcel } from '@/lib/movimientosMasivoExcelParser';
import type { MasivoParseResult } from '@/lib/movimientosMasivoExcelParser';

interface ExcelUploadModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'select' | 'preview' | 'uploading' | 'done';

export default function MovimientosExcelUploadModal({ onClose, onSuccess }: ExcelUploadModalProps) {
  const [step, setStep] = useState<Step>('select');
  const [dragging, setDragging] = useState(false);
  const [parsed, setParsed] = useState<MasivoParseResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [uploadError, setUploadError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setParsed({ headers: [], batches: [], totalRows: 0, previewRows: [], errors: ['Solo se aceptan archivos .xlsx o .xls'] });
      setFileName(file.name); setStep('preview'); return;
    }
    setFileName(file.name);
    const buffer = await file.arrayBuffer();
    setParsed(parseMovimientosMasivoExcel(buffer));
    setStep('preview');
  }, []);

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) await processFile(file);
  }, [processFile]);

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await processFile(file);
  };

  const handleUpload = async () => {
    if (!parsed || parsed.errors.length > 0 || parsed.totalRows === 0) return;
    setStep('uploading'); setUploadError('');
    try {
      // Clear existing data first
      await supabase.from('costos_movimientos_raw').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      for (let i = 0; i < parsed.batches.length; i++) {
        const { error } = await supabase.from('costos_movimientos_raw').insert(parsed.batches[i].map(rawData => ({ raw_data: rawData })));
        if (error) throw new Error(`Error en lote ${i + 1}: ${error.message}`);
      }
      setStep('done');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Error desconocido al subir datos.');
      setStep('preview');
    }
  };

  const hasErrors = (parsed?.errors.length ?? 0) > 0 || (parsed?.totalRows ?? 0) === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Cargar datos masivos — Costos Movimientos</h2>
            <p className="text-xs text-slate-400 mt-0.5">Carga el archivo Excel tal cual. Las columnas clave son: Zona Almacenaje, Artículo, Cantidad, Id Compañía.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer">
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1">
          {step === 'select' && (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-all ${dragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
            >
              <div className="w-14 h-14 flex items-center justify-center rounded-full bg-indigo-50">
                <i className="ri-database-2-line text-3xl text-indigo-500" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700">Arrastra tu archivo Excel aquí</p>
                <p className="text-xs text-slate-400 mt-1">o haz clic para seleccionar · .xlsx / .xls</p>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              {fileName && (
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg">
                  <i className="ri-file-excel-2-line text-indigo-500" />
                  <span className="text-sm text-slate-600 truncate">{fileName}</span>
                </div>
              )}
              {hasErrors && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
                  {parsed?.errors.map((e, i) => <p key={i} className="text-xs text-rose-600">{e}</p>)}
                  {parsed?.totalRows === 0 && <p className="text-xs text-rose-600">No se encontraron filas de datos válidas.</p>}
                </div>
              )}
              {!hasErrors && parsed && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-slate-700">{parsed.totalRows.toLocaleString('es-CO')}</p>
                      <p className="text-xs text-slate-500 mt-0.5">Filas totales</p>
                    </div>
                    <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-indigo-700">{parsed.headers.length}</p>
                      <p className="text-xs text-indigo-600 mt-0.5">Columnas</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-amber-700">{parsed.batches.length}</p>
                      <p className="text-xs text-amber-600 mt-0.5">Lotes (×1000)</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1.5">Columnas detectadas ({parsed.headers.length})</p>
                    <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                      {parsed.headers.map(h => <span key={h} className={`px-2 py-0.5 text-xs rounded-full whitespace-nowrap ${['Zona Almacenaje','Artículo','Cantidad','Id Compañía','Fecha Generación','DESCRIPCIONLARGA'].includes(h) ? 'bg-indigo-100 text-indigo-700 font-medium' : 'bg-slate-100 text-slate-600'}`}>{h}</span>)}
                    </div>
                    <p className="text-[10px] text-indigo-600 mt-1.5">Las columnas en azul son clave para el análisis por zona.</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1.5">Vista previa — {parsed.previewRows.length} de {parsed.totalRows.toLocaleString('es-CO')} filas</p>
                    <div className="border border-slate-200 rounded-lg overflow-auto max-h-[280px]">
                      <table className="text-xs whitespace-nowrap">
                        <thead>
                          <tr className="bg-slate-100 sticky top-0">
                            <th className="px-3 py-2 text-left text-slate-500 border-r border-slate-200">#</th>
                            {parsed.headers.map(h => <th key={h} className="px-3 py-2 text-left text-slate-500 border-r border-slate-200 max-w-[180px] overflow-hidden text-ellipsis">{h}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {parsed.previewRows.map((row, i) => (
                            <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                              <td className="px-3 py-1.5 text-slate-400 border-r border-slate-100 text-center">{i + 1}</td>
                              {parsed.headers.map(h => <td key={h} className="px-3 py-1.5 text-slate-600 border-r border-slate-100 max-w-[180px] overflow-hidden text-ellipsis">{row[h] !== null && row[h] !== undefined ? String(row[h]) : '—'}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-3">
                    <i className="ri-alert-line text-amber-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-amber-700"><strong>Importante:</strong> Esta carga <strong>reemplazará todos los datos anteriores</strong> de Costos Movimientos.</p>
                  </div>
                </div>
              )}
              {uploadError && <p className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{uploadError}</p>}
            </div>
          )}

          {step === 'uploading' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-12 h-12 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-600">Guardando datos...</p>
              <p className="text-xs text-slate-400">Subiendo {parsed?.batches.length ?? 0} lotes de hasta 1.000 filas</p>
            </div>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-14 h-14 flex items-center justify-center rounded-full bg-indigo-100">
                <i className="ri-check-line text-3xl text-indigo-600" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-800">Datos cargados correctamente</p>
                <p className="text-xs text-slate-400 mt-1">{parsed?.totalRows.toLocaleString('es-CO') ?? 0} filas guardadas.</p>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3 flex-shrink-0">
          <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileInput} />
          {step === 'select' && (
            <>
              <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer whitespace-nowrap">Cancelar</button>
              <button onClick={() => inputRef.current?.click()} className="px-5 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap">Seleccionar archivo</button>
            </>
          )}
          {step === 'preview' && (
            <>
              <button onClick={() => { setParsed(null); setFileName(''); setUploadError(''); setStep('select'); }} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer whitespace-nowrap">Cambiar archivo</button>
              <button disabled={hasErrors} onClick={handleUpload} className="px-5 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap">Confirmar y subir</button>
            </>
          )}
          {step === 'done' && (
            <button onClick={() => { onSuccess(); onClose(); }} className="ml-auto px-5 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap">Ver datos</button>
          )}
        </div>
      </div>
    </div>
  );
}
