import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

export interface CreateInvitationRequest {
  email: string;
  department: string;
}

export interface InvitationResponse {
  id: string;
  email: string;
  department: string;
  role: string;
  status: string;
  token: string;
  expiresAt: string;
  tenantId: string;
  invitedById: string;
  acceptedByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ValidateTokenResponse {
  email: string;
  department: string;
  role: string;
  tenantName: string;
  expiresAt: string;
}

export interface AcceptInvitationResponse {
  tenantId: string;
  role: string;
  department: string;
}

export interface ApiSuccessResponse<T> {
  status: 'success';
  data: T;
  message?: string;
  correlationId?: string;
}

export interface ApiError {
  type: string;
  title: string;
  status: number;
  detail: string;
  correlationId?: string;
}

@Injectable({
  providedIn: 'root',
})
export class InvitationService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/invitations';

  createInvitation(dto: CreateInvitationRequest): Observable<ApiSuccessResponse<InvitationResponse>> {
    return this.http
      .post<ApiSuccessResponse<InvitationResponse>>(this.baseUrl, dto)
      .pipe(catchError(this.handleError));
  }

  getInvitations(): Observable<ApiSuccessResponse<InvitationResponse[]>> {
    return this.http
      .get<ApiSuccessResponse<InvitationResponse[]>>(this.baseUrl)
      .pipe(catchError(this.handleError));
  }

  revokeInvitation(id: string): Observable<ApiSuccessResponse<{ message: string }>> {
    return this.http
      .post<ApiSuccessResponse<{ message: string }>>(`${this.baseUrl}/${id}/revoke`, {})
      .pipe(catchError(this.handleError));
  }

  validateToken(token: string): Observable<ApiSuccessResponse<ValidateTokenResponse>> {
    return this.http
      .get<ApiSuccessResponse<ValidateTokenResponse>>(`${this.baseUrl}/validate/${token}`)
      .pipe(catchError(this.handleError));
  }

  acceptInvitation(token: string): Observable<ApiSuccessResponse<AcceptInvitationResponse>> {
    return this.http
      .post<ApiSuccessResponse<AcceptInvitationResponse>>(`${this.baseUrl}/accept/${token}`, {})
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
      errorMessage = 'Unable to connect to the server. Please check your connection.';
    }

    return throwError(() => new Error(errorMessage));
  }
}
