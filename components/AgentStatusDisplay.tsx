import React from 'react';
import { AgentStatus, AgentLog } from '../types';
import { Terminal, Cpu, CheckCircle2, Loader2 } from 'lucide-react';

interface Props {
  status: AgentStatus;
  logs: AgentLog[];
}

const AgentStatusDisplay: React.FC<Props> = ({ status, logs }) => {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const getStatusColor = () => {
    switch (status) {
      case AgentStatus.IDLE: return 'text-gray-400';
      case AgentStatus.COMPLETED: return 'text-green-400';
      default: return 'text-cyan-400';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case AgentStatus.RESEARCHING: return 'Scanning global network for viral patterns...';
      case AgentStatus.SCRIPTING: return 'Synthesizing narrative structure & SEO metadata...';
      case AgentStatus.GENERATING_ASSETS: return 'Rendering visual & audio assets (Veo/Imagen/TTS)...';
      case AgentStatus.REVIEW: return 'Waiting for human validation...';
      case AgentStatus.RENDERING: return 'Compiling final video composition...';
      case AgentStatus.UPLOADING: return 'Broadcasting to YouTube servers...';
      case AgentStatus.COMPLETED: return 'Mission Accomplished. Ready for next cycle.';
      default: return 'System Online. Waiting for command.';
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 h-full flex flex-col shadow-lg">
      <div className="flex items-center justify-between mb-4 border-b border-gray-800 pb-2">
        <div className="flex items-center gap-2">
          <Terminal className={`w-5 h-5 ${getStatusColor()}`} />
          <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-gray-300">Agent Terminal</h2>
        </div>
        <div className="flex items-center gap-2">
           {status !== AgentStatus.IDLE && status !== AgentStatus.REVIEW && status !== AgentStatus.COMPLETED && (
             <Loader2 className="w-4 h-4 animate-spin text-cyan-500" />
           )}
           <span className={`text-xs font-mono px-2 py-1 rounded bg-gray-800 ${getStatusColor()}`}>
             {status}
           </span>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center gap-3 mb-1">
          <Cpu className="w-4 h-4 text-cyan-600" />
          <span className="text-xs text-gray-400 uppercase tracking-widest">Current Process</span>
        </div>
        <div className={`font-mono text-sm ${status === AgentStatus.IDLE ? 'text-gray-500' : 'text-cyan-300 animate-pulse'}`}>
           {`> ${getStatusText()}`}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-black/50 rounded p-2 font-mono text-xs space-y-2 border border-gray-800" ref={scrollRef}>
        {logs.map((log) => (
          <div key={log.id} className="flex gap-2">
            <span className="text-gray-600">[{log.timestamp.toLocaleTimeString()}]</span>
            <span className={
              log.type === 'error' ? 'text-red-400' :
              log.type === 'success' ? 'text-green-400' :
              log.type === 'thinking' ? 'text-purple-400' :
              'text-gray-300'
            }>
              {log.message}
            </span>
          </div>
        ))}
        {logs.length === 0 && <span className="text-gray-600 italic">No logs available...</span>}
      </div>
    </div>
  );
};

export default AgentStatusDisplay;