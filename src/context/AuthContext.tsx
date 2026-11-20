import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User as SupabaseAuthUser, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, getSupabaseConfigError } from '../lib/supabase.ts';
import {
  fetchProfileById,
  saveProfileToSupabase,
} from '../lib/profileService.ts';
import { safeStorage, safeReplaceState } from '../utils/safeStorage.ts';
import type { User } from '../types/index.ts';
import { unregisterAllPushChannels } from '../lib/nativePushService.ts';

export type AuthView =
  | 'signin'
  | 'signup'
  | 'forgot-password'
  | 'reset-password'
  | 'profile-setup'
  | 'app';

export interface AuthContextType {
  user: SupabaseAuthUser | null;
  session: Session | null;
  profile: (User & { onboardingCompleted: boolean }) | null;
  loading: boolean;
  authView: AuthView;
  isConfigured: boolean;
  configError: string | null;
  setAuthView: (view: AuthView) => void;
  signUp: (
    fullName: string,
    email: string,
    password: string
  ) => Promise<{ success: boolean; error?: string; requireEmailConfirmation?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  resetPasswordForEmail: (email: string) => Promise<{ success: boolean; error?: string }>;
  updateUserPassword: (password: string) => Promise<{ success: boolean; error?: string }>;
  saveProfile: (updates: {
    fullName?: string;
    username?: string;
    department?: string;
    faculty?: string;
    level?: string;
    campus?: string;
    bio?: string;
    interests?: string[];
    avatarUrl?: string;
    avatarAssetId?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  skipOnboarding: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<SupabaseAuthUser | null>(null);
  const [profile, setProfile] = useState<(User & { onboardingCompleted: boolean }) | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authView, setAuthViewState] = useState<AuthView>(() => {
    if (typeof window !== 'undefined') {
      const search = window.location.search;
      const hash = window.location.hash;
      const params = new URLSearchParams(search);
      const viewParam = params.get('view');
      if (hash.includes('type=recovery') || search.includes('type=recovery')) {
        return 'reset-password';
      }
      if (
        viewParam === 'signup' ||
        viewParam === 'forgot-password' ||
        viewParam === 'reset-password' ||
        viewParam === 'profile-setup'
      ) {
        return viewParam as AuthView;
      }
    }
    return 'signin';
  });

  const isConfigured = isSupabaseConfigured();
  const configError = getSupabaseConfigError();

  // Guards to prevent duplicate profile fetches, UI churn, and unintended logouts
  const loadedProfileUserIdRef = React.useRef<string | null>(null);
  const profileFetchPromiseRef = React.useRef<{
    userId: string;
    promise: Promise<void>;
  } | null>(null);
  const activeSessionRef = React.useRef<Session | null>(null);
  const explicitSignOutRef = React.useRef<boolean>(false);

  const updateUserStable = React.useCallback((nextUser: SupabaseAuthUser | null) => {
    setUser((prev) => {
      if (prev === nextUser) return prev;
      if (!prev || !nextUser) return nextUser;
      if (
        prev.id === nextUser.id &&
        prev.email === nextUser.email &&
        prev.updated_at === nextUser.updated_at
      ) {
        return prev;
      }
      return nextUser;
    });
  }, []);

  const updateSessionStable = React.useCallback((nextSession: Session | null) => {
    activeSessionRef.current = nextSession;
    setSession((prev) => {
      if (prev === nextSession) return prev;
      if (!prev || !nextSession) return nextSession;
      if (
        prev.access_token === nextSession.access_token &&
        prev.user?.id === nextSession.user?.id
      ) {
        return prev;
      }
      return nextSession;
    });
  }, []);

  const setAuthView = React.useCallback((view: AuthView) => {
    setAuthViewState((prev) => (prev === view ? prev : view));
    // Update URL query view without page reload only when needed
    if (typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href);
        const currentViewParam = url.searchParams.get('view');
        const nextViewParam = view === 'app' ? null : view;
        if (currentViewParam !== nextViewParam) {
          if (nextViewParam === null) {
            url.searchParams.delete('view');
          } else {
            url.searchParams.set('view', nextViewParam);
          }
          safeReplaceState({}, '', url.toString());
        }
      } catch {}
    }
  }, []);

