/**
 * Fire-and-forget audit logger. NEVER throws, NEVER blocks the UI.
 * Just call logChange(...) anywhere — it runs in the background.
 */
import { supabase } from './supabase';

export interface AuditEntry {
  modulo: string;
  accion: string;
  entidad_tipo?: string;
  entidad_id?: string;
  entidad_label?: string;
  campo?: string;
  valor_antes?: unknown;
  valor_despues?: unknown;
}

export function logChange(entry: AuditEntry): void {
  (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      await supabase.from('bitacora_cambios').insert({
        user_id: session.user.id,
        user_email: session.user.email ?? '',
        modulo: entry.modulo,
        accion: entry.accion,
        entidad_tipo: entry.entidad_tipo ?? null,
        entidad_id: entry.entidad_id ?? null,
        entidad_label: entry.entidad_label ?? null,
        campo: entry.campo ?? null,
        valor_antes: entry.valor_antes !== undefined ? entry.valor_antes : null,
        valor_despues: entry.valor_despues !== undefined ? entry.valor_despues : null,
      });
    } catch {
      // silent — logging must never break the app
    }
  })();
}
