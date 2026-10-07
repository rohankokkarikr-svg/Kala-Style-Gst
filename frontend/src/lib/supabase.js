// Supabase client configuration
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://fwuhlhaadhhveuljsqbh.supabase.co';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3dWhsaGFhZGhodmV1bGpzcWJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3ODkzODYsImV4cCI6MjEwNDM2NTM4Nn0.1sz1xgfYWGv0Ad6kCZ6KgAcYGJZG2eX0sn3o91nNlJ8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export default supabase;
