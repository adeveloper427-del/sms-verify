/**
 * Authentication.
 *
 * Mock mode:     checks the demo accounts in src/data/users.ts.
 * Supabase mode: Supabase Auth (email + password). The user's role and manufacturer
 *                come from the `profiles` table. One login form for everyone — the role
 *                decides which dashboard opens (the admin option is never shown).
 */
import { DEMO_ACCOUNTS } from '../data/users';
import type { User } from '../types';
import { USE_MOCK_API } from './config';
import { invalidateCache } from './supabase/supabaseApi';
import { getSupabase } from './supabaseClient';

const USER_KEY = 'halisi.user';

export function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY) ?? sessionStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function saveUser(user: User, remember: boolean) {
  (remember ? localStorage : sessionStorage).setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  [localStorage, sessionStorage].forEach((s) => s.removeItem(USER_KEY));
  if (!USE_MOCK_API) {
    invalidateCache();
    void getSupabase().auth.signOut();
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ProfileRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: User['role'];
  manufacturer_id: string | null;
  title: string | null;
}

export async function login(identifier: string, password: string, remember: boolean): Promise<User> {
  const id = identifier.trim().toLowerCase();

  if (USE_MOCK_API) {
    await wait(800);
    const account = DEMO_ACCOUNTS.find((a) => a.email === id || a.phone?.replace(/\s/g, '') === id.replace(/\s/g, ''));
    if (!account || account.password !== password) throw new Error('Incorrect email/phone or password.');
    const { password: _pw, ...user } = account;
    void _pw;
    saveUser(user, remember);
    return user;
  }

  if (!id.includes('@')) throw new Error('Please sign in with your email address.');
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email: id, password });
  if (error?.code === 'email_not_confirmed') throw new EmailNotVerifiedError(id);
  if (error || !data.user) throw new Error('Incorrect email or password.');
  return loadProfileUser(data.user.id, remember);
}

/** Thrown when the password is right but the email address has not been verified yet. */
export class EmailNotVerifiedError extends Error {
  readonly email: string;
  constructor(email: string) {
    super('Please verify your email first. Enter the 6-digit code we emailed you.');
    this.name = 'EmailNotVerifiedError';
    this.email = email;
  }
}

/**
 * Checks the code from the verification email. In Supabase mode a correct code also signs
 * the user in, so the signed-in user is returned; in mock mode it returns null (sign in next).
 */
export async function verifyEmailCode(email: string, code: string): Promise<User | null> {
  if (USE_MOCK_API) {
    await wait(700);
    if (code !== '123456') throw new Error('That code is not correct. (Demo mode: use 123456.)');
    return null;
  }
  const { data, error } = await getSupabase().auth.verifyOtp({ email: email.trim().toLowerCase(), token: code, type: 'email' });
  if (error || !data.user) throw new Error('That code is wrong or has expired. Check the email or send a new code.');
  return loadProfileUser(data.user.id, true);
}

/** Emails a fresh verification code. */
export async function resendEmailCode(email: string): Promise<void> {
  if (USE_MOCK_API) {
    await wait(700);
    return;
  }
  const { error } = await getSupabase().auth.resend({ type: 'signup', email: email.trim().toLowerCase() });
  if (error) {
    throw new Error(error.status === 429 ? 'Please wait a minute before asking for another code.' : 'Could not send a new code. Please try again.');
  }
}

/** Builds the app user from the signed-in account's profile row and remembers it. */
async function loadProfileUser(userId: string, remember: boolean): Promise<User> {
  const supabase = getSupabase();
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle<ProfileRow>();
  if (!profile) {
    await supabase.auth.signOut();
    throw new Error('This account is not set up yet. Ask the administrator to link it (setup_demo_users.sql).');
  }
  const user: User = {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    phone: profile.phone ?? undefined,
    role: profile.role,
    manufacturerId: profile.manufacturer_id ?? undefined,
    title: profile.title ?? undefined,
  };
  invalidateCache();
  saveUser(user, remember);
  return user;
}

/** On app start (Supabase mode): forget the saved user if their Supabase session has ended. */
export async function hasValidSession(): Promise<boolean> {
  if (USE_MOCK_API) return true;
  const { data } = await getSupabase().auth.getSession();
  return !!data.session;
}

export async function requestPasswordReset(identifier: string): Promise<void> {
  if (USE_MOCK_API || !identifier.includes('@')) {
    await wait(900);
    return;
  }
  await getSupabase().auth.resetPasswordForEmail(identifier.trim());
}

export async function changePassword(newPassword: string): Promise<void> {
  if (USE_MOCK_API) {
    await wait(700);
    return;
  }
  const { error } = await getSupabase().auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}
