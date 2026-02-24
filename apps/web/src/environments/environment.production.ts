/**
 * Production environment configuration
 * apiUrl is empty for combined deployment (API + Web on same domain)
 */
export const environment = {
  production: true,
  apiUrl: '',
  appName: 'Mentor AI',
  version: '0.0.1',
  google: {
    clientId: '723199480172-346msdc1rhff92r50attqd9dl78snhva.apps.googleusercontent.com',
    redirectUri: '', // Empty = auto-detect from window.location.origin
  },
};
