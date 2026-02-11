import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import {
  SkeletonComponent,
  SkeletonTextComponent,
  SkeletonAvatarComponent,
  SkeletonCardComponent,
  SkeletonListItemComponent,
} from './skeleton.component';

const meta: Meta<SkeletonComponent> = {
  title: 'Components/Skeleton',
  component: SkeletonComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [
        SkeletonComponent,
        SkeletonTextComponent,
        SkeletonAvatarComponent,
        SkeletonCardComponent,
        SkeletonListItemComponent,
      ],
    }),
  ],
  argTypes: {
    variant: {
      control: 'select',
      options: ['text', 'circle', 'rectangle'],
      description: 'The shape variant of the skeleton',
    },
    width: {
      control: 'text',
      description: 'The width of the skeleton (CSS value)',
    },
    height: {
      control: 'text',
      description: 'The height of the skeleton (CSS value)',
    },
    rounded: {
      control: 'boolean',
      description: 'Whether the skeleton has rounded corners (for rectangle)',
    },
  },
};

export default meta;
type Story = StoryObj<SkeletonComponent>;

export const Text: Story = {
  args: {
    variant: 'text',
    width: '100%',
  },
};

export const Circle: Story = {
  args: {
    variant: 'circle',
    width: '48px',
    height: '48px',
  },
};

export const Rectangle: Story = {
  args: {
    variant: 'rectangle',
    width: '100%',
    height: '200px',
    rounded: true,
  },
};

export const TextLines: Story = {
  render: () => ({
    template: `
      <div class="flex flex-col gap-2 max-w-md">
        <ui-skeleton variant="text" width="100%" />
        <ui-skeleton variant="text" width="90%" />
        <ui-skeleton variant="text" width="75%" />
      </div>
    `,
  }),
};

export const Avatar: Story = {
  render: () => ({
    template: `
      <div class="flex gap-4">
        <ui-skeleton-avatar />
        <ui-skeleton-avatar width="64px" height="64px" />
        <ui-skeleton-avatar width="80px" height="80px" />
      </div>
    `,
  }),
};

export const TextSkeleton: Story = {
  render: () => ({
    template: `
      <div class="flex flex-col gap-2 max-w-md">
        <ui-skeleton-text lines="3" />
      </div>
    `,
  }),
};

export const Card: Story = {
  render: () => ({
    template: `
      <div class="max-w-sm">
        <ui-skeleton-card />
      </div>
    `,
  }),
};

export const ListItem: Story = {
  render: () => ({
    template: `
      <div class="flex flex-col gap-4 max-w-md">
        <ui-skeleton-list-item />
        <ui-skeleton-list-item />
        <ui-skeleton-list-item />
      </div>
    `,
  }),
};

export const ProfileSkeleton: Story = {
  render: () => ({
    template: `
      <div class="p-6 bg-secondary rounded-lg max-w-sm">
        <div class="flex items-center gap-4 mb-4">
          <ui-skeleton variant="circle" width="64px" height="64px" />
          <div class="flex-1">
            <ui-skeleton variant="text" width="70%" class="mb-2" />
            <ui-skeleton variant="text" width="50%" />
          </div>
        </div>
        <div class="space-y-2">
          <ui-skeleton variant="text" width="100%" />
          <ui-skeleton variant="text" width="90%" />
          <ui-skeleton variant="text" width="60%" />
        </div>
      </div>
    `,
  }),
};

export const ArticleSkeleton: Story = {
  render: () => ({
    template: `
      <div class="p-6 bg-secondary rounded-lg max-w-2xl">
        <ui-skeleton variant="rectangle" width="100%" height="200px" class="mb-4" />
        <ui-skeleton variant="text" width="80%" height="24px" class="mb-3" />
        <ui-skeleton variant="text" width="40%" height="16px" class="mb-6" />
        <div class="space-y-2">
          <ui-skeleton variant="text" width="100%" />
          <ui-skeleton variant="text" width="100%" />
          <ui-skeleton variant="text" width="95%" />
          <ui-skeleton variant="text" width="100%" />
          <ui-skeleton variant="text" width="75%" />
        </div>
      </div>
    `,
  }),
};

export const TableRowSkeleton: Story = {
  render: () => ({
    template: `
      <div class="space-y-3">
        @for (row of [1, 2, 3, 4, 5]; track row) {
          <div class="flex items-center gap-4 p-3 bg-secondary rounded">
            <ui-skeleton variant="rectangle" width="40px" height="40px" />
            <ui-skeleton variant="text" width="150px" />
            <ui-skeleton variant="text" width="200px" />
            <ui-skeleton variant="text" width="100px" />
            <ui-skeleton variant="rectangle" width="80px" height="32px" />
          </div>
        }
      </div>
    `,
  }),
};

export const DashboardSkeleton: Story = {
  render: () => ({
    template: `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        @for (stat of [1, 2, 3, 4]; track stat) {
          <div class="p-4 bg-secondary rounded-lg">
            <ui-skeleton variant="text" width="60%" height="16px" class="mb-2" />
            <ui-skeleton variant="text" width="40%" height="32px" />
          </div>
        }
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="p-4 bg-secondary rounded-lg">
          <ui-skeleton variant="text" width="50%" height="20px" class="mb-4" />
          <ui-skeleton variant="rectangle" width="100%" height="200px" />
        </div>
        <div class="p-4 bg-secondary rounded-lg">
          <ui-skeleton variant="text" width="50%" height="20px" class="mb-4" />
          <div class="space-y-3">
            @for (item of [1, 2, 3, 4]; track item) {
              <ui-skeleton-list-item />
            }
          </div>
        </div>
      </div>
    `,
  }),
};
