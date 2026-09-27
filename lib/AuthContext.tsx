import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';
import type { Session, User } from '@supabase/supabase-js';
import { Profile, UserRole } from './supabase';
import { activeRoleKeys, canAccessCompanyInMemberships, hasPermissionInMemberships, hasPlatformPermissionInMemberships, Membership, CompanySummary } from './permissions';

WebBrowser.maybeCompleteAuthSession();

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  memberships: Membership[];
  companies: CompanySummary[];
  activeMembership: Membership | null;
  activeCompany: CompanySummary | null;
  setActiveCompany: (companyId: string | null) => void;
  permissions: string[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string, role?: UserRole) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshAuthorization: () => Promise<void>;
  hasPermission: (permission: string, companyId?: string | null) => boolean;
  hasPlatformPermission: (permission: string) => boolean;
  canAccessCompany: (companyId: string) => boolean;
  isAdmin: boolean;
  isMerchant: boolean;
  isPublisher: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAuthorization = useCallback(async (userId: string) => {
    const { data: profileData } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    const nextProfile = (profileData as Profile | null) ?? null;
    setProfile(nextProfile);

    const { data: membershipRows, error: membershipError } = await supabase
      .from('user_memberships')
      .select('id,user_id,role_id,company_id,status')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (membershipError || !membershipRows?.length) {
      // Fail closed when the RBAC migration has not been applied or memberships cannot be read.
      setMemberships([]);
      setCompanies([]);
      return;
    }

    const rows = membershipRows as Array<{
      id: string; user_id: string; role_id: string; company_id: string | null; status: Membership['status'];
    }>;
    const roleIds = [...new Set(rows.map((row) => row.role_id))];
    const { data: roleRows } = await supabase.from('roles').select('id,key,name,scope_type,company_id').in('id', roleIds);
    const roles = (roleRows ?? []) as Array<{ id: string; key: string; name: string; scope_type: Membership['role']['scope_type']; company_id: string | null }>;
    const roleById = new Map(roles.map((role) => [role.id, role]));
    const { data: grantRows } = await supabase.from('role_permissions').select('role_id,permission_id').in('role_id', roleIds);
    const grants = (grantRows ?? []) as Array<{ role_id: string; permission_id: string }>;
    const permissionIds = [...new Set(grants.map((grant) => grant.permission_id))];
    const permissionById = new Map<string, string>();
    if (permissionIds.length) {
      const { data: permissionRows } = await supabase.from('permissions').select('id,key').in('id', permissionIds);
      for (const permission of (permissionRows ?? []) as Array<{ id: string; key: string }>) {
        permissionById.set(permission.id, permission.key);
      }
    }
    const permissionsByRole = new Map<string, string[]>();
    for (const grant of grants) {
      const key = permissionById.get(grant.permission_id);
      if (!key) continue;
      permissionsByRole.set(grant.role_id, [...(permissionsByRole.get(grant.role_id) ?? []), key]);
    }
    const nextMemberships: Membership[] = rows.flatMap((row) => {
      const role = roleById.get(row.role_id);
      if (!role) return [];
      return [{ ...row, role: { key: role.key, name: role.name, scope_type: role.scope_type, company_id: role.company_id }, permissions: permissionsByRole.get(row.role_id) ?? [] }];
    });
    setMemberships(nextMemberships);

    const companyIds = [...new Set(nextMemberships.map((membership) => membership.company_id).filter((id): id is string => !!id))];
    if (companyIds.length) {
      const { data: companyRows } = await supabase.from('companies').select('id,name,slug,status').in('id', companyIds);
      setCompanies((companyRows ?? []) as CompanySummary[]);
    } else {
      setCompanies([]);
    }
  }, []);

  const refreshAuthorization = useCallback(async () => {
    if (user?.id) await fetchAuthorization(user.id);
    else {
      setProfile(null);
      setMemberships([]);
      setCompanies([]);
    }
  }, [fetchAuthorization, user?.id]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      if (!mounted) return;
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      if (currentSession?.user) {
        fetchAuthorization(currentSession.user.id).finally(() => { if (mounted) setLoading(false); });
      } else {
        setLoading(false);
      }
    }).catch(() => { if (mounted) setLoading(false); });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (nextSession?.user) {
        setLoading(true);
        // Defer data calls so Supabase's auth event lock is released first.
        setTimeout(() => {
          if (mounted) fetchAuthorization(nextSession.user.id).finally(() => { if (mounted) setLoading(false); });
        }, 0);
      } else {
        setProfile(null);
        setMemberships([]);
        setCompanies([]);
        setSelectedCompanyId(null);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [fetchAuthorization]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string, fullName: string, role: UserRole = 'customer') => {
    // Only the harmless publisher self-enrollment is user-selectable. Platform/company roles are
    // never accepted from signup metadata or written to profiles by a client.
    const requestedRole = role === 'publisher' ? 'publisher' : 'customer';
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, signup_requested_role: requestedRole } },
    });
    if (error) return { error: error.message };
    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: data.user.id,
        full_name: fullName,
      });
      if (profileError) return { error: profileError.message };
      if (requestedRole === 'publisher' && data.session) {
        const { error: publisherError } = await supabase.rpc('request_publisher_membership');
        if (publisherError) return { error: publisherError.message };
      }
    }
    return { error: null };
  };

  const signInWithGoogle = async () => {
    const redirectTo = Linking.createURL('/auth/callback');
    if (Platform.OS === 'web') {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
      return { error: error?.message ?? null };
    }
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data?.url) return { error: error?.message ?? 'تعذّر بدء تسجيل الدخول عبر Google.' };
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success' || !result.url) return { error: null };
    try {
      const url = new URL(result.url);
      const code = url.searchParams.get('code');
      const oauthError = url.searchParams.get('error_description') || url.searchParams.get('error');
      if (oauthError) return { error: oauthError };
      if (!code) return { error: 'تعذّر إكمال تسجيل الدخول عبر Google (لا يوجد كود).' };
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) return { error: exchangeError.message };
    } catch {
      return { error: 'تعذّر إكمال تسجيل الدخول عبر Google.' };
    }
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setMemberships([]);
    setCompanies([]);
    setSelectedCompanyId(null);
  };

  const refreshProfile = refreshAuthorization;
  const accountEnabled = !!profile && profile.is_active !== false && profile.is_banned !== true;
  const hasPermission = useCallback((permission: string, companyId?: string | null) =>
    accountEnabled && hasPermissionInMemberships(memberships, permission, companyId), [accountEnabled, memberships]);
  const hasPlatformPermission = useCallback((permission: string) =>
    accountEnabled && hasPlatformPermissionInMemberships(memberships, permission), [accountEnabled, memberships]);
  const canAccessCompany = useCallback((companyId: string) =>
    accountEnabled && canAccessCompanyInMemberships(memberships, companyId), [accountEnabled, memberships]);
  const setActiveCompany = useCallback((companyId: string | null) => {
    if (companyId === null || canAccessCompanyInMemberships(memberships, companyId)) setSelectedCompanyId(companyId);
  }, [memberships]);
  const activeMembership = useMemo(() =>
    (selectedCompanyId ? memberships.find((membership) => membership.company_id === selectedCompanyId) : null) ??
    memberships.find((membership) => membership.role.scope_type === 'company') ?? memberships[0] ?? null,
  [memberships, selectedCompanyId]);
  const activeCompany = useMemo(() => companies.find((company) => company.id === activeMembership?.company_id) ?? null, [companies, activeMembership]);
  const roles = useMemo(() => activeRoleKeys(memberships), [memberships]);
  const isAdmin = accountEnabled && (roles.has('platform_owner') || roles.has('platform_admin'));
  const isMerchant = accountEnabled && (roles.has('company_manager') || roles.has('company_admin'));
  const isPublisher = accountEnabled && roles.has('publisher');
  const permissions = useMemo(() => [...new Set(memberships.flatMap((membership) => membership.permissions))], [memberships]);

  return (
    <AuthContext.Provider value={{
      session, user, profile, memberships, companies, activeMembership, activeCompany, setActiveCompany, permissions, loading,
      signIn, signUp, signInWithGoogle, signOut, refreshProfile, refreshAuthorization,
      hasPermission, hasPlatformPermission, canAccessCompany, isAdmin, isMerchant, isPublisher,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
