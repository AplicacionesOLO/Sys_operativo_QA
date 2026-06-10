import type { Factor } from '@/types/factores';

export const mockFactores: Factor[] = [
  { id: 'mock-1', nombre: 'Margen de beneficio', valor: 1.25, descripcion: 'Multiplicador para agregar margen de beneficio al costo' },
  { id: 'mock-2', nombre: 'Tasa indirecta', valor: 0.15, descripcion: 'Porcentaje de costos indirectos sobre costos directos' },
  { id: 'mock-3', nombre: 'Ajuste inflación', valor: 1.08, descripcion: 'Factor de ajuste por inflación anual' },
];