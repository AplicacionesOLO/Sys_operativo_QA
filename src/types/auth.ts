export interface Role {
  id: string;
  nombre: string;
  descripcion: string | null;
  created_at: string;
  updated_at: string;
}

export interface RolePermission {
  id: string;
  rol_id: string;
  module_key: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_admin: boolean;
}

export interface Profile {
  id: string;
  nombre: string;
  correo: string;
  rol_id: string | null;
  estado: 'activo' | 'inactivo';
  created_at: string;
  updated_at: string;
  role?: Role;
}

export interface ProfileWithRole extends Profile {
  role: Role | null;
}

export const MODULES = [
  { key: 'dashboard', label: 'Dashboard', icon: 'ri-dashboard-3-line' },
  { key: 'areas', label: 'Catálogo de Áreas', icon: 'ri-map-pin-2-line' },
  { key: 'distribucion', label: 'Distribución de Áreas', icon: 'ri-pie-chart-2-line' },
  { key: 'inversion', label: 'Inversión', icon: 'ri-line-chart-line' },
  { key: 'costos', label: 'Costos por Operación', icon: 'ri-calculator-line' },
  { key: 'mano-obra', label: 'Mano de Obra', icon: 'ri-group-line' },
  { key: 'gastos-varios', label: 'Gastos Varios', icon: 'ri-bill-line' },
  { key: 'volumenes', label: 'Volúmenes', icon: 'ri-bar-chart-box-line' },
  { key: 'configuracion', label: 'Configuración', icon: 'ri-settings-3-line' },
] as const;

export type ModuleKey = typeof MODULES[number]['key'];
