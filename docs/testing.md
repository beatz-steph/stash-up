# Testing Guide

## 1. Testing Stack
- **Vitest**: Test runner
- **React Testing Library**: Component testing
- **MSW**: HTTP mocking for frontend API calls
- **vitest-mock-extended**: Deep mocking for Prisma

## 2. Test Types

### Route Handler Tests (Backend)
Route handlers are tested by directly invoking the `GET`/`POST` functions. **Do not use MSW for route handlers.**
Instead, use `vi.mock` for dependencies like `auth`, `prisma`, `next/headers`.

Example:
\`\`\`typescript
import { GET } from './route';
import { auth } from '@/lib/auth';
import { prisma } from '@workspace/db';

it('returns 200', async () => {
  vi.mocked(auth.api.getSession).mockResolvedValue(createMockSession());
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: '1' } as any);
  
  const response = await GET();
  expect(response.status).toBe(200);
});
\`\`\`

### Frontend Data Fetcher Tests
Use **MSW** to intercept network requests from `lib/api/data/*` wrappers.
Add your MSW handlers to `test/msw/handlers.ts`.

### Component Tests
Use React Testing Library to mount components and `userEvent` for interactions.

## 3. Mock Factories
We provide factories in `test/mocks/` to generate consistent test data:
- `createMockSession(overrides)` in `test/mocks/auth.ts`
- Redis and Nomba factories are also available.
