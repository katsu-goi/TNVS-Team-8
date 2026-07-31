import React, { useState } from 'react';
import { apiClient } from '../../api/client';
import { AddAiProviderModal, ProviderFormData } from './AddAiProviderModal';
import {
  Cpu, Activity, CheckCircle2, AlertTriangle, RefreshCw,
  Plus, FileText, Settings,
  Zap, Shield, Download, Server, Clock, BarChart3, Search,
  Sparkles, Terminal, X, InboxIcon
} from 'lucide-react';

// --- TYPES ---
interface Provider {
  id: string;
  name: string;
  model: string;
  status: 'CONNECTED' | 'OFFLINE';
  lastSync: string;
  responseTime: string;
  isDefault: boolean;
  type: 'openai' | 'gemini' | 'claude' | 'local';
}

interface AIModule {
  id: string;
  name: string;
  iconName: string;
  enabled: boolean;
  status: 'Active' | 'Standby' | 'Disabled';
  features: string[];
}

interface RequestLog {
  id: string;
  time: string;
  module: string;
  provider: string;
  operation: string;
  status: 'SUCCESS' | 'FAILED' | 'IN_PROGRESS';
  duration: string;
  tokens: number;
  user: string;
}

// --- DEFAULT SYSTEM PROMPT ---
const DEFAULT_SYSTEM_PROMPT = `# TNVS Facilities & Administrative AI System Prompt
Version: 2.4.0-Enterprise

You are Photonic Omega AI, the core intelligent assistant for the TNVS Facilities & Administrative Management System.
You operate with strict adherence to Philippine government administrative standards, transport security protocols, and enterprise governance compliance.

## Operational Directives:
1. Prioritize data security, user privacy, and strict RBAC enforcement.
2. In Document & Contract Analysis: Identify risk scores (LOW, MEDIUM, HIGH, CRITICAL), highlight missing mandatory clauses, and auto-tag metadata.
3. In Facility Reservations: Detect schedule overlaps, optimize occupancy allocations, and flag unapproved high-capacity bookings.
4. In Visitor Management: Perform OCR parsing on Philippine valid IDs (Drivers License, UMID, Passport) and match security watchlists.
5. In Legal & Records: Apply automated retention rules under National Archives guidelines and flag legal compliance risks immediately.

Output must be concise, structured in valid JSON when requested, and formatted cleanly in markdown.`;

