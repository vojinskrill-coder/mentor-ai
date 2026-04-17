/**
 * Production environment configuration
 * apiUrl is empty for combined deployment (API + Web on same domain)
 */
export const environment = {
  production: true,
  apiUrl: '',
  appName: 'Neuron OS',
  version: '0.0.1',
  google: {
    clientId: '437825281484-96v5si7k5ghkqvoq8mo5kbhfkv16pbol.apps.googleusercontent.com',
    redirectUri: '', // Empty = auto-detect from window.location.origin
  },
};
