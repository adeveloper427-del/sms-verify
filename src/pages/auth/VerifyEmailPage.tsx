import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, MailCheck, RotateCw, ShieldCheck } from 'lucide-react';
import { Button, Card, Input, Logo } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { USE_MOCK_API } from '../../services/config';
import { resendEmailCode } from '../../services/authService';

const RESEND_WAIT_SECONDS = 60;

interface VerifyState {
  email?: string;
  company?: string;
  /** true when the user came here from the sign-in page (code may have expired) */
  fromLogin?: boolean;
}

/** Public page: the user types the code from the verification email. A correct code signs them in. */
export function VerifyEmailPage() {
  useDocumentTitle('Verify your email');
  const { user, verifyEmail } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const state = (useLocation().state as VerifyState | null) ?? {};
  const [params] = useSearchParams();
  const email = (state.email ?? params.get('email') ?? '').trim().toLowerCase();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  // A code was just sent at registration, so make the user wait before asking again
  const [wait, setWait] = useState(state.fromLogin ? 0 : RESEND_WAIT_SECONDS);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/manufacturer'} replace />;
  if (!email) return <Navigate to="/login" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!/^\d{6,10}$/.test(code)) return setError('Enter the code from the email (numbers only).');
    setError(undefined);
    setChecking(true);
    try {
      const u = await verifyEmail(email, code);
      if (u) {
        toast.success('Email verified', 'Welcome to Halisi Verify.');
        navigate(u.role === 'admin' ? '/admin' : '/manufacturer', { replace: true });
      } else {
        toast.success('Email verified', 'You can now sign in.');
        navigate('/login', { replace: true, state: { email } });
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not verify the code.');
    } finally {
      setChecking(false);
    }
  };

  const resend = async () => {
    setFormError(null);
    setSending(true);
    try {
      await resendEmailCode(email);
      toast.success('New code sent', `Check ${email} (and the spam folder).`);
      setCode('');
      setWait(RESEND_WAIT_SECONDS);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not send a new code.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 bg-grid px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 flex items-center justify-between">
          <Logo />
          <Link to="/login" className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900">
            <ArrowLeft className="size-4" /> Sign in
          </Link>
        </div>

        <Card className="animate-slide-up p-6 sm:p-8">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <MailCheck className="size-6" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">Verify your email</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
            {state.fromLogin ? (
              <>
                Your email address has not been verified yet. Enter the code we sent to <strong className="text-slate-700">{email}</strong>, or send a new
                one.
              </>
            ) : (
              <>
                {state.company && (
                  <>
                    <strong className="text-slate-700">{state.company}</strong> has been registered.{' '}
                  </>
                )}
                We sent a 6-digit code to <strong className="text-slate-700">{email}</strong>. Enter it below to activate your login.
              </>
            )}
          </p>

          {formError && (
            <div role="alert" className="mt-5 flex animate-scale-in items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {formError}
            </div>
          )}

          <form onSubmit={submit} noValidate className="mt-6 space-y-4">
            <Input
              label="Verification code"
              icon={ShieldCheck}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              placeholder="123456"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, ''));
                setError(undefined);
              }}
              error={error}
              hint={USE_MOCK_API ? 'Demo mode: the code is 123456.' : 'The code expires after a while. Check your spam folder if you cannot find it.'}
              className="font-mono text-lg tracking-[0.35em]"
              autoFocus
            />
            <Button type="submit" size="lg" className="w-full" loading={checking}>
              {checking ? 'Checking…' : 'Verify email'}
            </Button>
          </form>

          <div className="mt-5 flex items-center justify-center gap-1.5 text-sm text-slate-500">
            Didn&apos;t get it?
            <button
              type="button"
              onClick={resend}
              disabled={sending || wait > 0}
              className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:text-brand-800 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              <RotateCw className={`size-3.5 ${sending ? 'animate-spin' : ''}`} />
              {wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
            </button>
          </div>
        </Card>

        <p className="mt-6 text-center text-xs leading-relaxed text-slate-400">
          After verifying, new companies stay <strong>pending</strong> until the administrator approves them.
        </p>
      </div>
    </div>
  );
}
