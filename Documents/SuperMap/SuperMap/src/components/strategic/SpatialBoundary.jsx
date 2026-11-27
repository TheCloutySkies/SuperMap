import { Component } from 'react'

/**
 * A map failing must never take the whole desk (or the whole app) down with it.
 * If WebGL is unavailable or its context is lost, this shows a line and a retry.
 */
export default class SpatialBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.warn('[strategic] map unavailable:', error?.message || error)
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="console-map-fallback" role="status">
          <p>
            <b>The theater map could not start in this browser.</b> WebGL is unavailable or its context was lost,
            so the map is disabled. Every signal below still works.
          </p>
          <button type="button" className="console-btn" onClick={() => this.setState({ failed: false })}>
            Try the map again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
