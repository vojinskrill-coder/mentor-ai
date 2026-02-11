import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import type { ApiSuccessResponse, ApiError } from './invitation.service';

export { type ApiSuccessResponse };

export interface TeamMemberResponse {
  id: string;
  email: string;
  name: string | null;
  role: string;
  department: string | null;
  createdAt: string;
}

export type RemovalStrategy = 'REASSIGN' | 'ARCHIVE';

@Injectable({
  providedIn: 'root',
})
export class TeamMembersService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/team';

  getMembers(): Observable<ApiSuccessResponse<TeamMemberResponse[]>> {
    return this.http
      .get<ApiSuccessResponse<TeamMemberResponse[]>>(`${this.baseUrl}/members`)
      .pipe(catchError(this.handleError));
  }

  removeMember(
    id: string,
    strategy: RemovalStrategy
  ): Observable<ApiSuccessResponse<void>> {
    return this.http
      .post<ApiSuccessResponse<void>>(
        `${this.baseUrl}/members/${id}/remove`,
        { strategy }
      )
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
