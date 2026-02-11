import { InvitationsCollector } from './invitations.collector';

const mockPrisma = {
  invitation: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
};

describe('InvitationsCollector', () => {
  let collector: InvitationsCollector;

  beforeEach(() => {
    collector = new InvitationsCollector();
    jest.clearAllMocks();
  });

  it('should have key "invitations" and title "Invitation History"', () => {
    expect(collector.key).toBe('invitations');
    expect(collector.title).toBe('Invitation History');
  });

  it('should collect sent and received invitations', async () => {
    mockPrisma.invitation.findMany.mockResolvedValue([
      {
        id: 'inv_1',
        email: 'invited@test.com',
        department: 'TECHNOLOGY',
        role: 'MEMBER',
        status: 'ACCEPTED',
        createdAt: new Date('2025-01-10'),
        expiresAt: new Date('2025-01-17'),
      },
    ]);
    mockPrisma.invitation.findFirst.mockResolvedValue({
      id: 'inv_0',
      department: 'FINANCE',
      role: 'MEMBER',
      status: 'ACCEPTED',
      createdAt: new Date('2025-01-01'),
      invitedBy: { email: 'owner@test.com', name: 'Owner' },
    });

    const section = await collector.collect(
      mockPrisma as any,
      'usr_1',
      'tnt_1'
    );

    expect(section.key).toBe('invitations');
    expect(section.itemCount).toBe(2);
    // First item should be the received invitation
    expect(section.items[0]).toEqual(
      expect.objectContaining({
        type: 'received',
        invitedBy: 'owner@test.com',
      })
    );
    // Second item should be the sent invitation
    expect(section.items[1]).toEqual(
      expect.objectContaining({
        type: 'sent',
        recipientEmail: 'invited@test.com',
      })
    );
  });

  it('should handle no invitations', async () => {
    mockPrisma.invitation.findMany.mockResolvedValue([]);
    mockPrisma.invitation.findFirst.mockResolvedValue(null);

    const section = await collector.collect(
      mockPrisma as any,
      'usr_1',
      'tnt_1'
    );

    expect(section.items).toEqual([]);
    expect(section.itemCount).toBe(0);
  });
});
