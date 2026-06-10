export type TipoFila = 'total' | 'subtotal' | 'detalle';

export interface ValoresFinancieros {
  mes?: number;
  ppto_mes?: number;
  psdo_mes?: number;
  acum?: number;
  ppto_acum?: number;
  psdo_acum?: number;
  [key: string]: number | undefined;
}

export interface GastoVarioFila {
  id: string;
  concepto: string;
  categoria?: string;
  area?: string;
  parent_id: string | null;
  nivel: number;
  es_total: boolean;
  tipo_fila: TipoFila;
  orden: number;
  valores: ValoresFinancieros;
  created_at?: string;
}

export interface GastoVarioNode extends GastoVarioFila {
  children: GastoVarioNode[];
}

export type ValorKey = 'mes' | 'ppto_mes' | 'psdo_mes' | 'acum' | 'ppto_acum' | 'psdo_acum';

export const VALOR_KEYS: ValorKey[] = ['mes', 'ppto_mes', 'psdo_mes', 'acum', 'ppto_acum', 'psdo_acum'];

export const VALOR_LABELS: Record<ValorKey, string> = {
  mes: 'Mes',
  ppto_mes: 'Ppto Mes',
  psdo_mes: 'Psdo Mes',
  acum: 'Acum',
  ppto_acum: 'Ppto Acum',
  psdo_acum: 'Psdo Acum',
};

export const MES_KEYS: ValorKey[] = ['mes', 'ppto_mes', 'psdo_mes'];
export const ACUM_KEYS: ValorKey[] = ['acum', 'ppto_acum', 'psdo_acum'];

export const TIPO_FILA_OPTIONS: { value: TipoFila; label: string; color: string }[] = [
  { value: 'total', label: 'Total / Encabezado', color: 'bg-slate-700 text-white' },
  { value: 'subtotal', label: 'Subtotal', color: 'bg-slate-100 text-slate-700' },
  { value: 'detalle', label: 'Detalle', color: 'bg-white text-slate-600' },
];

export function fmt(n: number | undefined | null): string {
  if (n === null || n === undefined || isNaN(n)) return '';
  const abs = Math.abs(n);
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  return n < 0 ? `(${formatted})` : formatted;
}

export function fmtPct(n: number | undefined | null): string {
  if (n === null || n === undefined || isNaN(n)) return '';
  return `${n.toFixed(1)}%`;
}

export function buildTree(rows: GastoVarioFila[]): GastoVarioNode[] {
  const sorted = [...rows].sort((a, b) => a.orden - b.orden);
  const map = new Map<string, GastoVarioNode>();
  const roots: GastoVarioNode[] = [];

  sorted.forEach(row => map.set(row.id, { ...row, children: [] }));

  sorted.forEach(row => {
    const node = map.get(row.id)!;
    if (row.parent_id && map.has(row.parent_id)) {
      map.get(row.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

export function flattenVisible(
  nodes: GastoVarioNode[],
  collapsedIds: Set<string>,
): GastoVarioFila[] {
  const result: GastoVarioFila[] = [];
  function visit(node: GastoVarioNode) {
    result.push(node);
    if (!collapsedIds.has(node.id)) {
      node.children.forEach(visit);
    }
  }
  nodes.forEach(visit);
  return result;
}

export function computeGroupTotal(
  nodeOrId: string,
  key: ValorKey,
  allRows: GastoVarioFila[],
): number {
  const children = allRows.filter(r => r.parent_id === nodeOrId);
  if (children.length === 0) {
    const row = allRows.find(r => r.id === nodeOrId);
    return row?.valores?.[key] ?? 0;
  }
  return children.reduce((sum, c) => sum + computeGroupTotal(c.id, key, allRows), 0);
}

export function calcPct(
  value: number | undefined,
  parentId: string | null,
  key: ValorKey,
  allRows: GastoVarioFila[],
): number | null {
  if (value === undefined || value === null) return null;
  let base = 0;
  if (parentId) {
    const parent = allRows.find(r => r.id === parentId);
    if (parent) {
      base = parent.valores?.[key] ?? computeGroupTotal(parent.id, key, allRows);
    }
  } else {
    const roots = allRows.filter(r => r.parent_id === null || r.parent_id === undefined);
    base = roots.reduce((s, r) => s + (r.valores?.[key] ?? 0), 0);
  }
  if (base === 0) return null;
  return (value / base) * 100;
}

export function hasChildren(id: string, allRows: GastoVarioFila[]): boolean {
  return allRows.some(r => r.parent_id === id);
}
