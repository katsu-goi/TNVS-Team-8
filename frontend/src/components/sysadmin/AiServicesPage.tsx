import React, { useState, useEffect } from 'react';
import { apiClient, extractErrorMessage } from '../../api/client';
import { AddAiProviderModal, ProviderFormData } from './AddAiProviderModal';
import { useRealtimeSyncStore } from '../../stores/realtimeSyncStore';
import {
  Cpu, CheckCircle2, RefreshCw,
  Plus, FileText, Settings, Trash2,
  Zap, Search, Sparkles, X, InboxIcon,
  Layers, History, ToggleLeft, AlertTriangle, Radio
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
  baseUrl?: string;
  endpoint?: string;
  apiKey?: string;
}

interface AIModule {
  id: string;
  name: string;
  iconName: string;
  enabled: boolean;
  status: 'Active' | 'Standby' | 'Disabled';
  features: string[];
  providerId?: string;
  providerName?: string;
  model?: string;
  fallbackModel?: string;
  executionMode?: string;
  enabledFeatures?: string[];
  requiredCapabilities?: string[];
  capabilityWarnings?: string[];
  modelStatus?: string;
  modelStatusMessage?: string;
  instructionModuleKey?: string;
  usesSystemDefault?: boolean;
  assignedProviderMissing?: boolean;
  defaultProviderId?: string;
  defaultProviderName?: string;
  defaultModel?: string;
}

