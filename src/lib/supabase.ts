import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string)
  || 'https://jnbhebbfkrmmsytilgnz.supabase.co';

const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string)
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpuYmhlYmJma3JtbXN5dGlsZ256Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwOTczNjcsImV4cCI6MjA5NjY3MzM2N30.IocbSUiE7TXbRPrI3P1PM-uT1wGok7yyvtv1eH-Olok';

export const isSupabaseReady = true;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
