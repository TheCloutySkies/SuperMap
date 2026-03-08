import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('App error:', error, info?.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            background: '#0d1117',
            color: '#e6edf3',
            fontFamily: 'system-ui, sans-serif',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ maxWidth: '480px' }}>
            <h1 style={{ margin: '0 0 1rem', fontSize: '1.25rem' }}>Something went wrong</h1>
            <p style={{ margin: 0, color: '#8b949e', fontSize: '0.95rem' }}>
              {this.state.error?.message || String(this.state.error)}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              style={{
                marginTop: '1.5rem',
                padding: '0.5rem 1rem',
                background: '#238636',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