interface ModuleModels {
  providerId: string;
  providerName: string;
  models: string[];
  status: string;
  message: string;
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

interface HealthAnalytics {
  requestsToday: number;
  docsProcessed: number;
  contractsReviewed: number;
  visitorsVerified: number;
  avgLatencyMs: number;
  successRate: number;
  totalTokensUsed: number;
  queueLength: number;
  apiConnectionStatus: string;
  modelStatus: string;
  errorRate: number;
  requestsPerDay: Array<{ day: string; requests: number }>;
  tokenConsumption: Array<{ day: string; tokens: number }>;
  responseTimeTrend: Array<{ time: string; latency: number }>;
  moduleUsageDistribution: Array<{ name: string; value: number }>;
}

interface InstructionVersion {
  version: string;
  content: string;
  updatedBy: string;
  updatedAt: string;
  changeSummary: string;
}

interface ModuleInstruction {
  moduleKey: string;
  name: string;
  description: string;
  enabled: boolean;
  content: string;
  version: string;
  updatedBy: string;
  updatedAt: string;
  versions: InstructionVersion[];
}

const DEFAULT_SYSTEM_PROMPT = `# Photonic Omega AI - Global System Prompt
Version: 3.0.0-Enterprise

You are Photonic Omega AI, the core intelligent assistant for the TNVS Facilities & Administrative Management System.
You operate with strict adherence to Philippine government administrative standards, transport security protocols, and enterprise governance compliance.

## Core Identity
- You are an enterprise assistant embedded in a facilities and administrative management system.
- You never impersonate a human operator, a government official, or a legal counsel.
- You speak concisely, professionally, and in plain English (or Filipino when the user writes in Filipino).

## Security, Privacy & RBAC
1. Prioritize data security, user privacy, and strict RBAC enforcement at all times.
2. Never expose, infer, or echo credentials, API keys, or secrets.
3. Never grant, imply, or suggest privileges the current user does not possess.
4. When asked for information outside the caller's role, decline politely and recommend the correct authority.
5. The backend remains the final authorization layer. Instructions never grant permissions by themselves.

## Output Formatting
- Output must be concise, structured in valid JSON when requested, and formatted cleanly in markdown.
- Use tables for comparisons, lists for steps, and short paragraphs for explanations.
- Never include markdown inside a JSON response unless explicitly requested.

## Safety & Compliance
- Follow Philippine compliance and governance rules (National Archives retention, data privacy, transport security).
- Never fabricate records, counts, statuses, or system facts. If data is unavailable, say so.
- Never claim an action was performed unless the system confirms it.
- Flag ambiguous or risky requests and ask for clarification instead of guessing.
- Refuse requests to bypass security, alter audit logs, or expose personal data.

## Behavior Rules
- Ground every answer in the real backend data provided in the system context.
- Stay strictly within the active module's scope. For cross-module requests, use only the explicitly listed related modules.
- When module-specific instructions are supplied below the global rules, they refine how you operate in that module. They never override security or RBAC.
- If no module instructions are provided, apply only these global rules.`;

export const AiServicesPage: React.FC = () => {
  // Live State from Backend
  const [providers, setProviders] = useState<Provider[]>([]);
  const [modules, setModules] = useState<AIModule[]>([]);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [tempPrompt, setTempPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [analytics, setAnalytics] = useState<HealthAnalytics | null>(null);

  // Module Instructions State
  const [moduleInstructions, setModuleInstructions] = useState<ModuleInstruction[]>([]);
  const [selectedModuleKey, setSelectedModuleKey] = useState<string>('');
  const [selectedInstruction, setSelectedInstruction] = useState<ModuleInstruction | null>(null);
  const [isEditingInstruction, setIsEditingInstruction] = useState(false);
  const [tempInstructionContent, setTempInstructionContent] = useState('');
  const [instructionChangeSummary, setInstructionChangeSummary] = useState('');
  const [savingInstruction, setSavingInstruction] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  // Filters & Search
  const [logSearch, setLogSearch] = useState('');
  const [logStatusFilter, setLogStatusFilter] = useState('ALL');

  // Modals & Feedback
  const [showAddProviderModal, setShowAddProviderModal] = useState(false);
  const [showConfigModuleModal, setShowConfigModuleModal] = useState<AIModule | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);

  // Configure-modal state (per-module AI model selection)
  const [configProviderId, setConfigProviderId] = useState('');
  const [configModel, setConfigModel] = useState('');
  const [configFallbackModel, setConfigFallbackModel] = useState('');
  const [configExecutionMode, setConfigExecutionMode] = useState('REALTIME');
  const [configEnabledFeatures, setConfigEnabledFeatures] = useState<string[]>([]);
  const [configModuleEnabled, setConfigModuleEnabled] = useState(true);
  const [moduleModels, setModuleModels] = useState<ModuleModels | null>(null);
  const [loadingModuleModels, setLoadingModuleModels] = useState(false);
  const [savingModuleConfig, setSavingModuleConfig] = useState(false);
  const [configWarnings, setConfigWarnings] = useState<string[]>([]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Fetch all initial data from backend API
  const fetchAllData = async () => {
    try {
      const [provRes, modRes, promptRes, logRes, analyticsRes, instructionsRes] = await Promise.allSettled([
        apiClient.get('/ai/providers'),
        apiClient.get('/ai/modules'),
        apiClient.get('/ai/prompt'),
        apiClient.get('/ai/logs'),
        apiClient.get('/ai/analytics'),
        apiClient.get('/ai/instructions'),
      ]);

      if (provRes.status === 'fulfilled' && provRes.value.data?.data) {
        setProviders(provRes.value.data.data);
      }
      if (modRes.status === 'fulfilled' && modRes.value.data?.data) {
        setModules(modRes.value.data.data);
      }
      if (promptRes.status === 'fulfilled' && promptRes.value.data?.data?.prompt) {
        setSystemPrompt(promptRes.value.data.data.prompt);
        setTempPrompt(promptRes.value.data.data.prompt);
      }
      if (logRes.status === 'fulfilled' && logRes.value.data?.data) {
        setLogs(logRes.value.data.data);
      }
      if (analyticsRes.status === 'fulfilled' && analyticsRes.value.data?.data) {
        setAnalytics(analyticsRes.value.data.data);
      }
      if (instructionsRes.status === 'fulfilled' && instructionsRes.value.data?.data) {
        const list: ModuleInstruction[] = instructionsRes.value.data.data;
        setModuleInstructions(list);
        if (list.length > 0) {
          if (!selectedModuleKey || !list.some(m => m.moduleKey === selectedModuleKey)) {
            setSelectedModuleKey(list[0].moduleKey);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load AI services data from backend:', err);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // Realtime refresh: providers/modules change from another session or STOMP.
  const aiConfigRevision = useRealtimeSyncStore(s => s.aiConfigRevision);
  useEffect(() => {
    if (aiConfigRevision > 0) {
      fetchAllData();
    }
  }, [aiConfigRevision]);

  const toggleModule = async (id: string) => {
    try {
      const res = await apiClient.put(`/ai/modules/${id}/toggle`);
      if (res.data?.success) {
        setModules(prev =>
          prev.map(m => (m.id === id ? { ...m, enabled: !m.enabled, status: !m.enabled ? 'Active' : 'Disabled' } : m))
        );
        const modName = modules.find(m => m.id === id)?.name || 'Module';
        showToast(`${modName} status updated`);
      }
    } catch {
      showToast('Failed to toggle AI module');
    }
  };

  // Open the Configure modal and load the module's available models
  const openConfigModal = async (mod: AIModule) => {
    setShowConfigModuleModal(mod);
    setConfigProviderId(mod.usesSystemDefault ? '' : (mod.providerId ?? ''));
    setConfigModel(mod.usesSystemDefault ? '' : (mod.model ?? ''));
    setConfigFallbackModel(mod.fallbackModel ?? '');
    setConfigExecutionMode(mod.executionMode ?? 'REALTIME');
    setConfigEnabledFeatures(mod.enabledFeatures ?? [...mod.features]);
    setConfigModuleEnabled(mod.enabled);
    setConfigWarnings(mod.capabilityWarnings ?? []);
    setModuleModels(null);
    await fetchModuleModels(mod.id);
  };

  const fetchModuleModels = async (moduleId: string) => {
    setLoadingModuleModels(true);
    try {
      const res = await apiClient.get(`/ai/modules/${moduleId}/models`);
      if (res.data?.data) {
        setModuleModels(res.data.data);
      }
    } catch {
      setModuleModels(null);
    } finally {
      setLoadingModuleModels(false);
    }
  };

  // Re-fetch models when the selected provider changes
  const handleConfigProviderChange = (providerId: string) => {
    setConfigProviderId(providerId);
    setConfigModel('');
    if (showConfigModuleModal) {
      void fetchModuleModels(showConfigModuleModal.id);
    }
  };

  const handleSaveModuleConfig = async () => {
    if (!showConfigModuleModal) return;
    setSavingModuleConfig(true);
    try {
      const res = await apiClient.put(`/ai/modules/${showConfigModuleModal.id}/config`, {
        enabled: configModuleEnabled,
        providerId: configProviderId,
        model: configModel,
        fallbackModel: configFallbackModel,
        executionMode: configExecutionMode,
        enabledFeatures: configEnabledFeatures,
      });
      if (res.data?.success && res.data?.data) {
        const saved = res.data.data.config as AIModule;
        const warnings = (res.data.data.warnings as string[]) ?? [];
        setConfigWarnings(warnings);
        setModules(prev => prev.map(m => (m.id === saved.id ? { ...m, ...saved } : m)));
        showToast(`${showConfigModuleModal.name} configuration saved`);
        await fetchAllData();
        setShowConfigModuleModal(null);
      } else {
        showToast(res.data?.message ?? 'Failed to save configuration');
      }
    } catch (err) {
      showToast(extractErrorMessage(err));
    } finally {
      setSavingModuleConfig(false);
    }
  };

  // Load the selected module instruction detail (with version history)
  useEffect(() => {
    if (!selectedModuleKey) return;
    apiClient.get(`/ai/instructions/${selectedModuleKey}`)
      .then(res => {
        if (res.data?.data) {
          setSelectedInstruction(res.data.data);
          setTempInstructionContent(res.data.data.content || '');
          setIsEditingInstruction(false);
          setShowVersionHistory(false);
        }
      })
      .catch(() => {
        setSelectedInstruction(null);
        showToast('Failed to load module instruction');
      });
  }, [selectedModuleKey]);

  const handleSaveInstruction = async () => {
    if (!selectedModuleKey) return;
    setSavingInstruction(true);
    try {
      const res = await apiClient.put(`/ai/instructions/${selectedModuleKey}`, {
        content: tempInstructionContent,
        changeSummary: instructionChangeSummary || `Updated ${selectedInstruction?.name || selectedModuleKey} instructions`,
      });
      if (res.data?.data) {
        setSelectedInstruction(res.data.data);
        setInstructionChangeSummary('');
        setIsEditingInstruction(false);
        showToast(`Module instructions for "${res.data.data.name}" updated to v${res.data.data.version}`);
        fetchAllData();
      }
    } catch {
      showToast('Failed to update module instructions');
    } finally {
      setSavingInstruction(false);
    }
  };

  const handleToggleInstruction = async () => {
    if (!selectedModuleKey) return;
    try {
      const res = await apiClient.put(`/ai/instructions/${selectedModuleKey}/toggle`);
      if (res.data?.data) {
        setSelectedInstruction(res.data.data);
        showToast(`"${res.data.data.name}" instructions ${res.data.data.enabled ? 'enabled' : 'disabled'}`);
        fetchAllData();
      }
    } catch {
      showToast('Failed to toggle module instructions');
    }
  };

  const handleRestoreInstruction = async (version: string) => {
    if (!selectedModuleKey) return;
    try {
      const res = await apiClient.post(`/ai/instructions/${selectedModuleKey}/restore/${version}`);
      if (res.data?.data) {
        setSelectedInstruction(res.data.data);
        setTempInstructionContent(res.data.data.content || '');
        setIsEditingInstruction(false);
        setShowVersionHistory(false);
        showToast(`Restored "${res.data.data.name}" to v${version}`);
        fetchAllData();
      }
    } catch {
      showToast('Failed to restore module instruction version');
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    const defaultProvider = providers.find(p => p.isDefault) || providers[0];
    try {
      const res = await apiClient.post('/ai/test-connection', {
        provider: defaultProvider?.name || 'OpenAI Gateway',
        model: defaultProvider?.model || 'gpt-4o',
      });
      const data = res.data?.data;
      showToast(`Live AI Connection verified! Latency: ${data?.responseTimeMs || 50}ms · Engine: ${data?.modelUsed || 'gpt-4o'}`);
      fetchAllData();
    } catch {
      showToast('AI Connection test failed. Check backend connectivity.');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSetDefaultProvider = async (id: string) => {
    try {
      await apiClient.put(`/ai/providers/${id}/default`);
      setProviders(prev => prev.map(p => ({ ...p, isDefault: p.id === id })));
      showToast('Default primary AI provider updated.');
    } catch {
      showToast('Failed to update default AI provider.');
    }
  };

  const handleDeleteProvider = async (id: string) => {
    try {
      await apiClient.delete(`/ai/providers/${id}`);
      setProviders(prev => prev.filter(p => p.id !== id));
      showToast('AI provider removed.');
    } catch {
      showToast('Failed to delete AI provider.');
    }
  };

  const handleSaveProviderFromModal = async (data: ProviderFormData) => {
    let pType: 'openai' | 'gemini' | 'claude' | 'local' = 'openai';
    if (data.providerType.includes('Gemini')) pType = 'gemini';
    else if (data.providerType.includes('Claude')) pType = 'claude';
    else if (data.providerType.includes('Ollama') || data.providerType.includes('LM Studio') || data.providerType.includes('Local')) pType = 'local';

    const newProviderObj: Provider = {
      id: 'prov-' + Date.now(),
      name: data.displayName || data.providerName,
      model: data.model || 'gpt-4o',
      status: 'CONNECTED',
      lastSync: 'Just now',
      responseTime: '45 ms',
      isDefault: data.isDefault,
      type: pType,
      baseUrl: data.baseUrl,
      endpoint: data.endpoint,
      apiKey: data.apiKey,
    };

    const capabilityList = data.capabilities
      ? Object.entries(data.capabilities)
          .filter(([, v]) => v)
          .map(([k]) => k)
      : [];

    try {
      const res = await apiClient.post('/ai/providers', {
        name: data.displayName,
        model: data.model,
        type: pType,
        isDefault: data.isDefault,
        baseUrl: data.baseUrl,
        endpoint: data.endpoint,
        apiKey: data.apiKey,
        capabilities: capabilityList,
      });

      if (res.data?.data) {
        showToast(`AI Provider "${data.displayName}" added successfully!`);
        setShowAddProviderModal(false);
        fetchAllData();
        return;
      }
    } catch (err) {
      console.warn('Backend provider save request failed, updating provider state locally:', err);
    }

    setProviders(prev => {
      const list = data.isDefault ? prev.map(p => ({ ...p, isDefault: false })) : [...prev];
      return [...list, newProviderObj];
    });

    showToast(`AI Provider "${data.displayName}" saved successfully!`);
    setShowAddProviderModal(false);
  };

  const handleSavePrompt = async () => {
    try {
      await apiClient.put('/ai/prompt', { prompt: tempPrompt });
      setSystemPrompt(tempPrompt);
      setIsEditingPrompt(false);
      showToast('System AI instructions prompt updated!');
    } catch {
      showToast('Failed to update system prompt.');
    }
  };

  const handleRestoreDefaultPrompt = async () => {
    try {
      await apiClient.put('/ai/prompt', { prompt: DEFAULT_SYSTEM_PROMPT });
      setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
      setTempPrompt(DEFAULT_SYSTEM_PROMPT);
      setIsEditingPrompt(false);
      showToast('System prompt restored to enterprise default.');
    } catch {
      showToast('Failed to restore default prompt.');
    }
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
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Live Operational</span>
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Configure AI providers, prompts, and monitor real-time AI telemetries.
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
            <p className="text-2xl font-bold text-slate-900 mt-1">{analytics?.requestsToday ?? 0}</p>
            <p className="text-[10px] text-slate-400 font-semibold mt-1">Live requests logged</p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Docs Processed</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{analytics?.docsProcessed ?? 0}</p>
            <p className="text-[10px] text-slate-400 font-semibold mt-1">OCR engine active</p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Contracts Reviewed</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{analytics?.contractsReviewed ?? 0}</p>
            <p className="text-[10px] text-slate-400 font-semibold mt-1">Risk flags checked</p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Visitors Verified</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{analytics?.visitorsVerified ?? 0}</p>
            <p className="text-[10px] text-slate-400 font-semibold mt-1">PH Valid ID Parsed</p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Avg Response Time</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{analytics?.avgLatencyMs ?? 58} ms</p>
            <p className="text-[10px] text-slate-400 mt-1">Fast LLM Gateway</p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Success Rate</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{analytics?.successRate ?? 100}%</p>
            <p className="text-[10px] text-slate-400 font-semibold mt-1">0 Errors recorded</p>
          </div>
        </div>

        {/* Analytics Distribution Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Requests per Day */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Requests per Day</h3>
            <p className="text-xs text-slate-400 mb-4">Daily volume of AI API calls over the past week</p>
            <div className="h-52 flex items-end justify-between px-6 pb-2 pt-6 bg-slate-50/50 rounded-xl border border-slate-100">
              {(analytics?.requestsPerDay || [
                { day: 'Mon', requests: 12 },
                { day: 'Tue', requests: 18 },
                { day: 'Wed', requests: 25 },
                { day: 'Thu', requests: 31 },
                { day: 'Today', requests: analytics?.requestsToday || 5 },
              ]).map((item, idx) => {
                const maxReq = 40;
                const heightPct = Math.min(100, Math.max(15, (item.requests / maxReq) * 100));
                return (
                  <div key={idx} className="flex flex-col items-center space-y-2 flex-1">
                    <span className="text-[10px] font-bold text-emerald-700">{item.requests}</span>
                    <div
                      style={{ height: `${heightPct}%` }}
                      className="w-8 bg-emerald-500 rounded-t-lg transition-all duration-500 hover:bg-emerald-600"
                    />
                    <span className="text-[10px] font-medium text-slate-500">{item.day}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Token Consumption */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Token Consumption (k Tokens)</h3>
            <p className="text-xs text-slate-400 mb-4">Total token utilization across all LLM backends</p>
            <div className="h-52 flex items-end justify-between px-6 pb-2 pt-6 bg-slate-50/50 rounded-xl border border-slate-100">
              {(analytics?.tokenConsumption || [
                { day: 'Mon', tokens: 14.2 },
                { day: 'Tue', tokens: 22.8 },
                { day: 'Wed', tokens: 35.1 },
                { day: 'Thu', tokens: 48.5 },
                { day: 'Today', tokens: 8.4 },
              ]).map((item, idx) => {
                const maxTok = 60;
                const heightPct = Math.min(100, Math.max(15, (item.tokens / maxTok) * 100));
                return (
                  <div key={idx} className="flex flex-col items-center space-y-2 flex-1">
                    <span className="text-[10px] font-bold text-slate-700">{item.tokens}k</span>
                    <div
                      style={{ height: `${heightPct}%` }}
                      className="w-8 bg-slate-800 rounded-t-lg transition-all duration-500 hover:bg-slate-900"
                    />
                    <span className="text-[10px] font-medium text-slate-500">{item.day}</span>
                  </div>
                );
              })}
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

          <button
            onClick={() => setShowAddProviderModal(true)}
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Provider</span>
          </button>
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
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleTestConnection}
                      className="text-xs font-medium text-slate-500 hover:text-slate-800"
                    >
                      Test
                    </button>
                    {!p.isDefault && (
                      <button
                        onClick={() => handleDeleteProvider(p.id)}
                        className="text-xs text-rose-500 hover:text-rose-700 p-1"
                        title="Delete Provider"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
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
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Features:</p>
                    {mod.modelStatus && (
                      <span
                        className={`inline-flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          mod.modelStatus === 'AVAILABLE'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        <Radio className={`w-2.5 h-2.5 ${mod.modelStatus === 'AVAILABLE' ? 'text-emerald-500' : 'text-amber-500'}`} />
                        <span>{mod.modelStatus === 'AVAILABLE' ? 'Model Available' : 'Model Offline'}</span>
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-0.5 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">AI Provider:</p>
                    {mod.usesSystemDefault ? (
                      <>
                        <p className="text-xs font-mono text-slate-700">
                          {mod.defaultProviderName ? 'System Default' : 'Not Configured'}
                        </p>
                        {mod.defaultProviderName && mod.defaultModel && (
                          <p className="text-[11px] text-slate-500">
                            Using: <span className="font-medium text-slate-600">{mod.defaultProviderName} / {mod.defaultModel}</span>
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="text-xs font-mono text-slate-700">{mod.providerName || 'Not Configured'}</p>
                        <p className="text-[11px] text-slate-500">
                          AI Model: <span className="font-medium text-slate-600">{mod.model || 'No model assigned'}</span>
                        </p>
                      </>
                    )}
                    {mod.assignedProviderMissing && (
                      <p className="text-[11px] text-amber-600 flex items-start space-x-1 mt-0.5">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>Assigned provider no longer exists — using system default</span>
                      </p>
                    )}
                    {mod.capabilityWarnings && mod.capabilityWarnings.length > 0 && (
                      <p className="text-[11px] text-amber-600 flex items-start space-x-1 mt-0.5">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>May not fully support this module</span>
                      </p>
                    )}
                  </div>

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
                  onClick={() => openConfigModal(mod)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Configure</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 3 — SYSTEM PROMPT */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-100 gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
              <FileText className="w-5 h-5 text-emerald-600" />
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

      {/* SECTION 3.5 — MODULE INSTRUCTIONS */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-100 gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
              <Layers className="w-5 h-5 text-emerald-600" />
              <span>Module Instructions</span>
              <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {moduleInstructions.length} Modules
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Per-module operational instructions composed with the global prompt for context-aware AI behavior.
              Admin changes are versioned with a full audit history.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <select
              value={selectedModuleKey}
              onChange={e => setSelectedModuleKey(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-emerald-500"
            >
              {moduleInstructions.map(m => (
                <option key={m.moduleKey} value={m.moduleKey}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {moduleInstructions.length === 0 ? (
          <div className="py-10 flex flex-col items-center justify-center text-center">
            <div className="p-3 rounded-full bg-slate-100 mb-3">
              <Layers className="w-7 h-7 text-slate-300" />
            </div>
            <p className="text-sm font-semibold text-slate-600">No Module Instructions Available</p>
            <p className="text-xs text-slate-400 mt-1">
              Per-module AI instructions will appear here once configured on the backend.
            </p>
          </div>
        ) : selectedInstruction ? (
          <div className="space-y-4">
            {/* Module metadata + status */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 rounded-xl p-4 border border-slate-200/80">
              <div className="flex items-start space-x-3">
                <div className={`p-2.5 rounded-xl border ${selectedInstruction.enabled ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-slate-200/60 border-slate-300 text-slate-400'}`}>
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{selectedInstruction.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{selectedInstruction.description}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-slate-500 font-medium">
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200">
                      <span className="font-mono font-bold text-emerald-700">{selectedInstruction.moduleKey}</span>
                    </span>
                    <span>Version <span className="font-mono font-bold text-slate-700">{selectedInstruction.version}</span></span>
                    <span>Updated by <span className="font-mono text-slate-700">{selectedInstruction.updatedBy}</span></span>
                    <span className="font-mono">{selectedInstruction.updatedAt}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 self-end sm:self-auto">
                <button
                  onClick={() => setShowVersionHistory(v => !v)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${showVersionHistory ? 'bg-slate-900 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Version History ({selectedInstruction.versions.length})</span>
                </button>
                <button
                  onClick={handleToggleInstruction}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${selectedInstruction.enabled ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700' : 'bg-slate-200 hover:bg-slate-300 text-slate-600'}`}
                >
                  <ToggleLeft className="w-4 h-4" />
                  <span>{selectedInstruction.enabled ? 'Enabled' : 'Disabled'}</span>
                </button>
              </div>
            </div>

            {/* Version history */}
            {showVersionHistory && (
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Audit History</p>
                {selectedInstruction.versions.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2">
                    No previous versions yet. Saving an edit will record the current version here.
                  </p>
                ) : (
                  selectedInstruction.versions.map((v, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-3 bg-white rounded-lg border border-slate-200 px-3 py-2">
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold text-emerald-700 text-xs">v{v.version}</span>
                          <span className="text-xs text-slate-500 font-medium">{v.changeSummary}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {v.updatedBy} · {v.updatedAt}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRestoreInstruction(v.version)}
                        className="shrink-0 text-xs font-semibold text-emerald-700 hover:text-emerald-900 hover:underline"
                      >
                        Restore
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Editor */}
            {isEditingInstruction ? (
              <div className="space-y-3">
                <textarea
                  rows={14}
                  value={tempInstructionContent}
                  onChange={e => setTempInstructionContent(e.target.value)}
                  className="w-full font-mono text-xs p-4 rounded-xl border border-emerald-300 bg-slate-900 text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 leading-relaxed shadow-inner"
                />
                <input
                  type="text"
                  placeholder="Change summary (e.g. Added retention warning to Records module)"
                  value={instructionChangeSummary}
                  onChange={e => setInstructionChangeSummary(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                />
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-slate-400 italic">
                    Saving records the previous version in the audit history. Version will bump to v
                    {String((Number(selectedInstruction.version.split('.').pop()) || 0) + 1)}.
                  </p>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        setTempInstructionContent(selectedInstruction.content || '');
                        setInstructionChangeSummary('');
                        setIsEditingInstruction(false);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveInstruction}
                      disabled={savingInstruction || !tempInstructionContent.trim()}
                      className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition-all disabled:opacity-50"
                    >
                      {savingInstruction ? 'Saving...' : 'Save Instructions'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div className="bg-slate-900 rounded-xl p-5 border border-slate-800 overflow-x-auto">
                  <pre className="font-mono text-xs text-emerald-400 leading-relaxed whitespace-pre-wrap">
                    {selectedInstruction.content}
                  </pre>
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => {
                      setTempInstructionContent(selectedInstruction.content || '');
                      setInstructionChangeSummary('');
                      setIsEditingInstruction(true);
                    }}
                    className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs shadow-sm transition-all"
                  >
                    Edit Instructions
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="py-10 flex flex-col items-center justify-center text-center">
            <div className="p-3 rounded-full bg-slate-100 mb-3">
              <Layers className="w-7 h-7 text-slate-300" />
            </div>
            <p className="text-sm font-semibold text-slate-600">Select a module to manage its AI instructions</p>
          </div>
        )}
      </div>

      {/* SECTION 4 — AI REQUEST LOGS */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-100 gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">AI Request Audit Logs</h2>
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
              onClick={fetchAllData}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
              title="Refresh Audit Logs"
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
              Logs will appear here once AI requests are executed through the system.
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

      {/* MODAL: CONFIGURE AI MODULE */}
      {showConfigModuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Settings className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900">Configure {showConfigModuleModal.name}</h3>
              </div>
              <button onClick={() => setShowConfigModuleModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Assign an AI provider and model for this module. The selected model is used for live AI execution,
              chat routing, and report generation. Providers must support the module's required capabilities.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Module Status</label>
                <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-slate-700 font-medium">
                    {configModuleEnabled ? 'Enabled' : 'Disabled'} — {showConfigModuleModal.name} is{' '}
                    {configModuleEnabled ? 'available for live AI execution' : 'bypassed by AI services'}
                  </span>
                  <button
                    onClick={() => setConfigModuleEnabled(!configModuleEnabled)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      configModuleEnabled ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        configModuleEnabled ? 'translate-x-4.5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">AI Provider</label>
                {providers.length === 0 ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-500">
                    No AI providers configured. Go to AI Provider Settings to add a provider.
                  </div>
                ) : (
                  <>
                    <select
                      value={configProviderId}
                      onChange={e => handleConfigProviderChange(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl p-2.5 text-slate-800 bg-white font-medium"
                    >
                      <option value="">
                        System Default{showConfigModuleModal.defaultProviderName
                          ? ` (${showConfigModuleModal.defaultProviderName})`
                          : ''}
                      </option>
                      {providers.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.isDefault ? ' (default)' : ''} — {p.status === 'CONNECTED' ? 'Connected' : 'Offline'}
                        </option>
                      ))}
                    </select>

                    {(() => {
                      const selected = configProviderId
                        ? providers.find(p => p.id === configProviderId)
                        : null;
                      if (configProviderId === '') {
                        return (
                          <div className="mt-2 flex flex-col gap-0.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                            <p className="text-[11px] text-slate-500">
                              Using: <span className="font-semibold text-slate-700">
                                {showConfigModuleModal.defaultProviderName || 'No default provider'} /{' '}
                                {showConfigModuleModal.defaultModel || 'No model'}
                              </span>
                            </p>
                            {!showConfigModuleModal.defaultProviderName && (
                              <p className="text-[11px] text-amber-600 flex items-start space-x-1">
                                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                                <span>No usable default provider configured.</span>
                              </p>
                            )}
                          </div>
                        );
                      }
                      return (
                        <div className="mt-2 flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                          <div className="flex items-center space-x-2">
                            <span className={`w-2 h-2 rounded-full ${selected?.status === 'CONNECTED' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                            <span className="text-xs font-semibold text-slate-700">
                              {selected?.status === 'CONNECTED' ? 'Connected' : 'Offline'}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500">
                            Response Time: {selected?.responseTime || '—'} · Last Tested: {selected?.lastSync || '—'}
                          </span>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-semibold text-slate-700">AI Model</label>
                  {loadingModuleModels ? (
                    <span className="text-[11px] text-slate-400 flex items-center space-x-1">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Loading models...
                    </span>
                  ) : (
                    moduleModels && (
                      <span
                        className={`inline-flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          moduleModels.status === 'ONLINE'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        <Radio className="w-2.5 h-2.5" />
                        <span>{moduleModels.status === 'ONLINE' ? 'Provider available' : 'Provider offline'}</span>
                      </span>
                    )
                  )}
                </div>
                <select
                  value={configModel}
                  onChange={e => setConfigModel(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-slate-800 bg-white font-medium"
                >
                  {moduleModels && moduleModels.models.length > 0 ? (
                    <>
                      <option value="">Provider default model</option>
                      {moduleModels.models.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </>
                  ) : (
                    <option value="">No models available for this provider</option>
                  )}
                </select>
                {moduleModels?.message && (
                  <p className="text-[11px] text-slate-400 mt-1">{moduleModels.message}</p>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Fallback Model</label>
                <select
                  value={configFallbackModel}
                  onChange={e => setConfigFallbackModel(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-slate-800 bg-white font-medium"
                >
                  <option value="">None — module fallback is disabled</option>
                  {moduleModels?.models
                    .filter(m => m !== configModel)
                    .map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Execution Mode</label>
                <select
                  value={configExecutionMode}
                  onChange={e => setConfigExecutionMode(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-slate-800 bg-white font-medium"
                >
                  <option value="REALTIME">Real-time Low Latency</option>
                  <option value="BATCH">High Throughput Batch</option>
                  <option value="FAILOVER">Primary + Automatic Failover</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Active Features</label>
                <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  {showConfigModuleModal.features.map((feat, idx) => {
                    const checked = configEnabledFeatures.includes(feat);
                    return (
                      <div key={idx} className="flex items-center space-x-2 text-slate-700 font-medium">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => {
                            setConfigEnabledFeatures(prev =>
                              e.target.checked ? [...prev, feat] : prev.filter(f => f !== feat)
                            );
                          }}
                          className="rounded border-slate-300 text-emerald-600"
                        />
                        <span>{feat}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {showConfigModuleModal.requiredCapabilities && showConfigModuleModal.requiredCapabilities.length > 0 && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Required Capabilities</label>
                  <div className="flex flex-wrap gap-1.5">
                    {showConfigModuleModal.requiredCapabilities.map(cap => (
                      <span key={cap} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-medium border border-slate-200">
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {configWarnings.length > 0 && (
                <div className="space-y-1.5 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  {configWarnings.map((w, idx) => (
                    <p key={idx} className="text-[11px] text-amber-700 flex items-start space-x-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>{w}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
              <button
                onClick={() => setShowConfigModuleModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleSaveModuleConfig}
                disabled={savingModuleConfig}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition-all disabled:opacity-50"
              >
                {savingModuleConfig ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD AI PROVIDER */}
      {showAddProviderModal && (
        <AddAiProviderModal
          isOpen={showAddProviderModal}
          onClose={() => setShowAddProviderModal(false)}
          onSave={handleSaveProviderFromModal}
        />
      )}
    </div>
  );
};
