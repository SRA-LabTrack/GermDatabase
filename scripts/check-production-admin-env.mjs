const supported = [
  'APPWRITE_ADMIN_API_KEY',
  'APPWRITE_USERS_API_KEY',
  'APPWRITE_ADMIN_KEY',
  'APPWRITE_API_KEY'
];
const present = supported.filter((name) => String(process.env[name] || '').trim());
console.log('CaneSprout production secret check');
console.log('Environment supplied by Vercel CLI: production');
console.log('Supported key variables found:', present.length ? present.join(', ') : 'NONE');
if (!present.length) {
  console.error('\nERROR: This linked Vercel project does not currently expose an account-management key in Production.');
  process.exit(2);
}
console.log('\nOK: Production has a supported server-only account-management credential.');
