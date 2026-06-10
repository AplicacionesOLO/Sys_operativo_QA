import { useState } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import UsuariosTab from './components/UsuariosTab';
import RolesTab from './components/RolesTab';

type Tab = 'usuarios' | 'roles';

export default function ConfiguracionPage() {
  const [activeTab, setActiveTab] = useState<Tab>('usuarios');

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'usuarios', label: 'Usuarios', icon: 'ri-group-line' },
    { key: 'roles', label: 'Roles y Permisos', icon: 'ri-shield-line' },
  ];

  return (
    <AppLayout title="Configuración" subtitle="Gestión de usuarios, roles y permisos del sistema">
      <div className="max-w-5xl">
        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit mb-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all cursor-pointer whitespace-nowrap ${
                activeTab === t.key
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <div className="w-4 h-4 flex items-center justify-center">
                <i className={`${t.icon} text-sm`} />
              </div>
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'usuarios' && <UsuariosTab />}
        {activeTab === 'roles' && <RolesTab />}
      </div>
    </AppLayout>
  );
}
