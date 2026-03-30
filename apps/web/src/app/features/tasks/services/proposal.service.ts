import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { BrainProposalItem } from '@mentor-ai/shared/types';

@Injectable({ providedIn: 'root' })
export class ProposalService {
  private readonly http = inject(HttpClient);

  /** List proposals for the current user's tenant (JWT auth, tenantId from token). */
  getProposals(status?: string): Observable<BrainProposalItem[]> {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    // Uses the user-facing endpoint on NotesController (JWT auth)
    return this.http.get<BrainProposalItem[]>('/api/v1/notes/proposals', { params });
  }

  approveProposal(id: string): Observable<BrainProposalItem> {
    return this.http.patch<BrainProposalItem>(`/api/v1/notes/proposals/${id}/approve`, {});
  }

  rejectProposal(id: string, reason?: string): Observable<BrainProposalItem> {
    return this.http.patch<BrainProposalItem>(`/api/v1/notes/proposals/${id}/reject`, {
      reason,
    });
  }
}
