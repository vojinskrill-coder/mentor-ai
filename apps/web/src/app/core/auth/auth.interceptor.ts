import {
  HttpInterceptorFn,
  HttpRequest,
  HttpHandlerFn,
} from '@angular/common/http';

const STORAGE_KEY = 'mentor_ai_token';

/**
 * HTTP Interceptor to add Authorization header with stored JWT token.
 */
export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  // Skip auth for public endpoints
  const publicEndpoints = [
    '/api/health',
    '/api/registration',
    '/api/invitations/validate',
    '/api/auth/google/callback',
  ];

  const isPublic = publicEndpoints.some((endpoint) =>
    req.url.includes(endpoint)
  );

  if (isPublic) {
    return next(req);
  }

  const token = localStorage.getItem(STORAGE_KEY);
  if (token) {
    const authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
    return next(authReq);
  }

  return next(req);
};
