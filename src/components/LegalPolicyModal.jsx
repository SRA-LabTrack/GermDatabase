import React, { useMemo, useState } from 'react';
import { CheckCircle2, LockKeyhole, ScrollText, ShieldCheck, X } from 'lucide-react';
import {
  CANESPROUT_POLICY_EFFECTIVE_DATE,
  CANESPROUT_POLICY_VERSION,
  PRIVACY_SECTIONS,
  TERMS_SECTIONS
} from '../lib/legalPolicy';

function PolicyDocument({ type }) {
  const isPrivacy = type === 'privacy';
  const sections = useMemo(() => isPrivacy ? PRIVACY_SECTIONS : TERMS_SECTIONS, [isPrivacy]);
  return <div className="legal-policy-document">
    <div className="legal-policy-document-heading">
      <span className="legal-policy-document-icon">{isPrivacy ? <ShieldCheck size={22} /> : <ScrollText size={22} />}</span>
      <div>
        <small>CaneSprout • Effective {CANESPROUT_POLICY_EFFECTIVE_DATE}</small>
        <h3>{isPrivacy ? 'Privacy Policy' : 'Terms of Use'}</h3>
      </div>
    </div>
    <div className="legal-policy-version">Policy version {CANESPROUT_POLICY_VERSION}</div>
    {sections.map((section) => <section key={section.title} className="legal-policy-section">
      <h4>{section.title}</h4>
      {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
    </section>)}
  </div>;
}

export function LegalPolicyModal({ initialDocument = 'terms', onClose }) {
  const [documentType, setDocumentType] = useState(initialDocument === 'privacy' ? 'privacy' : 'terms');
  return <div className="modal-backdrop legal-policy-backdrop" role="presentation">
    <section className="legal-policy-modal" role="dialog" aria-modal="true" aria-label="CaneSprout policies">
      <header className="legal-policy-header">
        <div><small>Account policies</small><h2>CaneSprout Policies</h2></div>
        <button type="button" className="icon-button" aria-label="Close policies" onClick={onClose}><X size={20} /></button>
      </header>
      <div className="legal-policy-tabs" role="tablist">
        <button type="button" className={documentType === 'terms' ? 'active' : ''} onClick={() => setDocumentType('terms')}><ScrollText size={17} /> Terms of Use</button>
        <button type="button" className={documentType === 'privacy' ? 'active' : ''} onClick={() => setDocumentType('privacy')}><ShieldCheck size={17} /> Privacy Policy</button>
      </div>
      <div className="legal-policy-scroll"><PolicyDocument type={documentType} /></div>
      <footer className="legal-policy-footer"><button type="button" className="primary-button" onClick={onClose}>Done</button></footer>
    </section>
  </div>;
}

export function PolicyAcceptanceModal({ user, busy = false, error = '', onAccept, onDecline }) {
  const [documentType, setDocumentType] = useState('terms');
  const [agreed, setAgreed] = useState(false);
  return <div className="modal-backdrop legal-policy-backdrop legal-acceptance-backdrop" role="presentation">
    <section className="legal-policy-modal legal-acceptance-modal" role="dialog" aria-modal="true" aria-label="Accept CaneSprout policies">
      <header className="legal-acceptance-heading">
        <span className="legal-acceptance-lock"><LockKeyhole size={24} /></span>
        <div>
          <small>Required before first access</small>
          <h2>Review and accept CaneSprout policies</h2>
          <p>{user?.email ? `Signed in as ${user.email}. ` : ''}Please review the Terms of Use and Privacy Policy before entering the database.</p>
        </div>
      </header>
      <div className="legal-policy-tabs" role="tablist">
        <button type="button" className={documentType === 'terms' ? 'active' : ''} onClick={() => setDocumentType('terms')}><ScrollText size={17} /> Terms of Use</button>
        <button type="button" className={documentType === 'privacy' ? 'active' : ''} onClick={() => setDocumentType('privacy')}><ShieldCheck size={17} /> Privacy Policy</button>
      </div>
      <div className="legal-policy-scroll legal-acceptance-scroll"><PolicyDocument type={documentType} /></div>
      <div className="legal-acceptance-controls">
        <label className="legal-agreement-checkbox">
          <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
          <span><b>I have read and agree to the Terms of Use and Privacy Policy.</b><small>Acceptance is recorded on this CaneSprout account with the current policy version.</small></span>
        </label>
        {error && <div className="alert error">{error}</div>}
        <div className="legal-acceptance-actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={onDecline}>Decline &amp; sign out</button>
          <button type="button" className="primary-button" disabled={!agreed || busy} onClick={() => onAccept?.()}>{busy ? 'Saving agreement…' : <><CheckCircle2 size={17} /> Agree &amp; continue</>}</button>
        </div>
      </div>
    </section>
  </div>;
}
