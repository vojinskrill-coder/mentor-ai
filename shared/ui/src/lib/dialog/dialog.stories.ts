import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import {
  DialogComponent,
  DialogHeaderComponent,
  DialogTitleComponent,
  DialogDescriptionComponent,
  DialogContentComponent,
  DialogFooterComponent,
  DialogTriggerComponent,
} from './dialog.component';
import { ButtonComponent } from '../button/button.component';
import { InputComponent } from '../input/input.component';

const meta: Meta<DialogComponent> = {
  title: 'Components/Dialog',
  component: DialogComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [
        DialogComponent,
        DialogHeaderComponent,
        DialogTitleComponent,
        DialogDescriptionComponent,
        DialogContentComponent,
        DialogFooterComponent,
        DialogTriggerComponent,
        ButtonComponent,
        InputComponent,
      ],
    }),
  ],
  argTypes: {
    closeOnEscape: {
      control: 'boolean',
      description: 'Whether the dialog closes when Escape is pressed',
    },
    closeOnBackdropClick: {
      control: 'boolean',
      description: 'Whether the dialog closes when clicking the backdrop',
    },
    showCloseButton: {
      control: 'boolean',
      description: 'Whether to show the close button',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'xl', 'full'],
      description: 'The size of the dialog',
    },
  },
};

export default meta;
type Story = StoryObj<DialogComponent>;

export const Default: Story = {
  render: (args) => ({
    props: args,
    template: `
      <ui-dialog #dialog [closeOnEscape]="closeOnEscape" [closeOnBackdropClick]="closeOnBackdropClick" [showCloseButton]="showCloseButton" [size]="size">
        <ui-dialog-trigger>
          <ui-button>Open Dialog</ui-button>
        </ui-dialog-trigger>
        <ui-dialog-header>
          <ui-dialog-title>Dialog Title</ui-dialog-title>
          <ui-dialog-description>This is a description of the dialog content.</ui-dialog-description>
        </ui-dialog-header>
        <ui-dialog-content>
          <p class="text-muted-foreground">This is the main content of the dialog. You can put any content here, including forms, images, or other components.</p>
        </ui-dialog-content>
        <ui-dialog-footer>
          <ui-button variant="secondary" (click)="dialog.close()">Cancel</ui-button>
          <ui-button (click)="dialog.close()">Confirm</ui-button>
        </ui-dialog-footer>
      </ui-dialog>
    `,
  }),
  args: {
    closeOnEscape: true,
    closeOnBackdropClick: true,
    showCloseButton: true,
    size: 'md',
  },
};

export const Small: Story = {
  render: () => ({
    template: `
      <ui-dialog #dialog size="sm">
        <ui-dialog-trigger>
          <ui-button>Open Small Dialog</ui-button>
        </ui-dialog-trigger>
        <ui-dialog-header>
          <ui-dialog-title>Small Dialog</ui-dialog-title>
        </ui-dialog-header>
        <ui-dialog-content>
          <p class="text-muted-foreground">This is a small dialog.</p>
        </ui-dialog-content>
        <ui-dialog-footer>
          <ui-button (click)="dialog.close()">Close</ui-button>
        </ui-dialog-footer>
      </ui-dialog>
    `,
  }),
};

export const Large: Story = {
  render: () => ({
    template: `
      <ui-dialog #dialog size="lg">
        <ui-dialog-trigger>
          <ui-button>Open Large Dialog</ui-button>
        </ui-dialog-trigger>
        <ui-dialog-header>
          <ui-dialog-title>Large Dialog</ui-dialog-title>
          <ui-dialog-description>This dialog is larger and can contain more content.</ui-dialog-description>
        </ui-dialog-header>
        <ui-dialog-content>
          <p class="text-muted-foreground mb-4">This is a large dialog with more space for content.</p>
          <p class="text-muted-foreground">You can use this size for forms or detailed information.</p>
        </ui-dialog-content>
        <ui-dialog-footer>
          <ui-button variant="secondary" (click)="dialog.close()">Cancel</ui-button>
          <ui-button (click)="dialog.close()">Confirm</ui-button>
        </ui-dialog-footer>
      </ui-dialog>
    `,
  }),
};