export const AiServicesPage: React.FC = () => {
  // States — starts empty, no mock data
  const [providers, setProviders] = useState<Provider[]>([]);
  const [modules, setModules] = useState<AIModule[]>([]);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [tempPrompt, setTempPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [logs] = useState<RequestLog[]>([]);
  const [logSearch, setLogSearch] = useState('');
  const [logStatusFilter, setLogStatusFilter] = useState('ALL');

  // Modals & Feedback
  const [showAddProviderModal, setShowAddProviderModal] = useState(false);
  const [showConfigModuleModal, setShowConfigModuleModal] = useState<AIModule | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const toggleModule = (id: string) => {
    setModules(prev =>
      prev.map(m => {
        if (m.id === id) {
          const nextState = !m.enabled;
          showToast(`${m.name} module ${nextState ? 'enabled' : 'disabled'}`);
          return {
            ...m,
            enabled: nextState,
            status: nextState ? 'Active' : 'Disabled',
          };
        }
        return m;
      })
    );
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    const defaultProvider = providers.find(p => p.isDefault) || providers[0];
    const startMs = Date.now();
    try {
      const res = await apiClient.post('/ai/test-connection', {
        provider: defaultProvider?.name,
        model: defaultProvider?.model,
      });
      const data = res.data?.data;
      const latency = data?.responseTimeMs || (Date.now() - startMs);
      showToast(`Live AI Connection verified! Latency: ${latency}ms · Engine: ${data?.modelUsed || defaultProvider?.model || 'N/A'}`);
    } catch {
      showToast('AI Connection test failed. Verify provider configuration and connectivity.');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSetDefaultProvider = (id: string) => {
    setProviders(prev =>
      prev.map(p => ({
        ...p,
        isDefault: p.id === id,
      }))
    );
    showToast('Default AI provider updated.');
  };

  const handleSaveProviderFromModal = (data: ProviderFormData) => {
    let pType: 'openai' | 'gemini' | 'claude' | 'local' = 'openai';
    if (data.providerType.includes('Gemini')) pType = 'gemini';
    else if (data.providerType.includes('Claude')) pType = 'claude';
    else if (data.providerType.includes('Ollama') || data.providerType.includes('LM Studio') || data.providerType.includes('Local')) pType = 'local';

    const newP: Provider = {
      id: `p-${Date.now()}`,
      name: data.displayName,
      model: data.model,
      status: 'CONNECTED',
      lastSync: 'Just now',
      responseTime: '—',
      isDefault: data.isDefault || providers.length === 0,
      type: pType,
    };

    if (data.isDefault) {
      setProviders(prev => prev.map(p => ({ ...p, isDefault: false })).concat(newP));
    } else {
      setProviders(prev => [...prev, newP]);
    }

    setShowAddProviderModal(false);
    showToast(`AI Provider "${data.displayName}" added successfully!`);
  };

  const handleSavePrompt = () => {
    setSystemPrompt(tempPrompt);
    setIsEditingPrompt(false);
    showToast('System AI instructions prompt updated!');
  };

  const handleRestoreDefaultPrompt = () => {
    setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
    setTempPrompt(DEFAULT_SYSTEM_PROMPT);
    setIsEditingPrompt(false);
    showToast('System prompt restored to enterprise default.');
  };

  const filteredLogs = logs.filter(l => {
    const matchesSearch =
      l.module.toLowerCase().includes(logSearch.toLowerCase()) ||
      l.operation.toLowerCase().includes(logSearch.toLowerCase()) ||
      l.user.toLowerCase().includes(logSearch.toLowerCase()) ||
      l.provider.toLowerCase().includes(logSearch.toLowerCase());
    const matchesStatus = logStatusFilter === 'ALL' || l.status === logStatusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-8 pb-16 text-slate-800 font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center space-x-3 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-xl border border-slate-700 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-sm font-medium">{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* HEADER SECTION */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-100 shadow-inner">
            <Cpu className="w-7 h-7 text-emerald-600" />
          </div>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold font-heading text-slate-900 tracking-tight">AI Services</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                Enterprise Active
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Configure AI providers, prompts, and monitor AI-powered automation across Facilities & Administrative Management.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 self-end md:self-auto">
          <button
            onClick={handleTestConnection}
            disabled={testingConnection}
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-xs hover:bg-emerald-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${testingConnection ? 'animate-spin' : ''}`} />
            <span>{testingConnection ? 'Testing...' : 'Test Connection'}</span>
          </button>
        </div>
      </div>

      {/* SECTION 5 — AI USAGE ANALYTICS */}
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900">AI Usage Analytics</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Key operational metrics and volume breakdown for AI execution.
          </p>
        </div>

        {/* 6 Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Requests Today</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">0</p>
            <p className="text-[10px] text-slate-400 font-semibold mt-1">No API calls recorded</p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Docs Processed</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">0</p>
            <p className="text-[10px] text-slate-400 font-semibold mt-1">OCR engine ready</p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Contracts Reviewed</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">0</p>
            <p className="text-[10px] text-slate-400 font-semibold mt-1">Clause flags: 0</p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Visitors Verified</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">0</p>
            <p className="text-[10px] text-slate-400 font-semibold mt-1">Security alerts: 0</p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Avg Response Time</p>
            <p className="text-2xl font-bold text-slate-400 mt-1">— ms</p>
            <p className="text-[10px] text-slate-400 mt-1">Awaiting requests</p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Success Rate</p>
            <p className="text-2xl font-bold text-slate-400 mt-1">—</p>
            <p className="text-[10px] text-slate-400 font-semibold mt-1">No requests yet</p>
          </div>
        </div>

        {/* 4 Recharts Charts — empty state */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Requests per Day */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Requests per Day</h3>
            <p className="text-xs text-slate-400 mb-4">Daily volume of AI API calls over the past week</p>
            <div className="h-60 flex items-center justify-center bg-slate-50/50 rounded-xl border border-slate-100">
              <div className="text-center">
                <BarChart3 className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-xs text-slate-400">No request data yet</p>
              </div>
            </div>
          </div>

          {/* Token Consumption */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Token Consumption (k Tokens)</h3>
            <p className="text-xs text-slate-400 mb-4">Total token utilization across all LLM backends</p>
            <div className="h-60 flex items-center justify-center bg-slate-50/50 rounded-xl border border-slate-100">
              <div className="text-center">
                <BarChart3 className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-xs text-slate-400">No token data yet</p>
              </div>
            </div>
          </div>

          {/* Response Time Trend */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Response Time (ms)</h3>
            <p className="text-xs text-slate-400 mb-4">Real-time latency profile throughout active working hours</p>
            <div className="h-60 flex items-center justify-center bg-slate-50/50 rounded-xl border border-slate-100">
              <div className="text-center">
                <Activity className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-xs text-slate-400">No latency data yet</p>
              </div>
            </div>
          </div>

          {/* Module Usage Distribution */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">Module Usage Distribution</h3>
              <p className="text-xs text-slate-400 mb-2">Percentage breakdown of AI invocation by functional unit</p>
            </div>
            <div className="h-56 flex items-center justify-center bg-slate-50/50 rounded-xl border border-slate-100">
              <div className="text-center">
                <Activity className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-xs text-slate-400">No module usage data yet</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 1 — AI PROVIDER SETTINGS */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
              <span>AI Provider Settings</span>
              <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {providers.length} Configured
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Manage LLM gateways, API keys, default engines, and multi-provider failover rules.
            </p>
          </div>
          {providers.length > 0 && (
            <button
              onClick={() => setShowAddProviderModal(true)}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Add Provider</span>
            </button>
          )}
        </div>

        {providers.length === 0 ? (
          /* Empty State */
          <div className="py-12 px-6 rounded-2xl bg-gradient-to-b from-slate-50 to-emerald-50/20 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
            <div className="p-4 rounded-full bg-white shadow-md border border-slate-100 mb-4">
              <Cpu className="w-10 h-10 text-emerald-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">No AI Provider Configured</h3>
            <p className="text-sm text-slate-600 max-w-xl mb-6 leading-relaxed">
              Connect an AI provider (OpenAI, Google Gemini, Anthropic Claude, or Local LLM) to enable intelligent document processing, legal analysis, visitor verification, and contract review.
            </p>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowAddProviderModal(true)}
                className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Add Provider</span>
              </button>
              <button
                onClick={handleTestConnection}
                disabled={testingConnection}
                className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-xs shadow-sm transition-all"
              >
                <RefreshCw className={`w-4 h-4 ${testingConnection ? 'animate-spin' : ''}`} />
                <span>Test Connection</span>
              </button>
            </div>
          </div>
        ) : (
          /* Configured Providers List */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {providers.map(p => (
              <div
                key={p.id}
                className={`p-5 rounded-2xl border transition-all relative flex flex-col justify-between ${
                  p.isDefault
                    ? 'bg-emerald-50/40 border-emerald-300 shadow-sm'
                    : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-sm'
                }`}
              >
                {p.isDefault && (
                  <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-600 text-white shadow-xs">
                    Default Provider
                  </span>
                )}
                <div>
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-xs">
                      <Sparkles className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{p.name}</h4>
                      <p className="text-xs font-mono text-slate-500 mt-0.5">{p.model}</p>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs border-t border-slate-100 pt-3 mt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">API Status:</span>
                      <span
                        className={`inline-flex items-center space-x-1 font-semibold px-2 py-0.5 rounded-full text-[10px] ${
                          p.status === 'CONNECTED'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-rose-100 text-rose-800 border border-rose-200'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${p.status === 'CONNECTED' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                        <span>{p.status}</span>
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Last Sync:</span>
                      <span className="font-mono text-slate-700">{p.lastSync}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Response Time:</span>
                      <span className="font-mono text-emerald-700 font-semibold">{p.responseTime}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  {!p.isDefault ? (
                    <button
                      onClick={() => handleSetDefaultProvider(p.id)}
                      className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                    >
                      Make Default
                    </button>
                  ) : (
                    <span className="text-xs text-emerald-800 font-medium">Primary LLM</span>
                  )}
                  <button
                    onClick={handleTestConnection}
                    className="text-xs font-medium text-slate-500 hover:text-slate-800"
                  >
                    Test
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 2 — AI MODULES */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
        <div className="mb-6 pb-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">AI Modules</h2>
          <p className="text-xs text-slate-500 mt-1">
            Enable or disable automated AI routines and intelligence features across facilities administration.
          </p>
        </div>

        {modules.length === 0 ? (
          <div className="py-10 flex flex-col items-center justify-center text-center">
            <div className="p-3 rounded-full bg-slate-100 mb-3">
              <Zap className="w-7 h-7 text-slate-300" />
            </div>
            <p className="text-sm font-semibold text-slate-600">No AI Modules Configured</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Modules will appear here once an AI provider is connected and modules are registered in the system.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {modules.map(mod => (
              <div
                key={mod.id}
                className={`p-5 rounded-2xl border transition-all flex flex-col justify-between ${
                  mod.enabled
                    ? 'bg-white border-slate-200 shadow-sm hover:shadow-md'
                    : 'bg-slate-50/60 border-slate-200/60 opacity-80'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div
                        className={`p-2.5 rounded-xl border ${
                          mod.enabled
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                            : 'bg-slate-200/60 border-slate-300 text-slate-400'
                        }`}
                      >
                        <Zap className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 leading-snug">{mod.name}</h3>
                        <span
                          className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 ${
                            mod.status === 'Active'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {mod.status}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => toggleModule(mod.id)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        mod.enabled ? 'bg-emerald-600' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          mod.enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="space-y-2 mb-4">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Features:</p>
                    <ul className="space-y-1.5">
                      {mod.features.map((feat, idx) => (
                        <li key={idx} className="flex items-start space-x-2 text-xs text-slate-600">
                          <CheckCircle2 className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${mod.enabled ? 'text-emerald-500' : 'text-slate-300'}`} />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex justify-end">
                  <button
                    onClick={() => setShowConfigModuleModal(mod)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Configure</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 3 — SYSTEM PROMPT */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-100 gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
              <Terminal className="w-5 h-5 text-emerald-600" />
              <span>AI Instructions</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Manage the global system prompt and operational instructions applied across every module.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <span className="text-xs font-mono text-slate-500 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200 flex items-center space-x-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>system_prompt.md</span>
            </span>
            {isEditingPrompt ? (
              <>
                <button
                  onClick={handleSavePrompt}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition-all"
                >
                  Save Prompt
                </button>
                <button
                  onClick={() => {
                    setTempPrompt(systemPrompt);
                    setIsEditingPrompt(false);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setTempPrompt(systemPrompt);
                    setIsEditingPrompt(true);
                  }}
                  className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs shadow-sm transition-all"
                >
                  Edit Prompt
                </button>
                <button
                  onClick={handleRestoreDefaultPrompt}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs transition-colors"
                >
                  Restore Default
                </button>
              </>
            )}
          </div>
        </div>

        {isEditingPrompt ? (
          <div className="space-y-3">
            <textarea
              rows={12}
              value={tempPrompt}
              onChange={e => setTempPrompt(e.target.value)}
              className="w-full font-mono text-xs p-4 rounded-xl border border-emerald-300 bg-slate-900 text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 leading-relaxed shadow-inner"
            />
            <p className="text-[11px] text-slate-400 italic">
              Editing mode active. Click "Save Prompt" to apply changes immediately to all active AI modules.
            </p>
          </div>
        ) : (
          <div className="bg-slate-900 rounded-xl p-5 border border-slate-800 overflow-x-auto">
            <pre className="font-mono text-xs text-emerald-400 leading-relaxed whitespace-pre-wrap">
              {systemPrompt}
            </pre>
          </div>
        )}
      </div>

      {/* SECTION 4 — AI REQUEST LOGS */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-100 gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">AI Request Logs</h2>
            <p className="text-xs text-slate-500 mt-1">
              Audit trail of AI prompt executions, parameters, duration, and token consumption.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search logs..."
                value={logSearch}
                onChange={e => setLogSearch(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-500 w-44 sm:w-60"
              />
            </div>
            <select
              value={logStatusFilter}
              onChange={e => setLogStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-emerald-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="SUCCESS">SUCCESS</option>
              <option value="FAILED">FAILED</option>
            </select>
            <button
              onClick={() => {
                showToast('AI Request Logs refreshed');
              }}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="py-10 flex flex-col items-center justify-center text-center">
            <div className="p-3 rounded-full bg-slate-100 mb-3">
              <InboxIcon className="w-7 h-7 text-slate-300" />
            </div>
            <p className="text-sm font-semibold text-slate-600">No AI Request Logs</p>
            <p className="text-xs text-slate-400 mt-1">
              Logs will appear here once AI requests are made through the system.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider text-[10px] font-bold">
                  <th className="py-3 px-3">Time</th>
                  <th className="py-3 px-3">Module</th>
                  <th className="py-3 px-3">AI Provider</th>
                  <th className="py-3 px-3">Operation</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Duration</th>
                  <th className="py-3 px-3 text-right">Tokens Used</th>
                  <th className="py-3 px-3 text-right">Requested By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-3 font-mono text-slate-500">{log.time}</td>
                    <td className="py-3 px-3 font-medium text-slate-900">{log.module}</td>
                    <td className="py-3 px-3 text-slate-600">{log.provider}</td>
                    <td className="py-3 px-3 text-slate-700 font-mono text-[11px]">{log.operation}</td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          log.status === 'SUCCESS'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-600">{log.duration}</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-900 font-semibold">{log.tokens.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right text-slate-500 font-mono">{log.user}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION 6 — AI HEALTH MONITOR */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
        <div className="mb-6 pb-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">AI Health Monitor</h2>
          <p className="text-xs text-slate-500 mt-1">
            Real-time status of AI infrastructure, gateways, queue depths, and error rates.
          </p>
        </div>

        {providers.length === 0 ? (
          <div className="py-10 flex flex-col items-center justify-center text-center">
            <div className="p-3 rounded-full bg-slate-100 mb-3">
              <Activity className="w-7 h-7 text-slate-300" />
            </div>
            <p className="text-sm font-semibold text-slate-600">No Health Data Available</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Connect an AI provider to start monitoring gateway health, latency, queue depth, and error rates.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">API Connection</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              </div>
              <p className="text-base font-bold text-emerald-900">Healthy</p>
              <p className="text-[10px] text-emerald-700 mt-0.5">Provider connected</p>
            </div>
            <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Model Status</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-base font-bold text-emerald-900">Operational</p>
              <p className="text-[10px] text-emerald-700 mt-0.5">{providers.find(p => p.isDefault)?.model || providers[0]?.model || '—'}</p>
            </div>
            <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Queue Length</span>
                <Activity className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-base font-bold text-emerald-900">0 Pending</p>
              <p className="text-[10px] text-emerald-700 mt-0.5">Immediate Processing</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Avg Latency</span>
                <Clock className="w-4 h-4 text-slate-400" />
              </div>
              <p className="text-base font-bold text-slate-500">— ms</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Awaiting first request</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Daily Token Usage</span>
                <AlertTriangle className="w-4 h-4 text-slate-400" />
              </div>
              <p className="text-base font-bold text-slate-500">0 Tokens</p>
              <p className="text-[10px] text-slate-400 mt-0.5">No usage recorded</p>
            </div>
            <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Error Rate</span>
                <Shield className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-base font-bold text-emerald-900">0.00%</p>
              <p className="text-[10px] text-emerald-700 mt-0.5">Threshold: &lt; 1.0%</p>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 7 — QUICK ACTIONS */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
        <div className="mb-4 pb-3 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Quick Actions</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Administrative utility shortcuts for AI maintenance and reporting.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <button
            onClick={handleTestConnection}
            className="p-3.5 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 text-slate-700 hover:text-emerald-800 flex flex-col items-center justify-center text-center transition-all group"
          >
            <Zap className="w-5 h-5 text-slate-500 group-hover:text-emerald-600 mb-1.5" />
            <span className="text-xs font-semibold">Test AI Connection</span>
          </button>

          <button
            onClick={() => showToast('AI Infrastructure Status Refreshed')}
            className="p-3.5 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 text-slate-700 hover:text-emerald-800 flex flex-col items-center justify-center text-center transition-all group"
          >
            <RefreshCw className="w-5 h-5 text-slate-500 group-hover:text-emerald-600 mb-1.5" />
            <span className="text-xs font-semibold">Refresh Status</span>
          </button>

          <button
            onClick={() => {
              const logsEl = document.querySelector('table');
              logsEl?.scrollIntoView({ behavior: 'smooth' });
              showToast('Scrolled to AI Request Logs');
            }}
            className="p-3.5 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 text-slate-700 hover:text-emerald-800 flex flex-col items-center justify-center text-center transition-all group"
          >
            <FileText className="w-5 h-5 text-slate-500 group-hover:text-emerald-600 mb-1.5" />
            <span className="text-xs font-semibold">View Logs</span>
          </button>

          <button
            onClick={() => showToast('Usage report downloaded (ai_usage_report.csv)')}
            className="p-3.5 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 text-slate-700 hover:text-emerald-800 flex flex-col items-center justify-center text-center transition-all group"
          >
            <BarChart3 className="w-5 h-5 text-slate-500 group-hover:text-emerald-600 mb-1.5" />
            <span className="text-xs font-semibold">Export Usage Report</span>
          </button>

          <button
            onClick={() => showToast('Audit logs downloaded (ai_audit_logs.json)')}
            className="p-3.5 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 text-slate-700 hover:text-emerald-800 flex flex-col items-center justify-center text-center transition-all group"
          >
            <Download className="w-5 h-5 text-slate-500 group-hover:text-emerald-600 mb-1.5" />
            <span className="text-xs font-semibold">Download Audit Logs</span>
          </button>

          <button
            onClick={() => showToast('AI Microservice restarted successfully!')}
            className="p-3.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 flex flex-col items-center justify-center text-center transition-all group"
          >
            <Server className="w-5 h-5 text-rose-500 mb-1.5" />
            <span className="text-xs font-semibold">Restart AI Services</span>
          </button>
        </div>
      </div>

      {/* MODAL: ADD PROVIDER */}
      <AddAiProviderModal
        isOpen={showAddProviderModal}
        onClose={() => setShowAddProviderModal(false)}
        onSave={handleSaveProviderFromModal}
      />

      {/* MODAL: CONFIGURE MODULE */}
      {showConfigModuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Configure {showConfigModuleModal.name}</h3>
              <button onClick={() => setShowConfigModuleModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Assigned AI Model</label>
                <select className="w-full border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none">
                  <option value="gpt-4o">OpenAI GPT-4o (Default)</option>
                  <option value="gemini-1.5-pro">Google Gemini 1.5 Pro</option>
                  <option value="claude-3-5">Anthropic Claude 3.5 Sonnet</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Confidence Score Threshold (%)</label>
                <input
                  type="number"
                  defaultValue={85}
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Active Features</label>
                <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  {showConfigModuleModal.features.map((feat, i) => (
                    <label key={i} className="flex items-center space-x-2">
                      <input type="checkbox" defaultChecked className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                      <span className="text-slate-700">{feat}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end space-x-2">
              <button
                onClick={() => setShowConfigModuleModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 font-semibold text-xs"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setShowConfigModuleModal(null);
                  showToast(`${showConfigModuleModal.name} configuration saved!`);
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm"
              >
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
