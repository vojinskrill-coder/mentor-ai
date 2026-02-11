import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import {
  CardComponent,
  CardHeaderComponent,
  CardTitleComponent,
  CardDescriptionComponent,
  CardContentComponent,
  CardFooterComponent,
} from './card.component';
import { ButtonComponent } from '../button/button.component';

const meta: Meta<CardComponent> = {
  title: 'Components/Card',
  component: CardComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [
        CardComponent,
        CardHeaderComponent,
        CardTitleComponent,
        CardDescriptionComponent,
        CardContentComponent,
        CardFooterComponent,
        ButtonComponent,
      ],
    }),
  ],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'bordered', 'elevated'],
      description: 'The visual style of the card',
    },
    interactive: {
      control: 'boolean',
      description: 'Whether the card is clickable',
    },
    selected: {
      control: 'boolean',
      description: 'Whether the card is selected (for interactive cards)',
    },
  },
};

export default meta;
type Story = StoryObj<CardComponent>;

export const Default: Story = {
  render: (args) => ({
    props: args,
    template: `
      <ui-card [variant]="variant" [interactive]="interactive" [selected]="selected" class="max-w-md">
        <ui-card-header>
          <ui-card-title>Card Title</ui-card-title>
          <ui-card-description>This is a card description that provides additional context.</ui-card-description>
        </ui-card-header>
        <ui-card-content>
          <p class="text-muted-foreground">Card content goes here. This is where you can place any content including text, images, or other components.</p>
        </ui-card-content>
        <ui-card-footer>
          <ui-button variant="secondary" size="sm">Cancel</ui-button>
          <ui-button size="sm">Confirm</ui-button>
        </ui-card-footer>
      </ui-card>
    `,
  }),
  args: {
    variant: 'default',
    interactive: false,
    selected: false,
  },
};

export const Bordered: Story = {
  render: () => ({
    template: `
      <ui-card variant="bordered" class="max-w-md">
        <ui-card-header>
          <ui-card-title>Bordered Card</ui-card-title>
          <ui-card-description>This card has a visible border.</ui-card-description>
        </ui-card-header>
        <ui-card-content>
          <p class="text-muted-foreground">Content inside a bordered card variant.</p>
        </ui-card-content>
      </ui-card>
    `,
  }),
};

export const Elevated: Story = {
  render: () => ({
    template: `
      <ui-card variant="elevated" class="max-w-md">
        <ui-card-header>
          <ui-card-title>Elevated Card</ui-card-title>
          <ui-card-description>This card has a shadow for depth.</ui-card-description>
        </ui-card-header>
        <ui-card-content>
          <p class="text-muted-foreground">Content inside an elevated card variant.</p>
        </ui-card-content>
      </ui-card>
    `,
  }),
};

export const Interactive: Story = {
  render: () => ({
    template: `
      <div class="flex gap-4">
        <ui-card [interactive]="true" class="max-w-xs cursor-pointer">
          <ui-card-header>
            <ui-card-title>Click Me</ui-card-title>
            <ui-card-description>This card is clickable.</ui-card-description>
          </ui-card-header>
          <ui-card-content>
            <p class="text-muted-foreground">Hover and focus states are applied.</p>
          </ui-card-content>
        </ui-card>

        <ui-card [interactive]="true" [selected]="true" class="max-w-xs cursor-pointer">
          <ui-card-header>
            <ui-card-title>Selected</ui-card-title>
            <ui-card-description>This card is selected.</ui-card-description>
          </ui-card-header>
          <ui-card-content>
            <p class="text-muted-foreground">Selected state styling is applied.</p>
          </ui-card-content>
        </ui-card>
      </div>
    `,
  }),
};

export const SimpleContent: Story = {
  render: () => ({
    template: `
      <ui-card class="max-w-md">
        <ui-card-content>
          <p class="text-muted-foreground">A simple card with just content, no header or footer.</p>
        </ui-card-content>
      </ui-card>
    `,
  }),
};

export const HeaderOnly: Story = {
  render: () => ({
    template: `
      <ui-card class="max-w-md">
        <ui-card-header>
          <ui-card-title>Header Only Card</ui-card-title>
          <ui-card-description>This card only has a header section.</ui-card-description>
        </ui-card-header>
      </ui-card>
    `,
  }),
};

export const ProfileCard: Story = {
  render: () => ({
    template: `
      <ui-card class="max-w-sm">
        <ui-card-header>
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold">
              JD
            </div>
            <div>
              <ui-card-title>John Doe</ui-card-title>
              <ui-card-description>Software Engineer</ui-card-description>
            </div>
          </div>
        </ui-card-header>
        <ui-card-content>
          <p class="text-muted-foreground">Building beautiful interfaces with Angular and Tailwind CSS.</p>
        </ui-card-content>
        <ui-card-footer>
          <ui-button variant="outline" size="sm">Message</ui-button>
          <ui-button size="sm">Follow</ui-button>
        </ui-card-footer>
      </ui-card>
    `,
  }),
};

export const CardGrid: Story = {
  render: () => ({
    template: `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <ui-card>
          <ui-card-header>
            <ui-card-title>Card One</ui-card-title>
          </ui-card-header>
          <ui-card-content>
            <p class="text-muted-foreground">First card in the grid layout.</p>
          </ui-card-content>
        </ui-card>
        <ui-card>
          <ui-card-header>
            <ui-card-title>Card Two</ui-card-title>
          </ui-card-header>
          <ui-card-content>
            <p class="text-muted-foreground">Second card in the grid layout.</p>
          </ui-card-content>
        </ui-card>
        <ui-card>
          <ui-card-header>
            <ui-card-title>Card Three</ui-card-title>
          </ui-card-header>
          <ui-card-content>
            <p class="text-muted-foreground">Third card in the grid layout.</p>
          </ui-card-content>
        </ui-card>
      </div>
    `,
  }),
};
