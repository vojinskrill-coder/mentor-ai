/**
 * Development environment configuration
 */
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
  appName: 'Neuron OS',
  version: '0.0.1',
  brainRelayMode: true, // When true, tasks execute via OpenClaw brain instead of old pipeline
  google: {
    clientId:
      '437825281484-96v5si7k5ghkqvoq8mo5kbhfkv16pbol.apps.googleusercontent.com',
    redirectUri: 'http://localhost:4200/callback',
  },
};
