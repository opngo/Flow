import { Component, type ErrorInfo, type ReactNode } from 'react';
import { download } from '../lib/platform';
import { ErrorPanel } from './ui';

type Props = { children: ReactNode; /** Label shown in the panel, e.g. the route path. */ scope?: string };
type State = { error: Error | null; info: ErrorInfo | null };

/**
 * Route-level safety net. A render fault in one page must never blank the whole
 * app: the shell, sidebar and database stay alive and the user is offered a
 * retry, a JSON backup of their data, and a copyable error report.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info });
    // Local-first app: keep the report on the machine, never send it anywhere.
    console.error('Flow: render error', error, info.componentStack);
  }

  private retry = () => this.setState({ error: null, info: null });

  private copyReport = async () => {
    const { error, info } = this.state;
    const report = [
      `Flow render error${this.props.scope ? ` in ${this.props.scope}` : ''}`,
      new Date().toISOString(),
      String(error?.stack ?? error),
      info?.componentStack ?? '',
      `user agent: ${navigator.userAgent}`,
      `location: ${window.location.hash}`,
    ].join('\n\n');
    try {
      await navigator.clipboard.writeText(report);
    } catch {
      download('flow-error-report.txt', report, 'text/plain');
    }
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <ErrorPanel
        title="This view stopped responding"
        message={this.state.error.message || 'Unknown render error'}
        scope={this.props.scope}
        stack={this.state.error.stack ?? ''}
        onRetry={this.retry}
        onReload={() => window.location.reload()}
        onCopy={this.copyReport}
      />
    );
  }
}
