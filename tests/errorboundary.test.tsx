import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

function Boom(): JSX.Element {
  throw new Error('synthetic render failure');
}

describe('error boundary', () => {
  it('keeps the shell alive and offers recovery', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary scope="/broken">
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('This view stopped responding')).toBeTruthy();
    expect(screen.getByText(/synthetic render failure/)).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
    expect(screen.getByText('Reload Flow')).toBeTruthy();
    expect(screen.getByText(/database is untouched/i)).toBeTruthy();
    spy.mockRestore();
  });

  it('renders children normally when nothing throws', () => {
    render(<ErrorBoundary><div>healthy</div></ErrorBoundary>);
    expect(screen.getByText('healthy')).toBeTruthy();
  });
});
