// Supabase client configuration
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || (process.env.NODE_ENV === 'test' ? 'https://test-placeholder.supabase.co' : '');
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || (process.env.NODE_ENV === 'test' ? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.mock_anon_key' : '');

if (!supabaseUrl || !supabaseAnonKey) {
  if (process.env.NODE_ENV !== 'test') {
    console.warn('⚠️ REACT_APP_SUPABASE_URL or REACT_APP_SUPABASE_ANON_KEY is not configured in environment.');
  }
}

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'dummy-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export default supabase;
