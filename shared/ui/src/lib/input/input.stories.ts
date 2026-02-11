import type { Meta, StoryObj } from '@storybook/angular';
import { InputComponent } from './input.component';

const meta: Meta<InputComponent> = {
  title: 'Components/Input',
  component: InputComponent,
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: ['text', 'password', 'email', 'number', 'tel', 'url', 'search'],
      description: 'The type of input',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'The size of the input',
    },
    state: {
      control: 'select',
      options: ['default', 'error', 'success'],
      description: 'The validation state',
    },
    placeholder: {
      control: 'text',
      description: 'Placeholder text',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the input is disabled',
    },
    readonly: {
      control: 'boolean',
      description: 'Whether the input is readonly',
    },
    fullWidth: {
      control: 'boolean',
      description: 'Whether the input takes full width',
    },
    label: {
      control: 'text',
      description: 'Label text for the input',
    },
    helperText: {
      control: 'text',
      description: 'Helper text displayed below the input',
    },
    errorMessage: {
      control: 'text',
      description: 'Error message displayed in error state',
    },
  },
};

export default meta;
type Story = StoryObj<InputComponent>;

export const Default: Story = {
  args: {
    type: 'text',
    size: 'md',
    state: 'default',
    placeholder: 'Enter text...',
    disabled: false,
    readonly: false,
    fullWidth: false,
  },
};

export const WithLabel: Story = {
  args: {
    type: 'text',
    size: 'md',
    state: 'default',
    placeholder: 'Enter your email',
    label: 'Email Address',
  },
};

export const WithHelperText: Story = {
  args: {
    type: 'text',
    size: 'md',
    state: 'default',
    placeholder: 'Enter your name',
    label: 'Full Name',
    helperText: 'Enter your first and last name',
  },
};

export const ErrorState: Story = {
  args: {
    type: 'text',
    size: 'md',
    state: 'error',
    placeholder: 'Enter email',
    label: 'Email',
    errorMessage: 'Please enter a valid email address',
  },
};

export const SuccessState: Story = {
  args: {
    type: 'text',
    size: 'md',
    state: 'success',
    placeholder: 'Enter email',
    label: 'Email',
    helperText: 'Email address is valid',
  },
};

export const Password: Story = {
  args: {
    type: 'password',
    size: 'md',
    state: 'default',
    placeholder: 'Enter password',
    label: 'Password',
  },
};

export const Small: Story = {
  args: {
    type: 'text',
    size: 'sm',
    placeholder: 'Small input',
  },
};

export const Large: Story = {
  args: {
    type: 'text',
    size: 'lg',
    placeholder: 'Large input',
  },
};

export const Disabled: Story = {
  args: {
    type: 'text',
    size: 'md',
    state: 'default',
    placeholder: 'Disabled input',
    disabled: true,
    label: 'Disabled',
  },
};

export const Readonly: Story = {
  args: {
    type: 'text',
    size: 'md',
    state: 'default',
    readonly: true,
    label: 'Readonly',
  },
};

export const FullWidth: Story = {
  args: {
    type: 'text',
    size: 'md',
    state: 'default',
    placeholder: 'Full width input',
    fullWidth: true,
  },
};

export const AllTypes: Story = {
  render: () => ({
    template: `
      <div class="flex flex-col gap-4 p-4 max-w-md">
        <ui-input type="text" label="Text" placeholder="Text input" />
        <ui-input type="email" label="Email" placeholder="email@example.com" />
        <ui-input type="password" label="Password" placeholder="Password" />
        <ui-input type="number" label="Number" placeholder="123" />
        <ui-input type="tel" label="Phone" placeholder="+1 (555) 000-0000" />
        <ui-input type="url" label="URL" placeholder="https://example.com" />
        <ui-input type="search" label="Search" placeholder="Search..." />
      </div>
    `,
  }),
};

export const ValidationStates: Story = {
  render: () => ({
    template: `
      <div class="flex flex-col gap-4 p-4 max-w-md">
        <ui-input
          label="Default State"
          placeholder="Enter text"
          helperText="This is helper text"
        />
        <ui-input
          label="Success State"
          placeholder="Enter email"
          state="success"
          helperText="Email is valid"
        />
        <ui-input
          label="Error State"
          placeholder="Enter email"
          state="error"
          errorMessage="Please enter a valid email"
        />
      </div>
    `,
  }),
};
