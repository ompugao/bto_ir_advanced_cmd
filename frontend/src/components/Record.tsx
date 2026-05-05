import React, { useState } from 'react';
import type { Config } from '../types';

interface RecordProps {
  config: Config;
  fetchConfig: () => void;
  notify: (message: string, type?: 'success' | 'error') => void;
}

const RecordComponent: React.FC<RecordProps> = ({ config, fetchConfig, notify }) => {
  const [recordingStatus, setRecordingStatus] = useState<'idle' | 'recording' | 'stopped'>('idle');
  const [recordingStep, setRecordingStep] = useState<number>(0);
  const [recordedData, setRecordedData] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newChannel, setNewChannel] = useState<number>(1);

  const startRecording = async () => {
    try {
      await fetch('/api/commands/record/start', { method: 'POST' });
      setRecordingStatus('recording');
      setRecordingStep(1);
      setRecordedData(null);
    } catch (e) {
      notify('Failed to start recording', 'error');
    }
  };

  const stopRecording = async () => {
    try {
      await fetch('/api/commands/record/stop', { method: 'POST' });
      setRecordingStatus('stopped');
      setRecordingStep(2);
      
      setTimeout(async () => {
        const res = await fetch('/api/commands/record/data');
        const json = await res.json();
        setRecordedData(json.data);
        setRecordingStep(3);
        notify('Data captured!');
      }, 500);
    } catch (e) {
      notify('Failed to stop recording', 'error');
    }
  };

  const saveCommand = async () => {
    if (!newName || !recordedData) return;
    const res = await fetch(`/api/commands?name=${encodeURIComponent(newName)}&raw_data=${encodeURIComponent(recordedData)}&channel=${newChannel}`, { method: 'POST' });
    if (res.ok) {
      notify('Command registered');
      fetchConfig();
      setNewName('');
      setRecordedData(null);
      setRecordingStep(0);
      setRecordingStatus('idle');
      setNewChannel(1);
    }
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">Record IR Command</h2>
      </div>

      <div className="glass-panel rounded-2xl p-6 sm:p-8">
        <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-px before:bg-gray-200">
          
          {/* Step 1 */}
          <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
            <div className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10 font-bold transition-colors bg-white border-2 ${recordingStep >= 1 ? 'border-blue-500 text-blue-600' : 'border-gray-300 text-gray-400'}`}>
              1
            </div>
            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-2xl bg-gray-50 border border-gray-200">
              <button 
                onClick={startRecording} 
                disabled={recordingStatus === 'recording'}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors focus:ring-2 focus:ring-blue-500/50"
              >
                Start Recording
              </button>
              
              {recordingStatus === 'recording' && (
                <div className="mt-4 flex items-center space-x-3 bg-red-50 p-3 rounded-xl border border-red-100">
                  <div className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                  </div>
                  <span className="text-red-600 font-medium text-xs">Press button on remote...</span>
                </div>
              )}
            </div>
          </div>

          {/* Step 2 */}
          <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
            <div className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10 font-bold transition-colors bg-white border-2 ${recordingStep >= 2 ? 'border-blue-500 text-blue-600' : 'border-gray-300 text-gray-400'}`}>
               2
            </div>
            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-2xl bg-gray-50 border border-gray-200">
              <button 
                onClick={stopRecording} 
                disabled={recordingStatus !== 'recording'}
                className="w-full bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 px-4 py-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors focus:ring-2 focus:ring-gray-500/50"
              >
                Stop Recording
              </button>
            </div>
          </div>

          {/* Step 3 */}
          <div className={`relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active transition-opacity ${!recordedData ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            <div className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10 font-bold transition-colors bg-white border-2 ${recordingStep >= 3 ? 'border-green-500 text-green-600' : 'border-gray-300 text-gray-400'}`}>
              3
            </div>
            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-5 rounded-2xl bg-gray-50 border border-gray-200 shadow-sm">
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Command Name</label>
                  <input 
                    type="text" 
                    value={newName} 
                    onChange={e => setNewName(e.target.value)} 
                    placeholder="e.g. TV_POWER" 
                    className="w-full bg-white border border-gray-300 text-gray-900 px-3 py-2 rounded-lg focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors outline-none" 
                  />
                </div>
                <div>
                  <div className="flex justify-between items-end mb-1.5">
                    <label className="text-xs font-semibold text-gray-600">Target Channel</label>
                    <span className="text-[10px] text-gray-500">{config.mappings[newChannel] ? `Mapped: ${config.mappings[newChannel]}` : 'Unmapped'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3].map(ch => (
                      <button 
                        key={ch} 
                        onClick={() => setNewChannel(ch)} 
                        className={`py-2 rounded-lg font-medium text-sm transition-colors border ${
                          newChannel === ch 
                            ? 'bg-blue-50 border-blue-200 text-blue-700' 
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        CH{ch}
                      </button>
                    ))}
                  </div>
                </div>
                <button 
                  onClick={saveCommand} 
                  className="w-full mt-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl font-medium shadow-sm transition-colors focus:ring-2 focus:ring-green-500/50"
                >
                  Save Command
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default RecordComponent;
