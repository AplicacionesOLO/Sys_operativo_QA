import { useState, useRef, useCallback, DragEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { parseVolumenesExcel, monthIdToLabel } from '@/lib/volumenesExcelParser';
import type { ExcelParseResult } from '@/types/volumenes';

interface ExcelUploadModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'select' | 'preview' | 'uploading' | 'done';

export default function ExcelUploadModal({ onClose, onSuccess }: ExcelUploadModalProps) {
  const [step, setStep] = useState<Step>('select');
  const [dragging, setDragging] = useState(false);
  const [parsedAncha, setParsedAncha] = useState<ExcelParseResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [uploadError, setUploadError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setParsedAncha({
        recibidas: [], despachadas: [], meses: [], clientes: [],
        totalInOut: null,
        errors: ['Solo se aceptan archivos .xlsx o .xls'],
      });
      setFileName(file.name);
      setStep('preview');
      return;
    }
    setFileName(file.name);
    const buffer = await file.arrayBuffer();
    const result = parseVolumenesExcel(buffer);
    setParsedAncha(result);
    setStep('preview');
  }, []);

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) await processFile(file);
  }, [processFile]);

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await processFile(file);
  };

  const handleUpload = async () => {
    if (!parsedAncha || parsedAncha.errors.length > 0) return;
    setStep('uploading');
    setUploadError('');

    try {
      await uploadAncha();
      setStep('done');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Error desconocido al subir datos.');
      setStep('preview');
    }
  };

  const uploadAncha = async () => {
    if (!parsedAncha) return;

    await Promise.all([
      supabase.from('volumenes').delete().not('id', 'is', null),
      supabase.from('volumenes_columnas').delete().not('id', 'is', null),
    ]);

    const colInserts = parsedAncha.meses.map((nombre, idx) => ({
      nombre,
      tipo: 'numero' as const,
      opciones: [] as string[],
      orden: idx,
    }));

    const { data: insertedCols, error: colError } = await supabase
      .from('volumenes_columnas')
      .insert(colInserts)
      .select();

    if (colError) throw new Error(`Error al guardar meses: ${colError.message}`);

    const mesMap: Record<string, string> = {};
    (insertedCols ?? []).forEach((col: { id: string; nombre: string }) => {
      mesMap[col.nombre] = col.id;
    });

    const buildFilas = (rows: typeof parsedAncha.recibidas, proceso: string) =>
      rows.map(row => ({
        proceso,
        subproceso: row.cliente,
        periodo: '',
        valores: Object.fromEntries(
          Object.entries(row.meses).map(([mesLabel, val]) => [
            mesMap[mesLabel] ?? mesLabel,
            val,
          ]),
        ),
      }));

    const filaInserts = [
      ...buildFilas(parsedAncha.recibidas, 'recibido'),
      ...buildFilas(parsedAncha.despachadas, 'despachado'),
    ];

    if (parsedAncha.totalInOut) {
      filaInserts.push({
        proceso: 'total_in_out',
        subproceso: 'Total in/out',
        periodo: '',
        valores: Object.fromEntries(
          Object.entries(parsedAncha.totalInOut.meses).map(([mesLabel, val]) => [
            mesMap[mesLabel] ?? mesLabel,
            val,
          ]),
        ),
      });
    }

    const { error: filaError } = await supabase.from('volumenes').insert(filaInserts);
    if (filaError) throw new Error(`Error al guardar datos: ${filaError.message}`);
  };

  // ── Render helpers ──
  const hasErrors = parsedAncha?.errors.length ?? 0 > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Cargar Excel de Volúmenes</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Estructura ancha: bloques Uds recibidas / Uds Despachadas
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1">
          {/* STEP: select tipo de plantilla */}
          {step === 'select' && (
            <div className="space-y-4">
              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-all ${dragging ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
              >
                <div className="w-14 h-14 flex items-center justify-center rounded-full bg-emerald-50">
                  <i className="ri-file-excel-2-line text-3xl text-emerald-500" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-700">Arrastra tu archivo Excel aquí</p>
                  <p className="text-xs text-slate-400 mt-1">o haz clic para seleccionar · .xlsx / .xls</p>
                </div>
              </div>

              <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">
                <p className="font-semibold text-slate-600 mb-1">Estructura esperada:</p>
                <p>• Col A = <strong>&quot;Uds recibidas&quot;</strong> → header de bloque</p>
                <p>• Cols B+ = meses (Jan, Feb, Mar...)</p>
                <p>• Filas = clientes (EPA, Cofersa, ZF, Otros...)</p>
                <p>• Col A = <strong>&quot;Uds Despachadas&quot;</strong> → segundo bloque</p>
              </div>
            </div>
          )}

          {/* STEP: preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              {fileName && (
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg">
                  <div className="w-5 h-5 flex items-center justify-center text-emerald-500">
                    <i className="ri-file-excel-2-line" />
                  </div>
                  <span className="text-sm text-slate-600 truncate">{fileName}</span>
                </div>
              )}

              {/* Errores */}
              {hasErrors && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 space-y-1">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-5 h-5 flex items-center justify-center text-rose-500">
                      <i className="ri-error-warning-line" />
                    </div>
                    <span className="text-sm font-semibold text-rose-700">Errores detectados</span>
                  </div>
                  {parsedAncha?.errors.map((e, i) => (
                    <p key={i} className="text-xs text-rose-600 pl-7">{e}</p>
                  ))}
                </div>
              )}

              {/* Preview ancha */}
              {!hasErrors && parsedAncha && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-slate-700">{parsedAncha.meses.length}</p>
                      <p className="text-xs text-slate-500 mt-0.5">Meses</p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-emerald-700">{parsedAncha.recibidas.length}</p>
                      <p className="text-xs text-emerald-600 mt-0.5">Clientes recibidas</p>
                    </div>
                    <div className="bg-sky-50 border border-sky-100 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-sky-700">{parsedAncha.despachadas.length}</p>
                      <p className="text-xs text-sky-600 mt-0.5">Clientes despachadas</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1.5">Meses detectados</p>
                    <div className="flex flex-wrap gap-1.5">
                      {parsedAncha.meses.map(m => (
                        <span key={m} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">
                          {monthIdToLabel(m)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-3">
                    <div className="w-5 h-5 flex items-center justify-center text-amber-500 mt-0.5 flex-shrink-0">
                      <i className="ri-alert-line" />
                    </div>
                    <p className="text-xs text-amber-700">
                      <strong>Importante:</strong> Esta carga <strong>reemplazará completamente</strong> todos los datos existentes.
                    </p>
                  </div>
                </div>
              )}

              {uploadError && (
                <p className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{uploadError}</p>
              )}
            </div>
          )}

          {/* STEP: uploading */}
          {step === 'uploading' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-12 h-12 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-600">Guardando datos...</p>
              <p className="text-xs text-slate-400">
                Procesando meses y clientes detectados
              </p>
            </div>
          )}

          {/* STEP: done */}
          {step === 'done' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-14 h-14 flex items-center justify-center rounded-full bg-emerald-100">
                <i className="ri-check-line text-3xl text-emerald-600" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-800">¡Datos cargados correctamente!</p>
                <p className="text-xs text-slate-400 mt-1">
                  La información ya está disponible en el módulo y en Costos de Operación.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3 flex-shrink-0">
          <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileInput} />

          {step === 'select' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                Cancelar
              </button>
              <button
                onClick={() => inputRef.current?.click()}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                Seleccionar archivo
              </button>
            </>
          )}

          {step === 'preview' && (
            <>
              <button
                onClick={() => {
                  setParsedAncha(null);
                  setFileName('');
                  setUploadError('');
                  setStep('select');
                }}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                Cambiar archivo
              </button>
              <button
                disabled={hasErrors}
                onClick={handleUpload}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                Confirmar y subir
              </button>
            </>
          )}

          {step === 'done' && (
            <button
              onClick={() => { onSuccess(); onClose(); }}
              className="ml-auto px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              Ver datos
            </button>
          )}
        </div>
      </div>
    </div>
  );
}