import type { Preview } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';

// Import the global styles
import '../../../apps/web/src/styles.css';

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#0A0A0A' },
        { name: 'light', value: '#FAFAFA' },
      ],
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [
    applicationConfig({
      providers: [],
    }),
  ],
};

export default preview;
