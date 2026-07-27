import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nlzfosfyyqileruosebi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Y3LMoUlPhKePXDmpvrdojg_iykWuPMM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
