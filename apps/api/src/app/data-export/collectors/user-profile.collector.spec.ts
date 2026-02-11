import { UserProfileCollector } from './user-profile.collector';

const mockPrisma = {
  user: { findUnique: jest.fn() },
  tenant: { findUnique: jest.fn() },
};

describe('UserProfileCollector', () => {
  let collector: UserProfileCollector;

  beforeEach(() => {
    collector = new UserProfileCollector();
    jest.clearAllMocks();
  });

  it('should have key "profile" and title "User Profile"', () => {
    expect(collector.key).toBe('profile');
    expect(collector.title).toBe('User Profile');
  });

  it('should collect user profile with tenant info', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'usr_1',
      email: 'test@test.com',
      name: 'Test User',
      role: 'MEMBER',
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-15'),
      mfaEnabled: true,
    });
    mockPrisma.tenant.findUnique.mockResolvedValue({
      name: 'Test Corp',
      industry: 'TECHNOLOGY',
    });

    const section = await collector.collect(
      mockPrisma as any,
      'usr_1',
      'tnt_1'
    );

    expect(section.key).toBe('profile');
    expect(section.itemCount).toBe(1);
    expect(section.items[0]).toEqual(
      expect.objectContaining({
        email: 'test@test.com',
        name: 'Test User',
        role: 'MEMBER',
        mfaEnabled: true,
        tenantName: 'Test Corp',
        tenantIndustry: 'TECHNOLOGY',
      })
    );
  });

  it('should return empty items when user not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.tenant.findUnique.mockResolvedValue(null);

    const section = await collector.collect(
      mockPrisma as any,
      'usr_missing',
      'tnt_1'
    );

    expect(section.items).toEqual([]);
    expect(section.itemCount).toBe(0);
  });
});
