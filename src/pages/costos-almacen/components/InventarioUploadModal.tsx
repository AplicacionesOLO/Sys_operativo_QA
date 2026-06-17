import { useState, useRef, useCallback, DragEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { parseSlotsExcel } from '@/lib/slotsMasivoExcelParser';

const MESES_ES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const KEY_COLS = ['Zona Almacenaje','Artículo','Ubicación','Cantidad Unidades','IdCompañía','Tipo Ubicación'];

function extractMonthYear(val: unknown): { mes: number; anio: number } | null {
  if (!val) return null;
  const str = String(val).trim();
  let m = str.match(/^(\d{4})-(\d{1,2})/);
  if (m) return { anio: parseInt(m[1]), mes: parseInt(m[2]) };
  m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) { const d1=parseInt(m[1]),d2=parseInt(m[2]),y=parseInt(m[3]); return { anio:y, mes:d1>12?d2:d1 }; }
  return null;
}

interface Props { onClose: () => void; onSuccess: () => void; }
type Step = 'select' | 'preview' | 'uploading' | 'done';

export default function InventarioUploadModal({ onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('select');
  const [dragging, setDragging] = useState(false);
  const [parsed, setParsed] = useState<any>(null);
  const [fileName, setFileName] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [detectedMonths, setDetectedMonths] = useState<{mes:number;anio:number}[]>([]);
  const [progress, setProgress] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) { setParsed({errors:['Solo .xlsx o .xls'],totalRows:0,batches:[],headers:[],previewRows:[]}); setFileName(file.name); setStep('preview'); return; }
    setFileName(file.name);
    const result = parseSlotsExcel(await file.arrayBuffer());
    setParsed(result);
    if (result.batches.length > 0) {
      const seen = new Map<string,{mes:number;anio:number}>();
      for (const batch of result.batches) {
        for (const row of batch) {
          const my = extractMonthYear((row as any)['Fecha Ubicación'] || (row as any)['Fecha Validación']);
          if (my) { const k=`${my.anio}-${my.mes}`; if(!seen.has(k)) seen.set(k,my); }
        }
      }
      setDetectedMonths(Array.from(seen.values()).sort((a,b)=>a.anio!==b.anio?a.anio-b.anio:a.mes-b.mes));
    }
    setStep('preview');
  }, []);

  const handleUpload = async () => {
    if (!parsed || parsed.errors.length > 0 || parsed.totalRows === 0) return;
    setStep('uploading'); setUploadError('');
    try {
      if (detectedMonths.length > 0) {
        setProgress('Eliminando registros del mismo período...');
        for (const { mes, anio } of detectedMonths) await supabase.from('costos_almacen_inventario_raw').delete().eq('mes',mes).eq('anio',anio);
      }
      for (let i = 0; i < parsed.batches.length; i++) {
        setProgress(`Subiendo lote ${i+1} de ${parsed.batches.length}...`);
        const rows = parsed.batches[i].map((raw: any) => {
          const my = extractMonthYear(raw['Fecha Ubicación'] || raw['Fecha Validación']);
          return { raw_data: raw, mes: my?.mes ?? null, anio: my?.anio ?? null };
        });
        const { error } = await supabase.from('costos_almacen_inventario_raw').insert(rows);
        if (error) throw new Error(`Error en lote ${i+1}: ${error.message}`);
      }
      setStep('done');
    } catch (err) { setUploadError(err instanceof Error ? err.message : 'Error.'); setStep('preview'); }
  };

  const hasErrors = (parsed?.errors.length ?? 0) > 0 || (parsed?.totalRows ?? 0) === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div><h2 className="text-base font-semibold text-slate-800">Cargar Inventario — Costos Almacén</h2><p className="text-xs text-slate-400 mt-0.5">Carga acumulativa por período. Zona: <strong>Zona Almacenaje</strong></p></div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer"><i className="ri-close-line text-lg"/></button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1">
          {step === 'select' && (
            <div onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={async e=>{e.preventDefault();setDragging(false);const f=e.dataTransfer.files[0];if(f)await processFile(f);}} onClick={()=>inputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-all ${dragging?'border-teal-400 bg-teal-50':'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
              <div className="w-14 h-14 flex items-center justify-center rounded-full bg-teal-50"><i className="ri-file-list-3-line text-3xl text-teal-500"/></div>
              <div className="text-center"><p className="text-sm font-medium text-slate-700">Arrastra el archivo de Inventario (.xlsx)</p><p className="text-xs text-slate-400 mt-1">o haz clic para seleccionar</p></div>
            </div>
          )}
          {step === 'preview' && (
            <div className="space-y-4">
              {fileName && <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg"><i className="ri-file-excel-2-line text-teal-500"/><span className="text-sm text-slate-600 truncate">{fileName}</span></div>}
              {hasErrors && <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">{parsed?.errors.map((e:string,i:number)=><p key={i} className="text-xs text-rose-600">{e}</p>)}</div>}
              {!hasErrors && parsed && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center"><p className="text-xl font-bold text-slate-700">{parsed.totalRows.toLocaleString('es-CO')}</p><p className="text-xs text-slate-500">Registros</p></div>
                    <div className="bg-teal-50 border border-teal-100 rounded-lg p-3 text-center"><p className="text-xl font-bold text-teal-700">{parsed.headers.length}</p><p className="text-xs text-teal-600">Columnas</p></div>
                    <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-center"><p className="text-xl font-bold text-amber-700">{parsed.batches.length}</p><p className="text-xs text-amber-600">Lotes</p></div>
                  </div>
                  {detectedMonths.length > 0 && <div className="bg-teal-50 border border-teal-200 rounded-lg px-4 py-3"><p className="text-xs font-semibold text-teal-800 mb-2"><i className="ri-calendar-check-line mr-1"/>Períodos ({detectedMonths.length})</p><div className="flex flex-wrap gap-1.5">{detectedMonths.map(({mes,anio})=><span key={`${anio}-${mes}`} className="px-2.5 py-1 bg-white border border-teal-200 text-teal-700 text-xs rounded-full font-medium">{MESES_ES[mes]} {anio}</span>)}</div></div>}
                  <div><p className="text-xs font-medium text-slate-500 mb-1.5">Columnas clave (en verde):</p><div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">{parsed.headers.map((h:string)=><span key={h} className={`px-2 py-0.5 text-xs rounded-full whitespace-nowrap ${KEY_COLS.includes(h)?'bg-teal-100 text-teal-700 font-medium border border-teal-200':'bg-slate-100 text-slate-600'}`}>{h}</span>)}</div></div>
                </div>
              )}
              {uploadError && <p className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{uploadError}</p>}
            </div>
          )}
          {step === 'uploading' && <div className="flex flex-col items-center gap-4 py-8"><div className="w-12 h-12 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"/><p className="text-sm text-slate-600">Procesando inventario...</p>{progress && <p className="text-xs text-slate-400">{progress}</p>}</div>}
          {step === 'done' && <div className="flex flex-col items-center gap-4 py-8"><div className="w-14 h-14 flex items-center justify-center rounded-full bg-teal-100"><i className="ri-check-line text-3xl text-teal-600"/></div><p className="text-sm font-semibold text-slate-800">{parsed?.totalRows.toLocaleString('es-CO')} registros de inventario cargados</p></div>}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3 flex-shrink-0">
          <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)processFile(f);}}/>
          {step==='select' && <><button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer">Cancelar</button><button onClick={()=>inputRef.current?.click()} className="px-5 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium rounded-lg cursor-pointer">Seleccionar archivo</button></>}
          {step==='preview' && <><button onClick={()=>{setParsed(null);setFileName('');setUploadError('');setDetectedMonths([]);setStep('select');}} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer">Cambiar</button><button disabled={hasErrors} onClick={handleUpload} className="px-5 py-2 bg-teal-500 hover:bg-teal-600 disabled:opacity-40 text-white text-sm font-medium rounded-lg cursor-pointer">Confirmar y subir</button></>}
          {step==='done' && <button onClick={()=>{onSuccess();onClose();}} className="ml-auto px-5 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium rounded-lg cursor-pointer">Ver datos</button>}
        </div>
      </div>
    </div>
  );
}
