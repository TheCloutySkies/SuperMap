import './ToolsView.css'
import { TOOLS_LIST } from './toolsList'
import ForensicsView from './ForensicsView'

export default function ToolsView({ activeToolId, onToolChange }) {
  const activeTool = activeToolId || 'adsb'
  const tool = TOOLS_LIST.find((t) => t.id === activeTool) || TOOLS_LIST.find((t) => t.id === 'adsb')

  if (tool?.native === 'forensics') {
    return (
      <div className="xp-page">
        <ForensicsView />
      </div>
    )
  }

  return (
    <div className="xp-page">
      <div className="xp-page-tools">
        <menu role="tablist" className="xp-tabs" aria-label="Select tool">
          {TOOLS_LIST.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTool === t.id}
              onClick={() => onToolChange && onToolChange(t.id)}
            >
              {t.title}
            </button>
          ))}
        </menu>
      </div>
      <div className="xp-page-body">
        {tool && (
          <>
            <p className="xp-note">
              {tool.desc}
              {tool.apiDocsUrl ? (
                <>
                  {' '}
                  <a href={tool.apiDocsUrl} target="_blank" rel="noopener noreferrer">API docs</a>
                </>
              ) : null}
            </p>
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
