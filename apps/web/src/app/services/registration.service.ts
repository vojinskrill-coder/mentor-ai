import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Industry } from '@mentor-ai/shared/utils';

export interface RegisterTenantRequest {
  email: string;
  companyName: string;
  industry: Industry;
  description?: string;
}

export interface RegistrationOptions {
  correlationId?: string;
}

export interface RegistrationResponse {
  status: 'success';
  message: string;
  tenantId: string;
  userId: string;
  email: string;
  companyName: string;
  iconUrl?: string;
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
export class RegistrationService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/registration';

  register(
    data: RegisterTenantRequest,
    icon?: File,
    options?: RegistrationOptions
  ): Observable<RegistrationResponse> {
    const formData = new FormData();

    // Add form fields
    formData.append('email', data.email);
    formData.append('companyName', data.companyName);
    formData.append('industry', data.industry);
    if (data.description) {
      formData.append('description', data.description);
    }

    // Add icon file if provided
    if (icon) {
      formData.append('icon', icon, icon.name);
    }

    // Build headers with optional correlation ID
    let headers = new HttpHeaders();
    if (options?.correlationId) {
      headers = headers.set('X-Correlation-Id', options.correlationId);
    }

    return this.http
      .post<RegistrationResponse>(this.apiUrl, formData, { headers })
      .pipe(catchError(this.handleError));
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An unexpected error occurred. Please try again.';

    if (error.error) {
      // Server returned an error response
      const apiError = error.error as ApiError;
      if (apiError.detail) {
        errorMessage = apiError.detail;
      } else if (apiError.title) {
        errorMessage = apiError.title;
      }
    } else if (error.status === 0) {
      // Network error
      errorMessage = 'Unable to connect to the server. Please check your connection.';
    } else if (error.status === 409) {
      errorMessage = 'An account with this email already exists.';
    }

    return throwError(() => new Error(errorMessage));
  }
}
