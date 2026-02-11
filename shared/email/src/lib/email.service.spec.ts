import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';

// Mock nodemailer
jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn(),
  }),
}));

import * as nodemailer from 'nodemailer';

const mockConfigService = {
  get: jest.fn((key: string, defaultValue?: unknown) => {
    const config: Record<string, unknown> = {
      SMTP_HOST: 'smtp.test.com',
      SMTP_PORT: 587,
      SMTP_USER: 'user',
      SMTP_PASS: 'pass',
      EMAIL_FROM: 'test@mentor-ai.com',
    };
    return config[key] ?? defaultValue;
  }),
};

describe('EmailService', () => {
  let service: EmailService;
  let mockTransporter: { sendMail: jest.Mock };

  beforeEach(async () => {
    mockTransporter = {
      sendMail: jest.fn(),
    };
    (nodemailer.createTransport as jest.Mock).mockReturnValue(mockTransporter);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);

    jest.clearAllMocks();
    // Re-set the mock since clearAllMocks clears the sendMail mock
    mockTransporter.sendMail = jest.fn();
    // Access private field through any to reset transporter
    (service as unknown as { transporter: typeof mockTransporter }).transporter = mockTransporter;
  });

  describe('sendInvitationEmail', () => {
    const params = {
      to: 'invitee@test.com',
      inviterName: 'John Owner',
      tenantName: 'Test Corp',
      inviteLink: 'http://localhost:4200/invite/token123',
      department: 'TECHNOLOGY',
    };

    it('should send email successfully', async () => {
      mockTransporter.sendMail.mockResolvedValue({
        messageId: '<msg-123@test.com>',
      });

      const result = await service.sendInvitationEmail(params);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('<msg-123@test.com>');
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'invitee@test.com',
          subject: expect.stringContaining('Test Corp'),
        })
      );
    });

    it('should return failure when email sending fails', async () => {
      mockTransporter.sendMail.mockRejectedValue(new Error('SMTP error'));

      const result = await service.sendInvitationEmail(params);

      expect(result.success).toBe(false);
      expect(result.messageId).toBeUndefined();
    });

    it('should include HTML and text content', async () => {
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'msg-1' });

      await service.sendInvitationEmail(params);

      const sentArgs = mockTransporter.sendMail.mock.calls[0]?.[0];
      expect(sentArgs?.html).toContain('Test Corp');
      expect(sentArgs?.html).toContain('TECHNOLOGY');
      expect(sentArgs?.html).toContain('token123');
      expect(sentArgs?.text).toContain('Test Corp');
      expect(sentArgs?.text).toContain('TECHNOLOGY');
    });
  });
});
