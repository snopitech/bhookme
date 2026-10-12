import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import PropertyGallery from '../components/PropertyGallery';
import { LeaseCard, bedsLabel, money } from '../components/LeaseRow';
import { useAuth } from '../context/AuthContext';
import { useWishlist } from '../context/WishlistContext';
import ReviewSection from '../components/ReviewSection';
import { leaseClauses, addMonthsToDate } from '../utils/leaseAgreement';
import InlineLoginPopup from '../components/InlineLoginPopup';
import { getPendingAction, getPendingReturn, clearPendingAction } from '../utils/pendingAction';

// ============================================================
// LeaseDetailPage - /lease/:id
// ------------------------------------------------------------
// Photos, details, and the lease box on the right:
//   pick move-in date + months (1 month minimum) -> price shows
//   -> "Interested? Click here to submit an application" -> full
//   rental application + lease agreement signed by typing your
//   name -> thank-you message -> redirect to Dashboard > Leases.
//   Not signed in -> "Sign in to apply" opens the same inline sign-in
//   popup as Reserve/Review, so the visitor stays on this lease and
//   the application opens right after they sign in (Microsoft/Yahoo
//   go through /login and come back here, then it opens).
// ============================================================

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const TYPE_LABELS = {
  APARTMENT: 'Apartment',
  HOUSE: 'House',
  CONDO: 'Condo',
  TOWNHOUSE: 'Townhouse',
  STUDIO: 'Studio',
  ROOM: 'Private room',
};

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white text-sm';

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function formatDate(dateString) {
  if (!dateString) return '';
  const [y, m, d] = dateString.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function addMonths(dateString, months) {
  if (!dateString) return '';
  const [y, m, d] = dateString.split('-').map(Number);
  const date = new Date(y, m - 1 + months, d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// ---------- Rental application (opens over the page) ----------

const ID_TYPES = ["Driver's license", 'State ID', 'Passport', 'Other government ID'];
const EMPLOYMENT = ['Employed', 'Self-employed', 'Student', 'Retired', 'Unemployed'];
const BACKGROUND = [
  ['evicted', 'Have you ever been evicted?'],
  ['brokenLease', 'Have you ever broken a lease?'],
  ['felony', 'Have you ever been convicted of a felony?'],
  ['bankruptcy', 'Have you filed for bankruptcy in the last 7 years?'],
  ['smoker', 'Does anyone who will live there smoke?'],
];

function Section({ number, title, children }) {
  return (
    <fieldset className="border border-gray-200 rounded-xl p-4">
      <legend className="px-2 text-sm font-semibold text-gray-900">
        {number}. {title}
      </legend>
      <div className="space-y-3">{children}</div>
    </fieldset>
  );
}

function Field({ label, required, children, hint }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

const readOnlyClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-500 text-sm cursor-not-allowed';

function ApplicationForm({ lease, moveInDate, months, onClose, onSubmitted }) {
  const { user, token } = useAuth();
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ');

  const [f, setF] = useState({
    phone: user?.phone || user?.phoneNumber || '',
    dateOfBirth: user?.dateOfBirth || '',
    idType: '',
    currentAddress: '',
    timeAtAddress: '',
    currentRent: '',
    landlordName: '',
    landlordPhone: '',
    reasonForLeaving: '',
    previousAddress: '',
    employmentStatus: '',
    employer: '',
    jobTitle: '',
    employerPhone: '',
    timeEmployed: '',
    monthlyIncome: '',
    otherIncome: '',
    occupants: '1',
    otherOccupants: '',
    hasPets: false,
    petDetails: '',
    vehicles: '',
    emergencyName: '',
    emergencyRelationship: '',
    emergencyPhone: '',
    referenceName: '',
    referenceRelationship: '',
    referencePhone: '',
    evicted: '',
    brokenLease: '',
    felony: '',
    bankruptcy: '',
    smoker: '',
    backgroundExplanation: '',
    message: '',
  });
  const [agree, setAgree] = useState(false);
  const [signature, setSignature] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = React.useRef(null);

  const set = (field) => (e) =>
    setF((prev) => ({ ...prev, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  const moveOut = addMonthsToDate(moveInDate, months);
  const clauses = leaseClauses({
    landlordName: [lease.hostFirstName, lease.hostLastName].filter(Boolean).join(' '),
    tenantName: fullName,
    propertyTitle: lease.title,
    propertyType: lease.propertyType,
    city: lease.city,
    state: lease.state,
    moveInDate,
    moveOutDate: moveOut,
    months,
    monthlyRent: lease.monthlyRent,
    securityDeposit: lease.securityDeposit,
    occupants: f.occupants,
    petsAllowed: lease.petsAllowed,
    hasPets: f.hasPets,
    petDetails: f.petDetails,
    furnished: lease.furnished,
    utilitiesIncluded: lease.utilitiesIncluded,
  });

  const anyYes = BACKGROUND.some(([key]) => f[key] === 'Yes');
  const signatureOk = signature.trim().replace(/\s+/g, ' ').toLowerCase() === fullName.trim().replace(/\s+/g, ' ').toLowerCase();
  const needsJob = f.employmentStatus === 'Employed' || f.employmentStatus === 'Self-employed';

  const showError = (msg) => {
    setError(msg);
    if (scrollRef.current) scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!fullName) return showError('Please add your first and last name to your profile before applying.');
    if (BACKGROUND.some(([key]) => !f[key])) return showError('Please answer every background question (Yes or No).');
    if (anyYes && !f.backgroundExplanation.trim()) return showError('Please explain any "Yes" answer in the background section.');
    if (!agree) return showError('Please read the lease agreement and tick the box to accept it.');
    if (!signatureOk) return showError(`To sign, type your full name exactly as shown: ${fullName}`);

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/leases/${lease.id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          moveInDate,
          months,
          phone: f.phone,
          dateOfBirth: f.dateOfBirth,
          currentAddress: f.currentAddress,
          employer: f.employer || f.employmentStatus,
          monthlyIncome: f.monthlyIncome,
          occupants: f.occupants,
          hasPets: f.hasPets,
          petDetails: f.petDetails,
          message: f.message,
          agreeToLease: agree,
          signatureName: signature.trim(),
          details: {
            idType: f.idType,
            timeAtAddress: f.timeAtAddress,
            currentRent: f.currentRent,
            landlordName: f.landlordName,
            landlordPhone: f.landlordPhone,
            reasonForLeaving: f.reasonForLeaving,
            previousAddress: f.previousAddress,
            employmentStatus: f.employmentStatus,
            jobTitle: f.jobTitle,
            employerPhone: f.employerPhone,
            timeEmployed: f.timeEmployed,
            otherIncome: f.otherIncome,
            otherOccupants: f.otherOccupants,
            vehicles: f.vehicles,
            emergencyName: f.emergencyName,
            emergencyRelationship: f.emergencyRelationship,
            emergencyPhone: f.emergencyPhone,
            referenceName: f.referenceName,
            referenceRelationship: f.referenceRelationship,
            referencePhone: f.referencePhone,
            evicted: f.evicted,
            brokenLease: f.brokenLease,
            felony: f.felony,
            bankruptcy: f.bankruptcy,
            smoker: f.smoker,
            backgroundExplanation: f.backgroundExplanation,
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.message) || 'Could not submit your application.');
      onSubmitted(data);
    } catch (err) {
      showError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-end sm:items-center justify-center">
      <div
        ref={scrollRef}
        className="bg-white w-full sm:max-w-3xl max-h-[94vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl"
        role="dialog"
        aria-label="Rental application"
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between z-10">
          <div className="min-w-0">
            <p className="font-semibold">Rental application</p>
            <p className="text-xs text-gray-500 truncate">
              {lease.title} · move in {formatDate(moveInDate)} · {months} month{months === 1 ? '' : 's'} · {money(lease.monthlyRent)}/month
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center shrink-0"
          >
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-5">
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

          <Section number={1} title="Applicant information">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Full legal name">
                <input className={readOnlyClass} value={fullName || 'Add your name in your profile'} readOnly disabled />
              </Field>
              <Field label="Email">
                <input className={readOnlyClass} value={user?.email || ''} readOnly disabled />
              </Field>
              <Field label="Phone" required>
                <input className={inputClass} type="tel" value={f.phone} onChange={set('phone')} required />
              </Field>
              <Field label="Date of birth" required>
                <input className={inputClass} type="date" value={f.dateOfBirth} onChange={set('dateOfBirth')} max={todayString()} required />
              </Field>
              <Field label="Photo ID type" required hint="You may be asked to show it before move-in.">
                <select className={inputClass} value={f.idType} onChange={set('idType')} required>
                  <option value="">Select</option>
                  {ID_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>
            </div>
          </Section>

          <Section number={2} title="Residence history">
            <Field label="Current address" required>
              <input className={inputClass} value={f.currentAddress} onChange={set('currentAddress')} placeholder="Street, city, state, zip" required />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="How long at this address?" required>
                <input className={inputClass} value={f.timeAtAddress} onChange={set('timeAtAddress')} placeholder="e.g. 2 years" required />
              </Field>
              <Field label="Current monthly rent ($)">
                <input className={inputClass} type="number" min="0" value={f.currentRent} onChange={set('currentRent')} placeholder="0 if you own / live with family" />
              </Field>
              <Field label="Current landlord's name">
                <input className={inputClass} value={f.landlordName} onChange={set('landlordName')} />
              </Field>
              <Field label="Current landlord's phone">
                <input className={inputClass} type="tel" value={f.landlordPhone} onChange={set('landlordPhone')} />
              </Field>
            </div>
            <Field label="Reason for moving" required>
              <input className={inputClass} value={f.reasonForLeaving} onChange={set('reasonForLeaving')} required />
            </Field>
            <Field label="Previous address (if less than 2 years at current address)">
              <input className={inputClass} value={f.previousAddress} onChange={set('previousAddress')} />
            </Field>
          </Section>

          <Section number={3} title="Employment & income">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Employment status" required>
                <select className={inputClass} value={f.employmentStatus} onChange={set('employmentStatus')} required>
                  <option value="">Select</option>
                  {EMPLOYMENT.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Gross monthly income ($)" required>
                <input className={inputClass} type="number" min="0" value={f.monthlyIncome} onChange={set('monthlyIncome')} required />
              </Field>
              {needsJob && (
                <>
                  <Field label="Employer / business name" required>
                    <input className={inputClass} value={f.employer} onChange={set('employer')} required />
                  </Field>
                  <Field label="Job title">
                    <input className={inputClass} value={f.jobTitle} onChange={set('jobTitle')} />
                  </Field>
                  <Field label="Employer phone">
                    <input className={inputClass} type="tel" value={f.employerPhone} onChange={set('employerPhone')} />
                  </Field>
                  <Field label="How long employed?">
                    <input className={inputClass} value={f.timeEmployed} onChange={set('timeEmployed')} placeholder="e.g. 3 years" />
                  </Field>
                </>
              )}
            </div>
            <Field label="Other income (source and monthly amount)">
              <input className={inputClass} value={f.otherIncome} onChange={set('otherIncome')} placeholder="e.g. Part-time job $600" />
            </Field>
          </Section>

          <Section number={4} title="Household">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Total people who will live there" required>
                <input className={inputClass} type="number" min="1" max="20" value={f.occupants} onChange={set('occupants')} required />
              </Field>
              <Field label="Vehicles (make, model, plate)">
                <input className={inputClass} value={f.vehicles} onChange={set('vehicles')} placeholder="e.g. Toyota Camry ABC-1234" />
              </Field>
            </div>
            {Number(f.occupants) > 1 && (
              <Field label="Other occupants (name, age, relationship)">
                <textarea className={`${inputClass} min-h-[70px]`} value={f.otherOccupants} onChange={set('otherOccupants')} />
              </Field>
            )}
            {lease.petsAllowed ? (
              <div>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={f.hasPets} onChange={set('hasPets')} className="w-4 h-4 accent-rose-500" />
                  I have pets
                </label>
                {f.hasPets && (
                  <input
                    className={`${inputClass} mt-2`}
                    value={f.petDetails}
                    onChange={set('petDetails')}
                    placeholder="Type, breed, weight - e.g. 1 dog, Beagle, 25 lbs"
                    required
                  />
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">This place doesn't allow pets.</p>
            )}
          </Section>

          <Section number={5} title="Emergency contact & reference">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Emergency contact name" required>
                <input className={inputClass} value={f.emergencyName} onChange={set('emergencyName')} required />
              </Field>
              <Field label="Relationship" required>
                <input className={inputClass} value={f.emergencyRelationship} onChange={set('emergencyRelationship')} required />
              </Field>
              <Field label="Phone" required>
                <input className={inputClass} type="tel" value={f.emergencyPhone} onChange={set('emergencyPhone')} required />
              </Field>
              <Field label="Personal reference name">
                <input className={inputClass} value={f.referenceName} onChange={set('referenceName')} />
              </Field>
              <Field label="Relationship">
                <input className={inputClass} value={f.referenceRelationship} onChange={set('referenceRelationship')} />
              </Field>
              <Field label="Phone">
                <input className={inputClass} type="tel" value={f.referencePhone} onChange={set('referencePhone')} />
              </Field>
            </div>
          </Section>

          <Section number={6} title="Background questions">
            {BACKGROUND.map(([key, question]) => (
              <div key={key} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <p className="text-sm">
                  {question} <span className="text-rose-500">*</span>
                </p>
                <div className="flex gap-4 shrink-0">
                  {['No', 'Yes'].map((v) => (
                    <label key={v} className="flex items-center gap-1.5 text-sm">
                      <input type="radio" name={key} value={v} checked={f[key] === v} onChange={set(key)} className="accent-rose-500" />
                      {v}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {anyYes && (
              <Field label='Please explain any "Yes" answer' required>
                <textarea className={`${inputClass} min-h-[70px]`} value={f.backgroundExplanation} onChange={set('backgroundExplanation')} required />
              </Field>
            )}
          </Section>

          <Section number={7} title="Message to the host">
            <textarea
              className={`${inputClass} min-h-[80px]`}
              value={f.message}
              onChange={set('message')}
              placeholder="Introduce yourself - who you are, why you're moving, anything the host should know."
            />
          </Section>

          <Section number={8} title="Lease agreement & signature">
            <p className="text-sm text-gray-600">
              Please read the lease. By signing, you agree to these terms if your application is approved. The exact address is
              added once the host approves.
            </p>
            <div className="h-64 overflow-y-auto border border-gray-200 rounded-lg p-4 bg-gray-50 text-sm space-y-3">
              <p className="font-semibold text-center">RESIDENTIAL LEASE AGREEMENT</p>
              {clauses.map((c, i) => (
                <div key={c.title}>
                  <p className="font-semibold">
                    {i + 1}. {c.title}
                  </p>
                  <p className="text-gray-700">{c.text}</p>
                </div>
              ))}
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="w-4 h-4 mt-0.5 accent-rose-500" />
              <span>
                I have read and agree to the lease agreement, and I confirm that everything in this application is true and complete.
              </span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div className="sm:col-span-2">
                <Field label="Signature - type your full name" required hint={`Must match: ${fullName}`}>
                  <input
                    className={`${inputClass} font-serif italic text-lg ${signature && !signatureOk ? 'border-red-300' : ''}`}
                    value={signature}
                    onChange={(e) => setSignature(e.target.value)}
                    placeholder={fullName}
                    autoComplete="off"
                    required
                  />
                </Field>
              </div>
              <Field label="Date">
                <input className={readOnlyClass} value={formatDate(todayString())} readOnly disabled />
              </Field>
            </div>
          </Section>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-rose-500 hover:bg-rose-600 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
            >
              {saving ? 'Submitting...' : 'Sign & submit application'}
            </button>
            <button type="button" onClick={onClose} className="px-5 py-3 rounded-lg border border-gray-300 font-medium hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Thank-you message, then off to the dashboard ----------

function ThankYou({ firstName, onGo }) {
  const [seconds, setSeconds] = useState(6);

  useEffect(() => {
    if (seconds <= 0) {
      onGo();
      return undefined;
    }
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds, onGo]);

  return (
    <div className="fixed inset-0 z-[95] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 text-center" role="alertdialog" aria-live="assertive">
        <div className="text-5xl mb-3" aria-hidden="true">🎉</div>
        <h2 className="text-xl font-semibold mb-2">Thank you, {firstName || 'there'}, for your application!</h2>
        <p className="text-gray-600 mb-4">
          An agent will review it and get back to you. In the meantime, you can check your dashboard to monitor its status.
        </p>
        <p className="text-sm text-gray-400 mb-4">Taking you to your dashboard in {seconds}...</p>
        <button
          type="button"
          onClick={onGo}
          className="w-full bg-rose-500 hover:bg-rose-600 text-white font-semibold py-3 rounded-lg transition"
        >
          Go to my dashboard now
        </button>
      </div>
    </div>
  );
}

// ---------- Lease box (price + apply) ----------

function LeaseBox({ lease, onApply, signedIn }) {
  const earliest = useMemo(() => {
    const today = todayString();
    return lease.availableFrom && lease.availableFrom > today ? lease.availableFrom : today;
  }, [lease.availableFrom]);

  const [moveInDate, setMoveInDate] = useState(earliest);
  const [months, setMonths] = useState(lease.minMonths || 1);
  const [showLogin, setShowLogin] = useState(false);
  const [applyAfterLogin, setApplyAfterLogin] = useState(false);
  const location = useLocation();

  // Signed in from the popup (email/Google): open the application.
  useEffect(() => {
    if (signedIn && applyAfterLogin) {
      setApplyAfterLogin(false);
      setShowLogin(false);
      onApply(moveInDate, months);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, applyAfterLogin]);

  // Came back from a Microsoft/Yahoo sign-in started on this lease: open the application.
  useEffect(() => {
    if (!signedIn) return;
    const here = location.pathname + location.search;
    if (getPendingAction() === 'login' && getPendingReturn() === here) {
      clearPendingAction();
      onApply(moveInDate, months);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  const options = [];
  for (let m = lease.minMonths || 1; m <= (lease.maxMonths || 12); m += 1) options.push(m);

  const rent = Number(lease.monthlyRent) || 0;
  const deposit = Number(lease.securityDeposit) || 0;
  const total = rent * months;
  const accepting = lease.status === 'ACTIVE';

  return (
    <div className="lg:sticky lg:top-24 border border-gray-200 rounded-xl shadow-lg p-5">
      <p className="mb-4">
        <span className="text-2xl font-semibold">{money(rent)}</span>
        <span className="text-gray-500"> / month</span>
      </p>

      <div className="border border-gray-300 rounded-lg overflow-hidden mb-4">
        <div className="p-3 border-b border-gray-300">
          <label className="block text-[11px] font-bold uppercase tracking-wide">Move-in</label>
          <input
            type="date"
            value={moveInDate}
            min={earliest}
            onChange={(e) => setMoveInDate(e.target.value)}
            className="w-full text-sm outline-none bg-transparent"
          />
        </div>
        <div className="p-3">
          <label className="block text-[11px] font-bold uppercase tracking-wide">Lease length</label>
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className="w-full text-sm outline-none bg-transparent"
          >
            {options.map((m) => (
              <option key={m} value={m}>
                {m} month{m === 1 ? '' : 's'}
              </option>
            ))}
          </select>
        </div>
      </div>

      {signedIn ? (
        <button
          type="button"
          disabled={!accepting || !moveInDate}
          onClick={() => onApply(moveInDate, months)}
          className="w-full bg-rose-500 hover:bg-rose-600 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
        >
          {accepting ? 'Interested? Click here to submit an application' : 'Not accepting applications'}
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setShowLogin((o) => !o)}
            className="w-full bg-gray-900 hover:bg-black text-white font-semibold py-3 rounded-lg transition"
          >
            {showLogin ? 'Close sign in' : 'Sign in to apply'}
          </button>
          {showLogin && (
            <div className="mt-3 flex justify-center">
              <InlineLoginPopup
                open={showLogin}
                onOpenChange={setShowLogin}
                onLoginSuccess={() => setApplyAfterLogin(true)}
              />
            </div>
          )}
        </>
      )}
      <p className="text-center text-xs text-gray-500 mt-2">
        {signedIn
          ? "You won't pay anything until the host approves."
          : 'Sign in right here - you stay on this page and the application opens straight after.'}
      </p>

      <div className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">
            {money(rent)} × {months} month{months === 1 ? '' : 's'}
          </span>
          <span>{money(total)}</span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>Move-out</span>
          <span>{formatDate(addMonths(moveInDate, months))}</span>
        </div>
        <div className="flex justify-between font-semibold border-t border-gray-200 pt-2">
          <span>Lease total</span>
          <span>{money(total)}</span>
        </div>
      </div>

      <div className="mt-4 bg-gray-50 rounded-lg p-3 text-sm">
        <p className="font-medium mb-1">Due after approval</p>
        <div className="flex justify-between text-gray-600">
          <span>First month</span>
          <span>{money(rent)}</span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>Security deposit</span>
          <span>{money(deposit)}</span>
        </div>
        <div className="flex justify-between font-semibold mt-1">
          <span>Total due</span>
          <span>{money(rent + deposit)}</span>
        </div>
      </div>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 3v13" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

export default function LeaseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const { isLeaseSaved, toggleLease } = useWishlist();
  const [reviewCount, setReviewCount] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const [lease, setLease] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [others, setOthers] = useState([]);
  const [applying, setApplying] = useState(null); // { moveInDate, months }
  const [submitted, setSubmitted] = useState(false);
  const [thankYou, setThankYou] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError('');
    setSubmitted(false);
    window.scrollTo(0, 0);
    fetch(`${API_BASE_URL}/leases/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('not found');
        return res.json();
      })
      .then((data) => setLease(data))
      .catch(() => setError('This listing could not be found.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/leases`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setOthers(Array.isArray(data) ? data : []))
      .catch(() => setOthers([]));
  }, []);

  const similar = useMemo(() => {
    if (!lease) return [];
    return others
      .filter((l) => l.id !== lease.id)
      .sort((a, b) => {
        const score = (l) =>
          ((l.city || '').toLowerCase() === (lease.city || '').toLowerCase() ? 3 : 0) +
          (Number(l.bedrooms) === Number(lease.bedrooms) ? 1 : 0);
        return score(b) - score(a);
      })
      .slice(0, 6);
  }, [others, lease]);

  if (loading) return <div className="max-w-6xl mx-auto px-6 py-12 text-gray-500">Loading...</div>;
  if (error) return <div className="max-w-6xl mx-auto px-6 py-12 text-red-500">{error}</div>;
  if (!lease) return null;

  const photos = lease.imageUrls?.length ? lease.imageUrls : lease.imageUrl ? [lease.imageUrl] : [];
  const isOwnListing = user && Number(user.id) === Number(lease.hostId);

  const goToDashboard = () => navigate('/tenant-dashboard?tab=leases');
  const saved = isLeaseSaved(lease.id);
  const displayedReviewCount = reviewCount !== null ? reviewCount : 0;

  const handleSave = () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    toggleLease(lease.id);
    showToast(saved ? 'Removed from your wishlist' : 'Saved to your wishlist', 'success');
  };

  const handleShare = async () => {
    const url = window.location.href;
    const shareData = {
      title: lease.title,
      text: `${lease.title} - ${money(lease.monthlyRent)}/month in ${lease.city}, ${lease.state} on bhookme`,
      url,
    };
    // Phones: the native share sheet. Computers: copy the link.
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied', 'success');
    } catch {
      window.prompt('Copy this link to share:', url);
    }
  };

  // Only called once the visitor is signed in (LeaseBox shows the
  // inline sign-in popup otherwise).
  const handleApply = (moveInDate, months) => {
    setApplying({ moveInDate, months });
  };

  const features = [
    lease.furnished ? 'Furnished' : 'Unfurnished',
    lease.utilitiesIncluded ? 'Utilities included' : 'Utilities not included',
    lease.petsAllowed ? 'Pets allowed' : 'No pets',
    lease.availableFrom ? `Available from ${formatDate(lease.availableFrom)}` : 'Available now',
    `${lease.minMonths}–${lease.maxMonths} month lease`,
  ];

  return (
    <div className="min-h-screen">
      {toast && (
        <div
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium text-white"
          style={{ backgroundColor: toast.type === 'success' ? '#16a34a' : toast.type === 'error' ? '#dc2626' : '#374151' }}
        >
          {toast.message}
        </div>
      )}

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Title + Share / Save */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold">{lease.title}</h1>
            <p className="text-gray-600">
              {TYPE_LABELS[lease.propertyType] || 'Home'} · {lease.city}, {lease.state}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleShare}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold underline hover:bg-gray-100"
            >
              <ShareIcon />
              Share
            </button>
            <button
              type="button"
              onClick={handleSave}
              aria-pressed={saved}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold underline hover:bg-gray-100"
            >
              <span className={`text-lg leading-none ${saved ? 'text-rose-500' : ''}`} aria-hidden="true">
                {saved ? '♥' : '♡'}
              </span>
              {saved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>

        {photos.length > 0 ? (
          <PropertyGallery images={photos} title={lease.title} />
        ) : (
          <div className="w-full h-72 sm:h-96 rounded-xl bg-gray-200 mb-6 flex items-center justify-center text-6xl" aria-hidden="true">
            🏠
          </div>
        )}

        {submitted && !thankYou && (
          <div className="mb-6 p-4 rounded-xl border border-green-200 bg-green-50 text-green-800">
            <p className="font-semibold">Application sent!</p>
            <p className="text-sm">
              The host will review it. Once approved, the amount due will show in your{' '}
              <Link to="/tenant-dashboard?tab=leases" className="underline font-medium">dashboard under Leases</Link>.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-800 mb-6">
              <span>{bedsLabel(lease.bedrooms)}</span>
              <span>·</span>
              <span>{Number(lease.bathrooms)} bath</span>
              <span>·</span>
              <span>{TYPE_LABELS[lease.propertyType] || 'Home'}</span>
            </div>

            <div className="border border-gray-200 rounded-xl p-4 mb-6 flex items-center gap-3">
              <span className="text-xl" aria-hidden="true">🏡</span>
              <div>
                <p className="font-medium">
                  {displayedReviewCount > 0
                    ? `${displayedReviewCount} review${displayedReviewCount !== 1 ? 's' : ''}`
                    : 'New monthly stay'}
                </p>
                {displayedReviewCount === 0 && (
                  <p className="text-sm text-gray-500">No reviews yet - tenants can review after their lease is confirmed.</p>
                )}
              </div>
            </div>

            <div className="border-t border-gray-200 pt-6 mb-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-gray-300 flex items-center justify-center text-lg font-semibold text-white">
                {lease.hostFirstName?.[0]?.toUpperCase()}
              </div>
              <p className="font-semibold">
                Hosted by {lease.hostFirstName} {lease.hostLastName}
              </p>
            </div>

            {lease.description && (
              <div className="border-t border-gray-200 pt-6 mb-6">
                <h3 className="font-semibold mb-2">About this place</h3>
                <p className="text-gray-700 whitespace-pre-line">{lease.description}</p>
              </div>
            )}

            <div className="border-t border-gray-200 pt-6 mb-6">
              <h3 className="font-semibold mb-3">What you get</h3>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-gray-700">
                {features.map((f) => (
                  <li key={f}>• {f}</li>
                ))}
              </ul>
            </div>

            <div className="border-t border-gray-200 pt-6 mb-6">
              <h3 className="font-semibold mb-2">How renting works</h3>
              <ol className="list-decimal list-inside space-y-1 text-gray-700 text-sm">
                <li>Pick your move-in date and lease length.</li>
                <li>Fill out the rental application and sign the lease.</li>
                <li>The host reviews and approves it - you'll get an email.</li>
                <li>Pay the first month + security deposit from your dashboard.</li>
                <li>Download your signed lease agreement (PDF) from your dashboard.</li>
              </ol>
              <p className="text-sm text-gray-500 mt-2">The exact address is shared once your application is approved.</p>
            </div>

            <div className="border-t border-gray-200 pt-6">
              <ReviewSection leaseId={lease.id} showToast={showToast} onReviewCountChange={setReviewCount} />
            </div>
          </div>

          <div className="lg:col-span-1">
            {isOwnListing ? (
              <div className="border border-gray-200 rounded-xl p-5 text-sm text-gray-600">
                This is your listing. Manage it and its applications in your{' '}
                <Link to="/host/dashboard" className="text-rose-500 font-medium hover:underline">host dashboard</Link>.
              </div>
            ) : (
              <LeaseBox lease={lease} onApply={handleApply} signedIn={isAuthenticated} />
            )}
          </div>
        </div>

        {similar.length > 0 && (
          <section className="border-t border-gray-200 pt-8 mt-10">
            <h2 className="text-xl font-semibold mb-4">More monthly stays</h2>
            <div className="flex gap-4 overflow-x-auto snap-x pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {similar.map((l) => (
                <div key={l.id} className="shrink-0 snap-start w-[60%] sm:w-[40%] md:w-[30%] lg:w-[23%]">
                  <LeaseCard lease={l} />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {applying && (
        <ApplicationForm
          lease={lease}
          moveInDate={applying.moveInDate}
          months={applying.months}
          onClose={() => setApplying(null)}
          onSubmitted={() => {
            setApplying(null);
            setSubmitted(true);
            setThankYou(true);
          }}
        />
      )}

      {thankYou && (
        <ThankYou firstName={user?.firstName} onGo={goToDashboard} />
      )}
    </div>
  );
}