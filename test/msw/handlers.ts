import { http, HttpResponse } from 'msw';

export const handlers = [
  // Minimal MSW handlers for Sprint 0 verification
  http.get('http://localhost:3000/api/onboarding/status', () => {
    return HttpResponse.json({
      account: true,
      verified: true,
      withdrawal: false,
    });
  }),
];
