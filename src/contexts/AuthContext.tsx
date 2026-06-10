import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Profile, Role, RolePermission } from '@/types/auth';

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  role: Role | null;
  permissions: RolePermission[];
  session: Session | null;
  loading: boolean;
  canView: (moduleKey: string) => boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*, role:roles(*)')
      .eq('id', userId)
      .maybeSingle();

    if (profileData) {
      setProfile(profileData as Profile);
      const roleData = (profileData as unknown as { role: Role | null }).role;
      setRole(roleData);

      if (roleData?.id) {
        const { data: permsData } = await supabase
          .from('role_permissions')
          .select('*')
          .eq('rol_id', roleData.id);
        setPermissions(permsData ?? []);
      } else {
        setPermissions([]);
      }
    }
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user.id);
      } else {
        setProfile(null);
        setRole(null);
        setPermissions([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const canView = (moduleKey: string): boolean => {
    if (!role) return false;
    if (role.nombre === 'Administrador') return true;
    const perm = permissions.find((p) => p.module_key === moduleKey);
    return perm?.can_view ?? false;
  };

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        return { error: 'Credenciales inválidas. Verifica tu correo y contraseña.' };
      }
      return { error: error.message };
    }
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setRole(null);
    setPermissions([]);
  };

  return (
    <AuthContext.Provider value={{ user, profile, role, permissions, session, loading, canView, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
