import { useState, useEffect } from 'react';
import { ProjectStatus, NextAction } from '@/lib/agent-report-types';
import ConnectionsPage from './ConnectionsPage';
import TaskBoard from './TaskBoard';
import LiveChatPanel from './LiveChatPanel';

interface Props {
  project: ProjectStatus;
  onBack: () => void;
}

interface ConnectedAgent {
  id: string;
  displayName: string;
  providerType: string;
  status: string;
}

export default function ProjectDetailView({ project, onBack }: Props) {
  const [view, setView] = useState<'detail' | 'connections'>('detail');
  const [connectedAgents, setConnectedAgents] = useState<ConnectedAgent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<ConnectedAgent | null>(null);
  const [dispatching, setDispatching] = useState(false);

  useEffect(() => {
    loadConnections();
  }, [project.projectName]);

  const loadConnections = async () => {
    try {
      const res = await fetch(`/api/connections?projectName=${encodeURIComponent(project.projectName)}`);
      if (res.ok) {
        const data = await res.json();
        setConnectedAgents(data.availableAgents || []);
      }
    } catch (err) {
      console.error('Failed to load connections:', err);
    }
  };

  const dispatchTask = async (action: NextAction, agentId: string) => {
    setDispatching(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: project.projectName,
          agentId,
          brief: action.agentTaskBrief,
          context: `Priority: ${action.priority}\nReasoning: ${action.reasoning}\nCost of waiting: ${action.costOfWaiting}`,
        }),
      });
      
      if (res.ok) {
        alert('Task dispatched! Check the Task Board for status.');
      } else {
        const data = await res.json();
        alert(data.message || 'Failed to dispatch task');
      }
    } catch (err) {
      alert('Failed to dispatch task: ' + (err as Error).message);
    } finally {
      setDispatching(false);
    }
  };

  if (view === 'connections') {
    return (
      <ConnectionsPage
        projectName={project.projectName}
        onBack={() => setView('detail')}
      />
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{project.projectName}</h1>
              <p className="text-sm text-slate-600 mt-1">
                {project.verdict}
              </p>
              {connectedAgents.length > 0 && (
                <p className="text-xs text-green-600 mt-1">
                  {connectedAgents.length} agent{connectedAgents.length !== 1 ? 's' : ''} connected
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setView('connections')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
              >
                Manage Connections
              </button>
              <button
                onClick={onBack}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors text-sm font-medium"
              >
                ← Back
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Task Board */}
        <TaskBoard projectName={project.projectName} />

        {/* Connected Agents (Quick View) */}
        {connectedAgents.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">
                Connected: {connectedAgents.map(a => a.displayName).join(', ')}
              </h3>
              <button
                onClick={() => setSelectedAgent(connectedAgents[0])}
                className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Open Live Chat
              </button>
            </div>
          </div>
        )}

        {/* Founder Signal */}
        {project.founderSignal && (
          <div className={`rounded-lg p-6 border-2 ${
            project.founderSignal === 'keep' ? 'bg-blue-50 border-blue-200' :
            project.founderSignal === 'push' ? 'bg-green-50 border-green-200' :
            project.founderSignal === 'pause' ? 'bg-yellow-50 border-yellow-200' :
            'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center gap-3 mb-3">
              <span className={`text-2xl font-bold ${
                project.founderSignal === 'keep' ? 'text-blue-900' :
                project.founderSignal === 'push' ? 'text-green-900' :
                project.founderSignal === 'pause' ? 'text-yellow-900' :
                'text-red-900'
              }`}>
                {project.founderSignal.toUpperCase()}
              </span>
            </div>
            <p className={`text-sm ${
              project.founderSignal === 'keep' ? 'text-blue-800' :
              project.founderSignal === 'push' ? 'text-green-800' :
              project.founderSignal === 'pause' ? 'text-yellow-800' :
              'text-red-800'
            }`}>
              {project.signalReasoning}
            </p>
          </div>
        )}

        {/* Next Actions with Send to Agent */}
        {project.nextActions && project.nextActions.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              What to Do Next
            </h2>
            <div className="space-y-4">
              {project.nextActions.map((action, i) => (
                <div key={i} className="border border-slate-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-900">{action.title}</h3>
                      <p className="text-sm text-slate-500 mt-1">
                        Priority #{action.priority} • {action.founderTimeMinutes} minutes
                      </p>
                    </div>
                    {connectedAgents.length > 0 && (
                      <div className="flex gap-2">
                        {connectedAgents.map((agent) => (
                          <button
                            key={agent.id}
                            onClick={() => dispatchTask(action, agent.id)}
                            disabled={dispatching}
                            className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                          >
                            Send to {agent.displayName}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <p className="text-sm text-slate-600 mb-3">{action.reasoning}</p>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-2">
                      <span className="text-slate-500">💰</span>
                      <span className="text-slate-600">
                        Cost of waiting: {action.costOfWaiting}
                      </span>
                    </div>
                    
                    {action.blockedMetric && (
                      <div className="flex items-start gap-2">
                        <span className="text-orange-600">🚧</span>
                        <span className="text-orange-600 font-semibold">
                          Blocks: {action.blockedMetric}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <details className="mt-3">
                    <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">
                      Agent task brief
                    </summary>
                    <div className="mt-2 p-3 bg-slate-50 rounded border border-slate-200">
                      <pre className="text-xs text-slate-700 whitespace-pre-wrap">
                        {action.agentTaskBrief}
                      </pre>
                    </div>
                  </details>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Connection Info */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-slate-600">Status:</span>
              <span className="ml-2 text-green-700 font-semibold">Connected</span>
            </div>
            {project.lastReportDate && (
              <div className="text-slate-500">
                Last report: {new Date(project.lastReportDate).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Live Chat Panel */}
      {selectedAgent && (
        <LiveChatPanel
          projectName={project.projectName}
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
        />
      )}
    </div>
  );
}
