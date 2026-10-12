import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { useAuth } from '../context/AuthContext';

// Two-step sign-in: email + password, then a 6-digit code from an
// authenticator app (Google Authenticator, Microsoft Authenticator, Authy).
// First time: scan the QR code shown, then enter the code to confirm.
const THEME = {
  title: 'bhookme Admin',
  subtitle: 'Sign in with your admin account',
  ring: 'focus:ring-gray-800',
  button: 'bg-gray-900 hover:bg-black text-white',
  afterLogin: '/applications',
};

export default function LoginPage() {
  const [step, setStep] = useState('password'); // 'password' | 'code' | 'setup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const codeRef = useRef(null);
  const { login, verifyCode } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (step === 'setup' && challenge?.otpauthUrl) {
      QRCode.toDataURL(challenge.otpauthUrl, { width: 220, margin: 1 })
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(''));
    }
    if (step !== 'password') setTimeout(() => codeRef.current?.focus(), 50);
  }, [step, challenge]);

  const startOver = (message = '') => {
    setStep('password');
    setChallenge(null);
    setCode('');
    setPassword('');
    setQrDataUrl('');
    setShowKey(false);
    setError(message);
  };

  const handlePassword = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);

    if (!result.success) {
      setError(result.error);
      return;
    }
    setChallenge(result);
    setCode('');
    setStep(result.stage);
  };

  const handleCode = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await verifyCode(challenge.challengeId, code);
    setLoading(false);

    if (result.success) {
      navigate(THEME.afterLogin);
      return;
    }
    if (/expired|sign in again/i.test(result.error || '')) {
      startOver(result.error);
      return;
    }
    setError(result.error);
    setCode('');
    codeRef.current?.focus();
  };

  const inputClass = `w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 ${THEME.ring}`;
  const buttonClass = `w-full ${THEME.button} font-semibold py-2 rounded-lg transition disabled:opacity-50`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-md p-8">
        <h1 className="text-2xl font-bold text-center mb-1">{THEME.title}</h1>
        <p className="text-sm text-gray-500 text-center mb-6">
          {step === 'password' && THEME.subtitle}
          {step === 'code' && 'Enter the 6-digit code from your authenticator app'}
          {step === 'setup' && 'Set up two-step sign-in'}
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
        )}

        {step === 'password' && (
          <form onSubmit={handlePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </div>
            <button type="submit" disabled={loading} className={buttonClass}>
              {loading ? 'Checking...' : 'Continue'}
            </button>
          </form>
        )}

        {step !== 'password' && (
          <form onSubmit={handleCode} className="space-y-4">
            {step === 'setup' && (
              <div className="text-sm text-gray-700 space-y-3">
                <ol className="list-decimal pl-5 space-y-1">
                  <li>
                    Install an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or Authy).
                  </li>
                  <li>In the app, tap <span className="font-medium">+</span> and scan this QR code.</li>
                  <li>Enter the 6-digit code the app shows.</li>
                </ol>
                <div className="flex justify-center">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="QR code for your authenticator app" className="w-56 h-56 border border-gray-200 rounded-lg" />
                  ) : (
                    <div className="w-56 h-56 flex items-center justify-center text-gray-400 border border-gray-200 rounded-lg">
                      Loading QR...
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <button type="button" onClick={() => setShowKey((v) => !v)} className="text-xs text-gray-500 underline">
                    {showKey ? 'Hide setup key' : "Can't scan? Enter a setup key instead"}
                  </button>
                  {showKey && (
                    <p className="mt-2 font-mono text-sm break-all bg-gray-50 border border-gray-200 rounded p-2 select-all">
                      {challenge?.secret}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">6-digit code</label>
              <input
                ref={codeRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
                placeholder="123 456"
                className={`${inputClass} text-center text-2xl tracking-widest font-mono`}
              />
            </div>

            <button type="submit" disabled={loading || code.replace(/\s/g, '').length !== 6} className={buttonClass}>
              {loading ? 'Verifying...' : step === 'setup' ? 'Confirm and sign in' : 'Sign in'}
            </button>

            <button type="button" onClick={() => startOver()} className="w-full text-sm text-gray-500 hover:underline">
              Use a different account
            </button>

            {step === 'code' && (
              <p className="text-xs text-gray-400 text-center">
                Lost your phone? Ask an HR account holder to reset your two-step sign-in.
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}