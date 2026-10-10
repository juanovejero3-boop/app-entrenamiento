import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';

export { SUPABASE_URL };
export const supaClient = createClient(SUPABASE_URL, SUPABASE_KEY);
