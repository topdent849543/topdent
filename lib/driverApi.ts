import { supabase } from '@/lib/supabase';
export async function callDriverApi<T=any>(body:Record<string,unknown>):Promise<T>{const {data,error}=await supabase.functions.invoke('driver-api',{body});if(error)throw new Error(error.message);if(data?.error)throw new Error(data.error);return data as T;}
