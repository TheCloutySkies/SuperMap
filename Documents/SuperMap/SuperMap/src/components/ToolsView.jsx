import './ToolsView.css'
import { TOOLS_LIST } from './toolsList'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : 'http://localhost:3001'

export default function ToolsView({ activeToolId, onToolChange }) {
  const activeTool = activeToolId || TOOLS_LIST[0]?.id || null
  const tool = TOOLS_LIST.find((t) => t.id === activeTool)

  return (
    <div className="tools-view">
      <header className="tools-view-header">
        <h1 className="tools-view-title">Tools</h1>
        <p className="tools-view-subtitle">Embedded OSINT and monitoring tools. Select a tool in the sidebar.</p>
      </header>
      <div className="tools-view-content">
        {tool && (
          <>
            <div className="tools-view-tool-meta">
              <p className="tools-view-tool-desc">{tool.desc}</p>
              {tool.apiDocsUrl && (
                <a href={tool.apiDocsUrl} target="_blank" rel="noopener noreferrer" className="tools-view-api-link">
                  API docs →
                </a>
              )}
            </div>
            <div className="tools-view-embed-wrap">
              <iframe
                title={tool.title}
                src={tool.embedUrl}
                className="tools-view-iframe"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
