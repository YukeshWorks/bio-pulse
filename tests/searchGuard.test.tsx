// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchPage } from '../src/pages/SearchPage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('search page safety guard', () => {
  it('does not run production searches for controlled substances (no network requests)', () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    render(
      <MemoryRouter initialEntries={['/search?q=DL-methamphetamine%20extraction%20production']}>
        <SearchPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('This search was not run')).toBeTruthy();
    expect(screen.getByText(/health effects/)).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
  });
});
