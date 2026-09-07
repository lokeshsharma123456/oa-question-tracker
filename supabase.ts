import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'https://vgudzexlarfwbkaydwek.supabase.co'
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_O8IGrP5ey4swY_Rt32AaWQ_xzjiJj3a'

export const supabase = createClient(supabaseUrl, supabasePublishableKey)
