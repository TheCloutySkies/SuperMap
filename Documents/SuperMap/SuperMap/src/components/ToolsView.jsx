import './ToolsView.css'
import { TOOLS_LIST } from './toolsList'

export default function ToolsView({ activeToolId, onToolChange }) {
  const activeTool = activeToolId || TOOLS_LIST[0]?.id || null
  const tool = TOOLS_LIST.find((t) => t.id === activeTool)

  return (
    <div className="tools-view">
      <header className="tools-view-header">
        <h1 className="tools-view-title">Tools</h1>
        <p className="tools-view-subtitle">Embedded OSINT and monitoring tools. Select a tool below or in the sidebar.</p>
        <div className="tools-view-tabs" role="tablist" aria-label="Select tool">
          {TOOLS_LIST.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTool === t.id}
              className={`tools-view-tab ${activeTool === t.id ? 'active' : ''}`}
              onClick={() => onToolChange && onToolChange(t.id)}
            >
              {t.title}
            </button>
          ))}
        </div>
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
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
