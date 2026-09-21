import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';
import type { Session, User } from '@supabase/supabase-js';
import { Profile, UserRole } from './supabase';

WebBrowser.maybeCompleteAuthSession();

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string, role?: UserRole) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isAdmin: boolean;
  isMerchant: boolean;
  isPublisher: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    setProfile(data as Profile | null);
  };

  useEffect(() => {
    console.log('[AuthContext] mount: calling getSession()', { time: new Date().toISOString() });
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      console.log('[AuthContext] getSession() resolved', {
        hasSession: !!session,
        user_id: session?.user?.id ?? null,
        error,
        time: new Date().toISOString(),
      });
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log(`%c[AuthContext] onAuthStateChange event: ${event}`, 'color:#0c0;font-weight:bold', {
        hasSession: !!session,
        user_id: session?.user?.id ?? null,
        time: new Date().toISOString(),
      });
      (async () => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchProfile(session.user.id);
        } else {
          setProfile(null);
        }
        setLoading(false);
      })();
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string, fullName: string, role: UserRole = 'customer') => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role } },
    });
    if (error) return { error: error.message };
    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        full_name: fullName,
        role,
      });
      if (role === 'publisher' || role === 'merchant') {
        await supabase.from('wallets').upsert({
          user_id: data.user.id,
        }).eq('user_id', data.user.id);
      }
    }
    return { error: null };
  };

  const signInWithGoogle = async () => {
    const redirectTo = Linking.createURL('/auth/callback');

    // على الويب: نترك Supabase يحوّل المتصفح مباشرة، وصفحة /auth/callback
    // هي اللي بتكمل الجلسة لما يرجع المستخدم.
    if (Platform.OS === 'web') {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      return { error: error?.message ?? null };
    }

    // على الموبايل: نفتح المتصفح داخل التطبيق (in-app browser) ونمسك رابط
    // الرجوع بأنفسنا، لأن supabase-js ما بيفتح المتصفح تلقائياً على React Native.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data?.url) {
      return { error: error?.message ?? 'تعذّر بدء تسجيل الدخول عبر Google.' };
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success' || !result.url) {
      return { error: null }; // المستخدم ألغى العملية، لا داعي لإظهار خطأ.
    }

    // نستخرج الكود من رابط الرجوع ونستبدله بجلسة مباشرة هون. لا يمكن الاعتماد
    // على أنّ نظام الروابط العميقة (deep link) رح يفتح صفحة /auth/callback
    // تلقائياً بعد إغلاق متصفح تسجيل الدخول — على أندرويد تحديداً، إغلاق
    // المتصفح والعودة للتطبيق ما بيولّد حدث Linking جديد دائماً، فتضل الجلسة
    // بدون استبدال ويرجع المستخدم على شاشة الدخول وكأنو ما صار شي.
    try {
      const url = new URL(result.url);
      const code = url.searchParams.get('code');
      const oauthError = url.searchParams.get('error_description') || url.searchParams.get('error');

      if (oauthError) {
        return { error: oauthError };
      }
      if (!code) {
        return { error: 'تعذّر إكمال تسجيل الدخول عبر Google (لا يوجد كود).' };
      }

      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        return { error: exchangeError.message };
      }
    } catch (e) {
      console.log('[signInWithGoogle] failed to exchange code', e);
      return { error: 'تعذّر إكمال تسجيل الدخول عبر Google.' };
    }

    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  const isAdmin = profile?.role === 'admin';
  const isMerchant = profile?.role === 'merchant';
  const isPublisher = profile?.role === 'publisher';

  return (
    <AuthContext.Provider
      value={{ session, user, profile, loading, signIn, signUp, signInWithGoogle, signOut, refreshProfile, isAdmin, isMerchant, isPublisher }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
