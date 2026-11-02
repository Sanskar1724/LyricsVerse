import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onReset: () => void;
}

export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="screen center-screen">
        <div className="card narrow">
          <h2>Oops, the stage tripped over a cable 🎛️</h2>
          <p className="muted">Something went wrong while showing this song. Your library is safe.</p>
          <button
            className="btn primary"
            onClick={() => {
              this.setState({ failed: false });
              this.props.onReset();
            }}
          >
            Back to home
          </button>
        </div>
      </div>
    );
  }
}