export const FormDialog: Story = {
  render: () => ({
    template: `
      <ui-dialog #dialog size="md">
        <ui-dialog-trigger>
          <ui-button>Edit Profile</ui-button>
        </ui-dialog-trigger>
        <ui-dialog-header>
          <ui-dialog-title>Edit Profile</ui-dialog-title>
          <ui-dialog-description>Make changes to your profile here. Click save when you're done.</ui-dialog-description>
        </ui-dialog-header>
        <ui-dialog-content>
          <div class="flex flex-col gap-4">
            <ui-input label="Name" placeholder="Enter your name" [fullWidth]="true" />
            <ui-input label="Email" type="email" placeholder="Enter your email" [fullWidth]="true" />
            <ui-input label="Username" placeholder="@username" [fullWidth]="true" />
          </div>
        </ui-dialog-content>
        <ui-dialog-footer>
          <ui-button variant="secondary" (click)="dialog.close()">Cancel</ui-button>
          <ui-button (click)="dialog.close()">Save Changes</ui-button>
        </ui-dialog-footer>
      </ui-dialog>
    `,
  }),
};

export const ConfirmationDialog: Story = {
  render: () => ({
    template: `
      <ui-dialog #dialog size="sm">
        <ui-dialog-trigger>
          <ui-button variant="destructive">Delete Account</ui-button>
        </ui-dialog-trigger>
        <ui-dialog-header>
          <ui-dialog-title>Are you sure?</ui-dialog-title>
          <ui-dialog-description>This action cannot be undone. This will permanently delete your account and remove all your data from our servers.</ui-dialog-description>
        </ui-dialog-header>
        <ui-dialog-footer>
          <ui-button variant="secondary" (click)="dialog.close()">Cancel</ui-button>
          <ui-button variant="destructive" (click)="dialog.close()">Delete Account</ui-button>
        </ui-dialog-footer>
      </ui-dialog>
    `,
  }),
};

export const WithoutCloseButton: Story = {
  render: () => ({
    template: `
      <ui-dialog #dialog [showCloseButton]="false">
        <ui-dialog-trigger>
          <ui-button>Open Dialog</ui-button>
        </ui-dialog-trigger>
        <ui-dialog-header>
          <ui-dialog-title>No Close Button</ui-dialog-title>
          <ui-dialog-description>This dialog doesn't have a close button in the corner.</ui-dialog-description>
        </ui-dialog-header>
        <ui-dialog-content>
          <p class="text-muted-foreground">Use the footer buttons to close this dialog.</p>
        </ui-dialog-content>
        <ui-dialog-footer>
          <ui-button (click)="dialog.close()">Got it</ui-button>
        </ui-dialog-footer>
      </ui-dialog>
    `,
  }),
};

export const NoBackdropDismiss: Story = {
  render: () => ({
    template: `
      <ui-dialog #dialog [closeOnBackdropClick]="false" [closeOnEscape]="false">
        <ui-dialog-trigger>
          <ui-button>Open Modal</ui-button>
        </ui-dialog-trigger>
        <ui-dialog-header>
          <ui-dialog-title>Important Action</ui-dialog-title>
          <ui-dialog-description>This dialog cannot be dismissed by clicking outside or pressing Escape.</ui-dialog-description>
        </ui-dialog-header>
        <ui-dialog-content>
          <p class="text-muted-foreground">You must use the buttons below to close this dialog.</p>
        </ui-dialog-content>
        <ui-dialog-footer>
          <ui-button variant="secondary" (click)="dialog.close()">Cancel</ui-button>
          <ui-button (click)="dialog.close()">Confirm</ui-button>
        </ui-dialog-footer>
      </ui-dialog>
    `,
  }),
};

export const ScrollableContent: Story = {
  render: () => ({
    template: `
      <ui-dialog #dialog size="md">
        <ui-dialog-trigger>
          <ui-button>Open Scrollable Dialog</ui-button>
        </ui-dialog-trigger>
        <ui-dialog-header>
          <ui-dialog-title>Terms of Service</ui-dialog-title>
          <ui-dialog-description>Please read and accept our terms of service.</ui-dialog-description>
        </ui-dialog-header>
        <ui-dialog-content>
          <div class="text-muted-foreground space-y-4 max-h-64 overflow-y-auto">
            <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
            <p>Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
            <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.</p>
            <p>Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
            <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
            <p>Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
            <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.</p>
          </div>
        </ui-dialog-content>
        <ui-dialog-footer>
          <ui-button variant="secondary" (click)="dialog.close()">Decline</ui-button>
          <ui-button (click)="dialog.close()">Accept</ui-button>
        </ui-dialog-footer>
      </ui-dialog>
    `,
  }),
};
