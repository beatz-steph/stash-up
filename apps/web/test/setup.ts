import { vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma } from '@workspace/db';

vi.mock('@workspace/db', async () => {
  const mod = await import('vitest-mock-extended');
  return { prisma: mod.mockDeep() };
});

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

beforeEach(() => {
  mockReset(prisma);
  vi.clearAllMocks();
});
