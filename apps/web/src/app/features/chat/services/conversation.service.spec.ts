import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { ConversationService } from './conversation.service';
import { environment } from '../../../../environments/environment';

describe('ConversationService', () => {
  let service: ConversationService;
  let httpMock: HttpTestingController;
  const baseUrl = `${environment.apiUrl}/api/v1/conversations`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ConversationService],
    });

    service = TestBed.inject(ConversationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('createConversation', () => {
    it('should create a new conversation', async () => {
      const mockConversation = {
        id: 'sess_new',
        userId: 'usr_test',
        title: 'Test Conversation',
        createdAt: '2026-02-06T00:00:00.000Z',
        updatedAt: '2026-02-06T00:00:00.000Z',
      };

      const promise = service.createConversation('Test Conversation');

      const req = httpMock.expectOne(baseUrl);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ title: 'Test Conversation' });
      req.flush({ data: mockConversation });

      const result = await promise;
      expect(result.id).toBe('sess_new');
      expect(result.title).toBe('Test Conversation');
    });

    it('should create conversation without title', async () => {
      const mockConversation = {
        id: 'sess_new',
        userId: 'usr_test',
        title: null,
        createdAt: '2026-02-06T00:00:00.000Z',
        updatedAt: '2026-02-06T00:00:00.000Z',
      };

      const promise = service.createConversation();

      const req = httpMock.expectOne(baseUrl);
      expect(req.request.body).toEqual({ title: undefined });
      req.flush({ data: mockConversation });

      const result = await promise;
      expect(result.title).toBeNull();
    });
  });

  describe('getConversations', () => {
    it('should return list of conversations', async () => {
      const mockConversations = [
        {
          id: 'sess_1',
          userId: 'usr_test',
          title: 'Conv 1',
          createdAt: '2026-02-06T00:00:00.000Z',
          updatedAt: '2026-02-06T00:00:00.000Z',
        },
        {
          id: 'sess_2',
          userId: 'usr_test',
          title: 'Conv 2',
          createdAt: '2026-02-06T00:00:00.000Z',
          updatedAt: '2026-02-06T00:00:00.000Z',
        },
      ];

      const promise = service.getConversations();

      const req = httpMock.expectOne(baseUrl);
      expect(req.request.method).toBe('GET');
      req.flush({ data: mockConversations });

      const result = await promise;
      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('sess_1');
    });

    it('should return empty array when no conversations', async () => {
      const promise = service.getConversations();

      const req = httpMock.expectOne(baseUrl);
      req.flush({ data: [] });

      const result = await promise;
      expect(result).toEqual([]);
    });
  });

  describe('getConversation', () => {
    it('should return conversation with messages', async () => {
      const mockConversation = {
        id: 'sess_1',
        userId: 'usr_test',
        title: 'Test',
        createdAt: '2026-02-06T00:00:00.000Z',
        updatedAt: '2026-02-06T00:00:00.000Z',
        messages: [
          {
            id: 'msg_1',
            conversationId: 'sess_1',
            role: 'USER',
            content: 'Hello',
            createdAt: '2026-02-06T00:00:00.000Z',
          },
        ],
      };

      const promise = service.getConversation('sess_1');

      const req = httpMock.expectOne(`${baseUrl}/sess_1`);
      expect(req.request.method).toBe('GET');
      req.flush({ data: mockConversation });

      const result = await promise;
      expect(result.id).toBe('sess_1');
      expect(result.messages).toHaveLength(1);
    });
  });

  describe('deleteConversation', () => {
    it('should delete conversation', async () => {
      const promise = service.deleteConversation('sess_1');

      const req = httpMock.expectOne(`${baseUrl}/sess_1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);

      await promise;
    });
  });
});
