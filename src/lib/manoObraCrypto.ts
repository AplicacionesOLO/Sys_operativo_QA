import { supabase } from '@/lib/supabase';

const FUNCTION_URL = `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/mano-obra-crypto`;

/** Marca de prefijo para detectar valores encriptados */
export const ENC_PREFIX = 'ENC:';

export function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

async function getAuthToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

/**
 * Encripta un array de valores. Solo usuarios autenticados.
 * Usa AES-256-GCM en el servidor (edge function).
 */
export async function encryptValues(values: string[]): Promise<string[]> {
  if (values.length === 0) return [];
  const token = await getAuthToken();
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action: 'encrypt', values }),
  });
  if (!res.ok) throw new Error('Error al encriptar datos sensibles');
  const { result } = await res.json();
  return result as string[];
}

/**
 * Desencripta un array de valores. Solo rol Administrador.
 * El servidor valida el rol antes de devolver los datos.
 */
export async function decryptValues(values: string[]): Promise<string[]> {
  if (values.length === 0) return [];
  const token = await getAuthToken();
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action: 'decrypt', values }),
  });
  if (!res.ok) throw new Error('No autorizado para ver datos sensibles');
  const { result } = await res.json();
  return result as string[];
}

/**
 * Encripta un único valor.
 */
export async function encryptSingle(value: string): Promise<string> {
  const [encrypted] = await encryptValues([value]);
  return encrypted;
}

/**
 * Decripta un único valor.
 */
export async function decryptSingle(value: string): Promise<string> {
  const [decrypted] = await decryptValues([value]);
  return decrypted;
}
