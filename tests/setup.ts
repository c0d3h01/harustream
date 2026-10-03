import { createElement } from 'react';
import { vi } from 'vitest';

// Router stub for components built on next/navigation hooks.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => '/',
}));

// Installed React lacks the ViewTransition export the app runs with;
// pass children through so transition wrappers render in tests.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const Through = ({ children }: { children?: React.ReactNode }) =>
    createElement(actual.Fragment, null, children);
  return { ...actual, ViewTransition: Through };
});
