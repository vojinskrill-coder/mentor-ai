import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FormsModule } from '@angular/forms';
import { MemoryListComponent } from './memory-list.component';
import type { Memory, MemoryType, MemorySource, MemoryListResponse } from '@mentor-ai/shared/types';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('MemoryListComponent', () => {
  let component: MemoryListComponent;
  let fixture: ComponentFixture<MemoryListComponent>;
  let httpMock: HttpTestingController;

  const mockMemories: Memory[] = [
    {
      id: 'mem_1',
      tenantId: 'tnt_test',
      userId: 'usr_test',
      type: 'CLIENT_CONTEXT' as MemoryType,
      source: 'AI_EXTRACTED' as MemorySource,
      content: 'Acme Corp has a budget of $50,000',
      subject: 'Acme Corp',
      confidence: 0.92,
      createdAt: '2026-02-05T10:00:00.000Z',
      updatedAt: '2026-02-05T10:00:00.000Z',
    },
    {
      id: 'mem_2',
      tenantId: 'tnt_test',
      userId: 'usr_test',
      type: 'PROJECT_CONTEXT' as MemoryType,
      source: 'USER_STATED' as MemorySource,
      content: 'Project Phoenix deadline is end of Q1 2026',
      subject: 'Project Phoenix',
      confidence: 1.0,
      createdAt: '2026-02-04T10:00:00.000Z',
      updatedAt: '2026-02-04T10:00:00.000Z',
    },
  ];

  const mockResponse: MemoryListResponse = {
    data: mockMemories,
    meta: { total: 2, limit: 20, offset: 0 },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MemoryListComponent, FormsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MemoryListComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should load memories on init', fakeAsync(() => {
      fixture.detectChanges();

      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/memory'));
      req.flush(mockResponse);
      tick();

      expect(component.memories$()).toHaveLength(2);
      expect(component.totalMemories$()).toBe(2);
    }));

    it('should show loading state initially', () => {
      expect(component.isLoading$()).toBe(true);
    });

    it('should hide loading after data loads', fakeAsync(() => {
      fixture.detectChanges();

      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/memory'));
      req.flush(mockResponse);
      tick();

      expect(component.isLoading$()).toBe(false);
    }));
  });

  describe('rendering', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/memory'));
      req.flush(mockResponse);
      tick();
      fixture.detectChanges();
    }));

    it('should display memory cards', () => {
      const cards = fixture.nativeElement.querySelectorAll('.memory-card');
      expect(cards.length).toBe(2);
    });

    it('should display memory content', () => {
      const content = fixture.nativeElement.querySelector('.content');
      expect(content.textContent).toContain('Acme Corp');
    });

    it('should display type badge', () => {
      const badge = fixture.nativeElement.querySelector('.type-badge');
      expect(badge.textContent.trim()).toBe('Client');
    });

    it('should display subject', () => {
      const subject = fixture.nativeElement.querySelector('.subject');
      expect(subject.textContent).toContain('Acme Corp');
    });

    it('should display source label', () => {
      const source = fixture.nativeElement.querySelector('.source');
      expect(source.textContent).toContain('AI extracted');
    });
  });

  describe('filtering', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/memory'));
      req.flush(mockResponse);
      tick();
      fixture.detectChanges();
    }));

    it('should start with ALL filter active', () => {
      expect(component.activeFilter$()).toBe('ALL');
    });

    it('should filter by type when tab clicked', () => {
      component.setFilter('CLIENT_CONTEXT' as MemoryType);
      fixture.detectChanges();

      expect(component.activeFilter$()).toBe('CLIENT_CONTEXT');
      expect(component.filteredMemories$()).toHaveLength(1);
    });

    it('should show all memories when ALL filter selected', () => {
      component.setFilter('ALL');
      fixture.detectChanges();

      expect(component.filteredMemories$()).toHaveLength(2);
    });

    it('should reset page when filter changes', () => {
      component.currentPage$.set(1);
      component.setFilter('CLIENT_CONTEXT' as MemoryType);

      expect(component.currentPage$()).toBe(0);
    });

    it('should display correct filter counts', () => {
      expect(component.getFilterCount('ALL')).toBe(2);
      expect(component.getFilterCount('CLIENT_CONTEXT' as MemoryType)).toBe(1);
      expect(component.getFilterCount('PROJECT_CONTEXT' as MemoryType)).toBe(1);
    });
  });

  describe('delete', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/memory'));
      req.flush(mockResponse);
      tick();
      fixture.detectChanges();
    }));

    it('should delete memory when confirmed', fakeAsync(() => {
      // Mock window.confirm
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      component.onDelete(mockMemories[0]);

      const deleteReq = httpMock.expectOne('/api/v1/memory/mem_1');
      expect(deleteReq.request.method).toBe('DELETE');
      deleteReq.flush({ success: true });
      tick();

      expect(component.memories$()).toHaveLength(1);
      expect(component.totalMemories$()).toBe(1);
    }));

    it('should not delete when cancelled', fakeAsync(() => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      component.onDelete(mockMemories[0]);
      tick();

      httpMock.expectNone('/api/v1/memory/mem_1');
      expect(component.memories$()).toHaveLength(2);
    }));

    it('should show deleting state during delete', fakeAsync(() => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      component.onDelete(mockMemories[0]);
      expect(component.deletingIds$().has('mem_1')).toBe(true);

      const deleteReq = httpMock.expectOne('/api/v1/memory/mem_1');
      deleteReq.flush({ success: true });
      tick();

      expect(component.deletingIds$().has('mem_1')).toBe(false);
    }));
  });

  describe('edit/correction', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/memory'));
      req.flush(mockResponse);
      tick();
      fixture.detectChanges();
    }));

    it('should open correction dialog on edit', () => {
      component.onEdit(mockMemories[0]);

      expect(component.showCorrectionDialog$()).toBe(true);
      expect(component.selectedMemory$()).toEqual(mockMemories[0]);
    });

    it('should close correction dialog', () => {
      component.onEdit(mockMemories[0]);
      component.closeCorrectionDialog();

      expect(component.showCorrectionDialog$()).toBe(false);
      expect(component.selectedMemory$()).toBeNull();
    });

    it('should save correction via PATCH request', fakeAsync(() => {
      component.onSaveCorrection({
        memoryId: 'mem_1',
        newContent: 'Updated content',
      });

      const patchReq = httpMock.expectOne('/api/v1/memory/mem_1');
      expect(patchReq.request.method).toBe('PATCH');
      expect(patchReq.request.body).toEqual({ content: 'Updated content' });
      patchReq.flush({ data: { ...mockMemories[0], content: 'Updated content' } });
      tick();

      const updated = component.memories$().find((m) => m.id === 'mem_1');
      expect(updated?.content).toBe('Updated content');
    }));
  });

  describe('clear all', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/memory'));
      req.flush(mockResponse);
      tick();
      fixture.detectChanges();
    }));

    it('should show clear confirmation dialog', () => {
      component.onClearAll();
      expect(component.showClearConfirm$()).toBe(true);
    });

    it('should hide dialog on cancel', () => {
      component.onClearAll();
      component.cancelClearAll();
      expect(component.showClearConfirm$()).toBe(false);
    });

    it('should not clear without FORGET confirmation', fakeAsync(() => {
      component.confirmText = 'wrong';
      component.confirmClearAll();
      tick();

      httpMock.expectNone('/api/v1/memory/forget-all');
    }));

    it('should clear all memories with FORGET confirmation', fakeAsync(() => {
      component.confirmText = 'FORGET';
      component.confirmClearAll();

      const req = httpMock.expectOne('/api/v1/memory/forget-all');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ confirmation: 'FORGET' });
      req.flush({ success: true, deletedCount: 2 });
      tick();

      expect(component.memories$()).toHaveLength(0);
      expect(component.totalMemories$()).toBe(0);
    }));
  });

  describe('pagination', () => {
    it('should load next page', fakeAsync(() => {
      fixture.detectChanges();
      const req1 = httpMock.expectOne((r) => r.url.includes('/api/v1/memory'));
      req1.flush({ data: mockMemories, meta: { total: 40, limit: 20, offset: 0 } });
      tick();

      component.nextPage();

      const req2 = httpMock.expectOne((r) => r.url.includes('offset=20'));
      req2.flush({ data: [], meta: { total: 40, limit: 20, offset: 20 } });
      tick();

      expect(component.currentPage$()).toBe(1);
    }));

    it('should load previous page', fakeAsync(() => {
      fixture.detectChanges();
      const req1 = httpMock.expectOne((r) => r.url.includes('/api/v1/memory'));
      req1.flush(mockResponse);
      tick();

      component.currentPage$.set(1);
      component.prevPage();

      const req2 = httpMock.expectOne((r) => r.url.includes('offset=0'));
      req2.flush(mockResponse);
      tick();

      expect(component.currentPage$()).toBe(0);
    }));

    it('should not go below page 0', () => {
      component.currentPage$.set(0);
      component.prevPage();
      expect(component.currentPage$()).toBe(0);
    });
  });

  describe('empty state', () => {
    it('should show empty state when no memories', fakeAsync(() => {
      fixture.detectChanges();
      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/memory'));
      req.flush({ data: [], meta: { total: 0, limit: 20, offset: 0 } });
      tick();
      fixture.detectChanges();

      const emptyState = fixture.nativeElement.querySelector('.empty-state');
      expect(emptyState).toBeTruthy();
    }));

    it('should show filter-specific empty message', fakeAsync(() => {
      fixture.detectChanges();
      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/memory'));
      req.flush(mockResponse);
      tick();

      component.setFilter('USER_PREFERENCE' as MemoryType);
      fixture.detectChanges();

      const emptyText = fixture.nativeElement.querySelector('.empty-text');
      expect(emptyText?.textContent).toContain('preference');
    }));
  });

  describe('error handling', () => {
    it('should show error state on load failure', fakeAsync(() => {
      fixture.detectChanges();
      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/memory'));
      req.error(new ErrorEvent('Network error'));
      tick();
      fixture.detectChanges();

      expect(component.error$()).toBeTruthy();
      const errorState = fixture.nativeElement.querySelector('.error-state');
      expect(errorState).toBeTruthy();
    }));

    it('should retry on error button click', fakeAsync(() => {
      fixture.detectChanges();
      const req1 = httpMock.expectOne((r) => r.url.includes('/api/v1/memory'));
      req1.error(new ErrorEvent('Network error'));
      tick();
      fixture.detectChanges();

      const retryBtn = fixture.nativeElement.querySelector('.retry-btn');
      retryBtn.click();

      const req2 = httpMock.expectOne((r) => r.url.includes('/api/v1/memory'));
      req2.flush(mockResponse);
      tick();

      expect(component.error$()).toBeNull();
    }));
  });

  describe('helper methods', () => {
    it('should format date correctly', () => {
      const formatted = component.formatDate('2026-02-05T10:00:00.000Z');
      expect(formatted).toContain('Feb');
      expect(formatted).toContain('5');
      expect(formatted).toContain('2026');
    });

    it('should return correct type colors', () => {
      expect(component.getTypeColor('CLIENT_CONTEXT' as MemoryType)).toBe('#3B82F6');
      expect(component.getTypeColor('PROJECT_CONTEXT' as MemoryType)).toBe('#8B5CF6');
    });

    it('should return correct type labels', () => {
      expect(component.getTypeLabel('CLIENT_CONTEXT' as MemoryType)).toBe('Client');
      expect(component.getTypeLabel('PROJECT_CONTEXT' as MemoryType)).toBe('Project');
    });

    it('should return correct source labels', () => {
      expect(component.getSourceLabel('AI_EXTRACTED' as MemorySource)).toBe('AI extracted');
      expect(component.getSourceLabel('USER_STATED' as MemorySource)).toBe('You stated');
      expect(component.getSourceLabel('USER_CORRECTED' as MemorySource)).toBe('Corrected');
    });
  });
});
