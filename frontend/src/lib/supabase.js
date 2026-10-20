// Supabase client configuration for Frontend (Create React App)
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.REACT_APP_SUPABASE_URL || '').trim();
// Preferred modern name: REACT_APP_SUPABASE_PUBLISHABLE_KEY, fallback to legacy REACT_APP_SUPABASE_ANON_KEY
const supabaseKey = (
  process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY ||
  process.env.REACT_APP_SUPABASE_ANON_KEY ||
  ''
).trim();

const isTest = process.env.NODE_ENV === 'test';
const isProduction = process.env.NODE_ENV === 'production';

if (!supabaseUrl || !supabaseKey) {
  if (isProduction) {
    console.error(
      'CRITICAL: Supabase frontend configuration is missing. ' +
      'Please set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_PUBLISHABLE_KEY in your hosting environment.'
    );
  } else if (!isTest) {
    console.warn(
      '⚠️ REACT_APP_SUPABASE_URL or REACT_APP_SUPABASE_PUBLISHABLE_KEY is not configured in environment.'
    );
  }
}

// In test environment, use mock URL/key for offline test runner
const effectiveUrl = supabaseUrl || (isTest ? 'https://test-placeholder.supabase.co' : 'https://unconfigured.supabase.co');
const effectiveKey = supabaseKey || (isTest ? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.mock_anon_key' : 'unconfigured_publishable_key');

export const supabase = createClient(effectiveUrl, effectiveKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export default supabase;
