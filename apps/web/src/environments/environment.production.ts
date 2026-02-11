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
    clientId: '',
    redirectUri: '',
  },
};
