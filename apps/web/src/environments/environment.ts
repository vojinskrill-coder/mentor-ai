/**
 * Development environment configuration
 */
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
  appName: 'Mentor AI',
  version: '0.0.1',
  brainRelayMode: true, // When true, tasks execute via OpenClaw brain instead of old pipeline
  google: {
    clientId:
      '723199480172-346msdc1rhff92r50attqd9dl78snhva.apps.googleusercontent.com',
    redirectUri: 'http://localhost:4200/callback',
  },
};
