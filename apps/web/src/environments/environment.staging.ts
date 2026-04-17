/**
 * Staging environment configuration
 * Used for pre-production testing
 */
export const environment = {
  production: false,
  apiUrl: 'https://staging-api.mentor-ai.example.com',
  appName: 'Neuron OS (Staging)',
  version: '0.0.1',
  google: {
    clientId: '',
    redirectUri: '',
  },
};
