import type { User, ApiResponse, PaginationMeta } from './types';

describe('types', () => {
  it('should define User interface correctly', () => {
    const user: User = {
      id: '123',
      email: 'test@example.com',
      displayName: 'Test User',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(user.id).toBe('123');
    expect(user.email).toBe('test@example.com');
  });

  it('should define ApiResponse interface correctly', () => {
    const response: ApiResponse<string> = {
      data: 'test',
      success: true,
      message: 'OK',
    };
    expect(response.success).toBe(true);
    expect(response.data).toBe('test');
  });

  it('should define PaginationMeta interface correctly', () => {
    const meta: PaginationMeta = {
      page: 1,
      limit: 10,
      total: 100,
      totalPages: 10,
    };
    expect(meta.totalPages).toBe(10);
  });
});
