import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConceptTreeComponent } from './concept-tree.component';
import { ConversationService } from '../services/conversation.service';
import type { ConceptTreeData, ConceptHierarchyNode } from '@mentor-ai/shared/types';

describe('ConceptTreeComponent', () => {
  let component: ConceptTreeComponent;
  let fixture: ComponentFixture<ConceptTreeComponent>;
  let mockConversationService: {
    getBrainTree: ReturnType<typeof vi.fn>;
  };

  const mockNode: ConceptHierarchyNode = {
    curriculumId: '1',
    label: 'Poslovanje',
    conceptId: undefined,
    status: undefined,
    completedByUserId: undefined,
    linkedConversationId: undefined,
    conversationCount: 2,
    conversations: [
      {
        id: 'sess_1',
        title: 'Business Basics',
        updatedAt: '2026-02-20T12:00:00.000Z',
        userId: 'usr_1',
        createdAt: '2026-02-20T10:00:00.000Z',
        personaType: null,
        conceptId: null,
      },
    ],
    children: [
      {
        curriculumId: '1.1',
        label: 'Osnove',
        conceptId: 'cpt_101',
        status: 'completed',
        completedByUserId: 'usr_1',
        linkedConversationId: 'sess_1',
        conversationCount: 1,
        conversations: [
          {
            id: 'sess_2',
            title: 'Foundations',
            updatedAt: '2026-02-19T12:00:00.000Z',
            userId: 'usr_1',
            createdAt: '2026-02-19T10:00:00.000Z',
            personaType: null,
            conceptId: null,
          },
        ],
        children: [],
      },
    ],
  };

  const mockTreeData: ConceptTreeData = {
    tree: [mockNode],
    uncategorized: [
      {
        id: 'sess_general',
        title: 'General Chat',
        updatedAt: '2026-02-21T12:00:00.000Z',
        userId: 'usr_1',
        createdAt: '2026-02-21T10:00:00.000Z',
        personaType: null,
        conceptId: null,
      },
    ],
  };

  beforeEach(async () => {
    mockConversationService = {
      getBrainTree: vi.fn().mockResolvedValue(mockTreeData),
    };

    await TestBed.configureTestingModule({
      imports: [ConceptTreeComponent],
      providers: [
        {
          provide: ConversationService,
          useValue: mockConversationService,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ConceptTreeComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('loadTree', () => {
    it('should load tree data on init', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      expect(mockConversationService.getBrainTree).toHaveBeenCalled();
      expect(component.treeData$()).toEqual(mockTreeData);
      expect(component.isLoading$()).toBe(false);
    });

    it('should auto-expand all nodes', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.expandedNodes().has('1')).toBe(true);
      expect(component.expandedNodes().has('1.1')).toBe(true);
    });

    it('should set loading state during load', () => {
      // Before detectChanges, check initial state
      expect(component.isLoading$()).toBe(false);
    });

    it('should handle empty tree gracefully', async () => {
      mockConversationService.getBrainTree.mockResolvedValue({
        tree: [],
        uncategorized: [],
      });

      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.treeData$()?.tree).toHaveLength(0);
    });

    it('should handle load error gracefully', async () => {
      mockConversationService.getBrainTree.mockRejectedValue(new Error('Network error'));

      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.isLoading$()).toBe(false);
    });
  });

  describe('toggleNode', () => {
    it('should toggle node expansion', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.expandedNodes().has('1')).toBe(true);

      component.toggleNode('1');

      expect(component.expandedNodes().has('1')).toBe(false);

      component.toggleNode('1');

      expect(component.expandedNodes().has('1')).toBe(true);
    });
  });

  describe('toggleGeneral', () => {
    it('should toggle general section expansion', () => {
      expect(component.generalExpanded()).toBe(true);

      component.toggleGeneral();

      expect(component.generalExpanded()).toBe(false);

      component.toggleGeneral();

      expect(component.generalExpanded()).toBe(true);
    });
  });

  describe('onConversationSelect', () => {
    it('should emit conversationSelected', async () => {
      fixture.detectChanges();
      const emitSpy = vi.spyOn(component.conversationSelected, 'emit');

      component.onConversationSelect('sess_1');

      expect(emitSpy).toHaveBeenCalledWith('sess_1');
    });
  });

  describe('onNewChat', () => {
    it('should emit newChatRequested with concept info', () => {
      fixture.detectChanges();
      const emitSpy = vi.spyOn(component.newChatRequested, 'emit');
      const event = new Event('click');
      vi.spyOn(event, 'stopPropagation');

      component.onNewChat(event, '1.1', 'Osnove');

      expect(event.stopPropagation).toHaveBeenCalled();
      expect(emitSpy).toHaveBeenCalledWith({
        conceptId: '1.1',
        conceptName: 'Osnove',
      });
    });
  });

  describe('onNodeClick', () => {
    it('should emit conceptSelected for leaf node', async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      const emitSpy = vi.spyOn(component.conceptSelected, 'emit');
      const event = new Event('click');
      vi.spyOn(event, 'stopPropagation');

      const leafNode = mockNode.children[0]!;
      component.onNodeClick(event, leafNode);

      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          conceptId: 'cpt_101',
          curriculumId: '1.1',
          conceptName: 'Osnove',
          isFolder: false,
        })
      );
    });

    it('should emit conceptSelected for folder node', async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      const emitSpy = vi.spyOn(component.conceptSelected, 'emit');
      const event = new Event('click');
      vi.spyOn(event, 'stopPropagation');

      component.onNodeClick(event, mockNode);

      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          conceptId: null,
          curriculumId: '1',
          conceptName: 'Poslovanje',
          isFolder: true,
        })
      );
    });
  });

  describe('formatDate', () => {
    it('should return "Just now" for very recent dates', () => {
      const now = new Date();
      const recent = new Date(now.getTime() - 30 * 1000);

      expect(component.formatDate(recent.toISOString())).toBe('Just now');
    });

    it('should return minutes for recent dates', () => {
      const now = new Date();
      const fiveMin = new Date(now.getTime() - 5 * 60 * 1000);

      expect(component.formatDate(fiveMin.toISOString())).toBe('5m ago');
    });

    it('should return hours for same-day dates', () => {
      const now = new Date();
      const threeHours = new Date(now.getTime() - 3 * 60 * 60 * 1000);

      expect(component.formatDate(threeHours.toISOString())).toBe('3h ago');
    });

    it('should return days for recent past dates', () => {
      const now = new Date();
      const twoDays = new Date(now.getTime() - 2 * 86400000);

      expect(component.formatDate(twoDays.toISOString())).toBe('2d ago');
    });
  });

  describe('trackRow', () => {
    it('should return node track key for node rows', () => {
      const row = { type: 'node' as const, depth: 0, node: mockNode };

      expect(component.trackRow(row)).toBe('node-1');
    });

    it('should return conv track key for conversation rows', () => {
      const row = {
        type: 'conversation' as const,
        depth: 1,
        conversation: mockTreeData.uncategorized[0]!,
      };

      expect(component.trackRow(row)).toBe('conv-sess_general');
    });
  });

  describe('hasNewConversations', () => {
    it('should return false when no new conversation IDs', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.hasNewConversations('1')).toBe(false);
    });
  });
});
