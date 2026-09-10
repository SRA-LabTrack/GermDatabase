export const CANESPROUT_POLICY_VERSION = '2026-09-11-v1';
export const CANESPROUT_POLICY_EFFECTIVE_DATE = 'September 11, 2026';
export const CANESPROUT_POLICY_EFFECTIVE_TIMESTAMP = Date.parse('2026-09-11T00:00:00+08:00');

export const TERMS_SECTIONS = [
  {
    title: '1. Purpose and authorized use',
    paragraphs: [
      'CaneSprout is a Sugarcane Germplasm Resource Database intended for authorized research, conservation, characterization, breeding, administrative, and educational work.',
      'You may use CaneSprout only for legitimate activities permitted by your organization and within the access level assigned to your account.'
    ]
  },
  {
    title: '2. Account responsibility',
    paragraphs: [
      'Keep your account credentials private and do not allow another person to use your account. Actions made through your account may be attributed to you.',
      'Notify a CaneSprout administrator if you believe your account or device has been compromised.'
    ]
  },
  {
    title: '3. Data accuracy and record changes',
    paragraphs: [
      'Users should enter germplasm, characterization, parentage, collection, breeding, and related records as accurately as reasonably possible and should preserve source information when available.',
      'Do not intentionally falsify, conceal, corrupt, or delete germplasm records. Administrative approval, audit, duplicate-protection, and offline synchronization features may be used to protect data integrity.'
    ]
  },
  {
    title: '4. Acceptable use',
    paragraphs: [
      'Do not use CaneSprout to gain unauthorized access, interfere with the service, bypass permissions, upload malicious content, scrape protected records at abusive rates, or use the system in a way that could damage the database or its users.',
      'Uploaded files and photos should be relevant to authorized CaneSprout work and must not violate applicable rights or organizational rules.'
    ]
  },
  {
    title: '5. Offline and synchronized use',
    paragraphs: [
      'CaneSprout may keep approved registry data, queued edits, photos, and account-related information locally on a device so authorized work can continue while offline.',
      'Changes made offline may be synchronized when connectivity returns. Users remain responsible for reviewing important records when conflicts or duplicate identities are reported.'
    ]
  },
  {
    title: '6. Availability and changes',
    paragraphs: [
      'CaneSprout may be updated, maintained, temporarily unavailable, or changed to protect security, data integrity, or service reliability.',
      'A newer policy version may require users to review and accept updated terms before continuing.'
    ]
  },
  {
    title: '7. Administration and access',
    paragraphs: [
      'Administrators may create accounts, assign roles, review approval requests, and take reasonable actions needed to protect the registry and enforce authorized use.',
      'Access may be suspended or removed when an account is no longer authorized or when these terms are materially violated.'
    ]
  },
  {
    title: '8. Questions',
    paragraphs: [
      'Questions about account access, data ownership, permitted use, or these terms should be directed to the CaneSprout administrator or the organization responsible for the deployment.'
    ]
  }
];

export const PRIVACY_SECTIONS = [
  {
    title: '1. Information CaneSprout may process',
    paragraphs: [
      'CaneSprout may process account information such as name, email address, assigned role, account identifiers, and policy-acceptance status.',
      'The registry may also contain germplasm and research information, including variety names, accession and collection details, parentage, breeding institution, characterization traits, photos, notes, and other authorized records.'
    ]
  },
  {
    title: '2. How information is used',
    paragraphs: [
      'Information is used to authenticate users, control permissions, maintain and search germplasm records, support approvals and edits, synchronize offline work, generate exports, and operate CaneSprout features.',
      'Policy-acceptance information is used to remember which version of the Terms of Use and Privacy Policy an account accepted.'
    ]
  },
  {
    title: '3. Storage and infrastructure',
    paragraphs: [
      'Configured CaneSprout deployments may store account and registry information in Appwrite and may serve the website through Vercel or other infrastructure selected by the organization.',
      'Those infrastructure providers may process technical request information as needed to deliver, secure, and operate their services.'
    ]
  },
  {
    title: '4. Local and offline storage',
    paragraphs: [
      'The website may use browser storage and IndexedDB for cached registry data, preferences, pending changes, and offline functionality.',
      'The Electron desktop application may additionally keep registry data and queued work in its local application data. Where supported, remembered desktop credentials are protected using operating-system storage through Electron safeStorage.'
    ]
  },
  {
    title: '5. Access and sharing',
    paragraphs: [
      'CaneSprout records are available according to the permissions and roles configured for the deployment. Administrators may access information needed to manage accounts, approvals, and registry integrity.',
      'Information should not be disclosed outside authorized research or organizational purposes unless the responsible organization permits or requires it.'
    ]
  },
  {
    title: '6. Retention and deletion',
    paragraphs: [
      'Account and registry information may be retained for as long as needed for germplasm documentation, research continuity, audit requirements, organizational records, or system operation.',
      'Locally cached information may remain on an authorized device until it is cleared, the user signs out where applicable, or the application data is removed. Registry deletions may be restricted or reviewed to prevent accidental loss of research data.'
    ]
  },
  {
    title: '7. Security',
    paragraphs: [
      'CaneSprout uses account permissions, administrative controls, offline queues, duplicate checks, and other safeguards designed to reduce unauthorized access and accidental data loss. No digital system can guarantee absolute security.',
      'Users should protect their devices, use strong passwords, and report suspected unauthorized access to an administrator.'
    ]
  },
  {
    title: '8. Your choices and questions',
    paragraphs: [
      'You may contact the CaneSprout administrator to ask about your account information, request appropriate corrections, or ask how the deployment handles personal information.',
      'If you do not agree with the current policies, you may decline and sign out instead of continuing into the database.'
    ]
  }
];

export function acceptedPolicyVersion(user) {
  return String(user?.prefs?.canesprout_policy_version || '').trim();
}

export function requiresPolicyAcceptance(user) {
  if (!user) return false;
  if (acceptedPolicyVersion(user) === CANESPROUT_POLICY_VERSION) return false;
  const createdAt = Date.parse(user?.$createdAt || user?.createdAt || '');
  if (!Number.isFinite(createdAt)) return false;
  return createdAt >= CANESPROUT_POLICY_EFFECTIVE_TIMESTAMP;
}

export function policyPrefs(user) {
  return {
    ...(user?.prefs && typeof user.prefs === 'object' ? user.prefs : {}),
    canesprout_policy_version: CANESPROUT_POLICY_VERSION,
    canesprout_policy_accepted_at: new Date().toISOString()
  };
}
