import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string)
  || 'https://cqdupetgpzkvouslupfm.supabase.co';

const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string)
  || 'sb_publishable_f4JoGp9_2lMJClJO0Yh-pQ_RDnrGsJF';

export const isSupabaseReady = true;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