  const loadUserProfile = React.useCallback(
    async (
      userId: string,
      authEmail?: string | null,
      options?: { force?: boolean; userMetadata?: Record<string, any> }
    ) => {
      const force = Boolean(options?.force);

      // Deduplicate concurrent fetches for the same user
      if (
        !force &&
        profileFetchPromiseRef.current &&
        profileFetchPromiseRef.current.userId === userId
      ) {
        return profileFetchPromiseRef.current.promise;
      }

      const run = (async () => {
        // 1. Check local persistent store for this specific user
        const localStatus =
          safeStorage.getItem(`absu_onboarding_${userId}`) ||
          safeStorage.getItem(`absu_user_onboarded_${userId}`);

        // 2. Check Supabase user metadata passed from active session/user without calling auth.getUser()
        // (auth.getUser() can trigger GoTrueClient._removeSession() on transient session_not_found errors)
        const meta = options?.userMetadata || activeSessionRef.current?.user?.user_metadata;
        const metaOnboarded = Boolean(
          meta?.onboarding_completed || meta?.onboarding_skipped
        );

        const loaded = await fetchProfileById(userId, authEmail);

        // If profile row exists in DB, or user has marked skipped/completed in local/metadata
        const isAlreadyOnboardedOrSkipped = Boolean(
          localStatus === 'completed' ||
            localStatus === 'skipped' ||
            localStatus === 'true' ||
            metaOnboarded ||
            (loaded !== null && Boolean(loaded.id))
        );

        loadedProfileUserIdRef.current = userId;

        if (loaded) {
          const isComplete = isAlreadyOnboardedOrSkipped || loaded.onboardingCompleted;
          setProfile({
            ...loaded,
            onboardingCompleted: isComplete,
          });

          if (isComplete) {
            setAuthView('app');
          } else {
            setAuthView('profile-setup');
          }
        } else {
          // Profile row does not exist yet; create provisional user
          const provisionalUser: User & { onboardingCompleted: boolean } = {
            id: userId,
            name: authEmail ? authEmail.split('@')[0] : 'ABSU Student',
            avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
              authEmail || 'ABSU'
            )}&backgroundColor=6d45d9&textColor=ffffff`,
            handle: '@student',
            department: 'Undergraduate Student',
            faculty: 'Abia State University',
            level: '100 Level',
            campus: 'Uturu (Main Campus)',
            bio: '',
            interests: [],
            relationshipState: 'self',
            onboardingCompleted: isAlreadyOnboardedOrSkipped,
          };
          setProfile(provisionalUser);
          if (isAlreadyOnboardedOrSkipped) {
            setAuthView('app');
          } else {
            setAuthView('profile-setup');
          }
        }
      })();

      profileFetchPromiseRef.current = { userId, promise: run };
      try {
        await run;
      } finally {
        if (profileFetchPromiseRef.current?.promise === run) {
          profileFetchPromiseRef.current = null;
        }
      }
    },
    [setAuthView]
  );

  // Initial session recovery and URL routing check
  useEffect(() => {
    let mounted = true;

    async function initSession() {
      try {
        // Check URL for recovery or specific auth view
        const hash = window.location.hash;
        const search = window.location.search;
        const params = new URLSearchParams(search);
        const viewParam = params.get('view');

        const isRecovery =
          hash.includes('type=recovery') ||
          search.includes('type=recovery') ||
          viewParam === 'reset-password';

        if (isRecovery) {
          setAuthViewState('reset-password');
        } else if (viewParam === 'signup') {
          setAuthViewState('signup');
        } else if (viewParam === 'forgot-password') {
          setAuthViewState('forgot-password');
        } else if (viewParam === 'profile-setup') {
          setAuthViewState('profile-setup');
        }

        if (!isConfigured) {
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.warn('Get session error:', error.message);
        }

        if (mounted && data?.session) {
          explicitSignOutRef.current = false;
          updateSessionStable(data.session);
          updateUserStable(data.session.user);
          if (!isRecovery) {
            await loadUserProfile(data.session.user.id, data.session.user.email, {
              userMetadata: data.session.user.user_metadata,
            });
          }
        }
      } catch (err) {
        console.warn('Auth init error:', err);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    initSession();

    // Listen to real-time auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!mounted) return;

      if (event === 'PASSWORD_RECOVERY') {
        if (currentSession) {
          updateSessionStable(currentSession);
          updateUserStable(currentSession.user);
        }
        setAuthViewState('reset-password');
        return;
      }

      if (event === 'INITIAL_SESSION') {
        if (currentSession?.user) {
          explicitSignOutRef.current = false;
          updateSessionStable(currentSession);
          updateUserStable(currentSession.user);
          if (loadedProfileUserIdRef.current !== currentSession.user.id) {
            await loadUserProfile(currentSession.user.id, currentSession.user.email, {
              userMetadata: currentSession.user.user_metadata,
            });
          }
        }
        // Never overwrite an active session if a late INITIAL_SESSION fires with null
        return;
      }

      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        // Ignore null payloads on refresh/update ticks so transient failures don't log out the user
        if (currentSession?.user) {
          updateSessionStable(currentSession);
          updateUserStable(currentSession.user);
        }
        return;
      }

      if (event === 'SIGNED_IN' && currentSession?.user) {
        explicitSignOutRef.current = false;
        updateSessionStable(currentSession);
        updateUserStable(currentSession.user);
        // Avoid re-fetching profile on tab-focus or duplicate initial SIGNED_IN bursts for the already-loaded user
        if (loadedProfileUserIdRef.current !== currentSession.user.id) {
          await loadUserProfile(currentSession.user.id, currentSession.user.email, {
            userMetadata: currentSession.user.user_metadata,
          });
        }
        return;
      }

      if (event === 'SIGNED_OUT') {
        // If another tab or transient race triggered SIGNED_OUT while we did not explicitly sign out,
        // verify whether a valid session still exists in storage before clearing user state.
        if (!explicitSignOutRef.current) {
          try {
            const { data } = await supabase.auth.getSession();
            if (mounted && data?.session?.user) {
              updateSessionStable(data.session);
              updateUserStable(data.session.user);
              return;
            }
          } catch {
            // Fall through to sign out cleanup if session cannot be recovered
          }
        }

        explicitSignOutRef.current = false;
        loadedProfileUserIdRef.current = null;
        profileFetchPromiseRef.current = null;
        updateSessionStable(null);
        updateUserStable(null);
        setProfile(null);
        setAuthViewState((prev) =>
          ['signup', 'forgot-password', 'reset-password', 'profile-setup'].includes(prev)
            ? prev
            : 'signin'
        );
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [isConfigured, loadUserProfile, updateSessionStable, updateUserStable]);

  const signUp = async (
    fullName: string,
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string; requireEmailConfirmation?: boolean }> => {
    if (!isConfigured) {
      return { success: false, error: configError || 'Supabase is not configured.' };
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            name: fullName.trim(),
          },
          emailRedirectTo: `${window.location.origin}/?view=profile-setup`,
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }

      // If user was created and session established immediately:
      if (data.session && data.user) {
        explicitSignOutRef.current = false;
        updateSessionStable(data.session);
        updateUserStable(data.user);
        // Save initial profile row with name
        await saveProfileToSupabase(data.user.id, {
          fullName: fullName.trim(),
        });
        await loadUserProfile(data.user.id, email, {
          force: true,
          userMetadata: data.user.user_metadata,
        });
        setAuthViewState('profile-setup');
        return { success: true, requireEmailConfirmation: false };
      }

      // If Supabase has email confirmation enabled
      if (data.user && !data.session) {
        return { success: true, requireEmailConfirmation: true };
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      return { success: false, error: msg };
    }
  };

  const signIn = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!isConfigured) {
      return { success: false, error: configError || 'Supabase is not configured.' };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data.session && data.user) {
        explicitSignOutRef.current = false;
        updateSessionStable(data.session);
        updateUserStable(data.user);
        await loadUserProfile(data.user.id, data.user.email, {
          force: true,
          userMetadata: data.user.user_metadata,
        });
        return { success: true };
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign in failed';
      return { success: false, error: msg };
    }
  };

  const signOut = async () => {
    explicitSignOutRef.current = true;
    if (user) {
      await unregisterAllPushChannels(user.id).catch(() => {});
    }
    if (isConfigured) {
      await supabase.auth.signOut().catch((e) => console.warn('Sign out warning:', e));
    }
    loadedProfileUserIdRef.current = null;
    profileFetchPromiseRef.current = null;
    updateSessionStable(null);
    updateUserStable(null);
    setProfile(null);
    setAuthViewState('signin');
  };

  const resetPasswordForEmail = async (
    email: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!isConfigured) {
      return { success: false, error: configError || 'Supabase is not configured.' };
    }

    try {
      const redirectUrl = `${window.location.origin}/?view=reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirectUrl,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Password reset failed';
      return { success: false, error: msg };
    }
  };

  const updateUserPassword = async (
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!isConfigured) {
      return { success: false, error: configError || 'Supabase is not configured.' };
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Password update failed';
      return { success: false, error: msg };
    }
  };

  const saveProfile = async (updates: {
    fullName?: string;
    username?: string;
    department?: string;
    faculty?: string;
    level?: string;
    campus?: string;
    bio?: string;
    interests?: string[];
    avatarUrl?: string;
    avatarAssetId?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    if (!user) {
      return { success: false, error: 'User is not authenticated' };
    }

    // Persist completed onboarding state locally
    safeStorage.setItem(`absu_onboarding_${user.id}`, 'completed');

    // Persist completed onboarding in Supabase user metadata
    try {
      await supabase.auth.updateUser({
        data: {
          onboarding_completed: true,
          faculty: updates.faculty,
          interests: updates.interests,
        },
      });
    } catch (e) {
      console.warn('Could not update auth user metadata:', e);
    }

    const res = await saveProfileToSupabase(user.id, updates);
    if (res.success) {
      if (profile) {
        setProfile({
          ...profile,
          name: updates.fullName || updates.username || profile.name,
          department: updates.department || profile.department,
          faculty: updates.faculty || profile.faculty,
          level: updates.level || profile.level,
          campus: updates.campus || profile.campus,
          bio: updates.bio !== undefined ? updates.bio : profile.bio,
          interests: updates.interests || profile.interests,
          avatar: updates.avatarUrl || profile.avatar,
          onboardingCompleted: true,
        });
      }
      setAuthView('app');
      await loadUserProfile(user.id, user.email, { force: true });
      import('../lib/notificationService.ts')
        .then(({ triggerWelcomeDiscoveryNotification }) => triggerWelcomeDiscoveryNotification(user.id))
        .catch(() => {});
    }
    return res;
  };

  const skipOnboarding = async () => {
    if (!user) return;

    // 1. Persist skip in localStorage for instant synchronous restoration
    safeStorage.setItem(`absu_onboarding_${user.id}`, 'skipped');
    safeStorage.setItem(`absu_user_onboarded_${user.id}`, 'true');

    // 2. Persist skip in Supabase user metadata across devices & sessions
    try {
      await supabase.auth.updateUser({
        data: { onboarding_skipped: true, onboarding_completed: true },
      });
    } catch (e) {
      console.warn('Could not persist skip in Supabase user metadata:', e);
    }

    // 3. Upsert initial profile in Supabase profiles table so the row exists in DB
    try {
      await saveProfileToSupabase(user.id, {
        fullName:
          profile?.name ||
          user.user_metadata?.full_name ||
          user.user_metadata?.display_name ||
          user.email?.split('@')[0] ||
          'ABSU Student',
        department: profile?.department || 'Undergraduate Student',
        faculty: profile?.faculty || 'Abia State University',
        level: profile?.level || '100 Level',
        campus: profile?.campus || 'Uturu (Main Campus)',
      });
    } catch (e) {
      console.warn('Could not upsert profile on skip:', e);
    }

    // 4. Mark profile as complete in-memory
    if (profile) {
      setProfile({ ...profile, onboardingCompleted: true });
    }

    // 5. Trigger idempotent welcome notification non-blockingly & navigate into app
    import('../lib/notificationService.ts')
      .then(({ triggerWelcomeDiscoveryNotification }) => triggerWelcomeDiscoveryNotification(user.id))
      .catch(() => {});
    setAuthView('app');
  };

  const refreshProfile = async () => {
    if (user) {
      await loadUserProfile(user.id, user.email, {
        force: true,
        userMetadata: user.user_metadata,
      });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        authView,
        isConfigured,
        configError,
        setAuthView,
        signUp,
        signIn,
        signOut,
        resetPasswordForEmail,
        updateUserPassword,
        saveProfile,
        skipOnboarding,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
