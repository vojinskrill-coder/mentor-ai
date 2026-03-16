import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import {
  MaturityDashboardData,
  StageProgressSummary,
  PrerequisiteCheckResult,
  MaturityStage,
  AutonomousRunResult,
  AutonomousStatusData,
  DigestSummaryItem,
} from '@mentor-ai/shared/types';

@Injectable({ providedIn: 'root' })
export class MaturityService {
  private readonly http = inject(HttpClient);

  getDashboard(): Observable<MaturityDashboardData> {
    return this.http
      .get<{ data: MaturityDashboardData }>('/api/v1/maturity/stage')
      .pipe(map((r) => r.data));
  }

  getStageProgress(stage: MaturityStage): Observable<StageProgressSummary> {
    return this.http
      .get<{ data: StageProgressSummary }>(
        `/api/v1/maturity/stage/${stage}/progress`
      )
      .pipe(map((r) => r.data));
  }

  initializeStage(
    stage: MaturityStage
  ): Observable<{ assignmentCount: number }> {
    return this.http
      .post<{ data: { assignmentCount: number } }>(
        `/api/v1/maturity/stage/${stage}/initialize`,
        {}
      )
      .pipe(map((r) => r.data));
  }

  getExecutionStatus(): Observable<{
    running: boolean; initializing: boolean; pendingCount: number; inProgressCount: number;
    total?: number; executed?: number; failed?: number; currentConceptName?: string | null;
  }> {
    return this.http
      .get<{ data: {
        running: boolean; initializing: boolean; pendingCount: number; inProgressCount: number;
        total: number; executed: number; failed: number; currentConceptName: string | null;
      } }>(
        '/api/v1/maturity/execution-status'
      )
      .pipe(map((r) => r.data));
  }

  executeStage(
    stage: MaturityStage
  ): Observable<{ started: boolean; pendingCount: number; alreadyRunning: boolean }> {
    return this.http
      .post<{ data: { started: boolean; pendingCount: number; alreadyRunning: boolean } }>(
        `/api/v1/maturity/stage/${stage}/execute`,
        {}
      )
      .pipe(map((r) => r.data));
  }

  transitionToNextStage(): Observable<{ newStage: MaturityStage }> {
    return this.http
      .post<{ data: { newStage: MaturityStage } }>(
        '/api/v1/maturity/stage/transition',
        {}
      )
      .pipe(map((r) => r.data));
  }

  checkPrerequisites(conceptId: string): Observable<PrerequisiteCheckResult> {
    return this.http
      .get<{ data: PrerequisiteCheckResult }>(
        `/api/v1/maturity/concept/${conceptId}/prerequisites`
      )
      .pipe(map((r) => r.data));
  }

  reExecuteConcept(
    conceptId: string
  ): Observable<{ newNoteId: string; version: number }> {
    return this.http
      .post<{ data: { newNoteId: string; version: number } }>(
        `/api/v1/maturity/concept/${conceptId}/re-execute`,
        {}
      )
      .pipe(map((r) => r.data));
  }

  getStaleConcepts(): Observable<
    Array<{ conceptId: string; conceptName: string; reason: string }>
  > {
    return this.http
      .get<{
        data: Array<{
          conceptId: string;
          conceptName: string;
          reason: string;
        }>;
      }>('/api/v1/maturity/staleness')
      .pipe(map((r) => r.data));
  }

  getAutonomousStatus(): Observable<AutonomousStatusData> {
    return this.http
      .get<{ data: AutonomousStatusData }>('/api/v1/maturity/autonomous/status')
      .pipe(map((r) => r.data));
  }

  triggerAutonomousRun(): Observable<AutonomousRunResult> {
    return this.http
      .post<{ data: AutonomousRunResult }>(
        '/api/v1/maturity/autonomous/trigger',
        {}
      )
      .pipe(map((r) => r.data));
  }

  getAutonomousRuns(): Observable<AutonomousRunResult[]> {
    return this.http
      .get<{ data: AutonomousRunResult[] }>('/api/v1/maturity/autonomous/runs')
      .pipe(map((r) => r.data));
  }

  getDigests(
    limit = 5,
    offset = 0,
  ): Observable<{ data: DigestSummaryItem[]; total: number }> {
    return this.http.get<{ data: DigestSummaryItem[]; total: number }>(
      '/api/v1/maturity/digests',
      { params: { limit: limit.toString(), offset: offset.toString() } },
    );
  }
}
