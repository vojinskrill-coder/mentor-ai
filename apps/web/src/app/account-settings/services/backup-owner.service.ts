import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import type { ApiSuccessResponse, ApiError } from '../../team/services/invitation.service';
import type {
  BackupOwnerResponse,
  BackupOwnerStatus,
  TeamMemberResponse,
} from '@mentor-ai/shared/types';

export { type ApiSuccessResponse };

@Injectable({
  providedIn: 'root',
})
export class BackupOwnerService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/team/backup-owner';

  getBackupOwner(): Observable<ApiSuccessResponse<BackupOwnerResponse | null>> {
    return this.http
      .get<ApiSuccessResponse<BackupOwnerResponse | null>>(this.baseUrl)
      .pipe(catchError(this.handleError));
  }

  getEligibleMembers(): Observable<ApiSuccessResponse<TeamMemberResponse[]>> {
    return this.http
      .get<ApiSuccessResponse<TeamMemberResponse[]>>(`${this.baseUrl}/eligible`)
      .pipe(catchError(this.handleError));
  }

  designateBackupOwner(
    backupOwnerId: string
  ): Observable<ApiSuccessResponse<BackupOwnerResponse>> {
    return this.http
      .post<ApiSuccessResponse<BackupOwnerResponse>>(this.baseUrl, {
        backupOwnerId,
      })
      .pipe(catchError(this.handleError));
  }

  removeBackupOwner(): Observable<ApiSuccessResponse<null>> {
    return this.http
      .delete<ApiSuccessResponse<null>>(this.baseUrl)
      .pipe(catchError(this.handleError));
  }

  getBackupOwnerStatus(): Observable<ApiSuccessResponse<BackupOwnerStatus>> {
    return this.http
      .get<ApiSuccessResponse<BackupOwnerStatus>>(`${this.baseUrl}/status`)
      .pipe(catchError(this.handleError));
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An unexpected error occurred. Please try again.';

    if (error.error) {
      const apiError = error.error as ApiError;
      if (apiError.detail) {
        errorMessage = apiError.detail;
      } else if (apiError.title) {
        errorMessage = apiError.title;
      }
    } else if (error.status === 0) {
      errorMessage =
        'Unable to connect to the server. Please check your connection.';
    }

    return throwError(() => new Error(errorMessage));
  }
}
