import React, { useEffect, useState, useRef } from 'react';
import {
  HiSparkles,
  HiCheckCircle,
  HiRefresh,
  HiLightningBolt,
  HiShieldCheck,
  HiChat,
  HiClipboardList,
  HiDocumentReport,
  HiServer,
  HiPaperAirplane,
  HiChevronDown,
  HiChevronUp,
} from 'react-icons/hi';
import { aiManagerAPI } from '../../services/api';
import toast from 'react-hot-toast';

const QUICK_PROMPTS = [
  "Which artisans are waiting for verification?",
  "Verify all genuine pending artisans.",
  "Find low-stock and out-of-stock products.",
  "Show today's orders and payment statuses.",
  "Generate today's complete business report.",
  "Check failed or pending payments.",
  "Moderate pending customer reviews.",
  "Show active autonomous operational rules."
];

export default function AIManagement() {
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'rules' | 'actions' | 'queue' | 'reports'
  const [statusInfo, setStatusInfo] = useState(null);
  const [rules, setRules] = useState([]);
  const [actions, setActions] = useState([]);
  const [queueData, setQueueData] = useState({ counts: {}, jobs: [] });
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  // Chat State
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hello Administrator! I am KalaStyle AI’s Autonomous Business Operations Manager powered by OpenAI. I analyze platform business events, verify artisans, monitor inventory, route multi-artisan orders, and enforce operational governance through secure backend tools. How can I assist you today?',
      toolCalls: []
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const chatBottomRef = useRef(null);

  // Expandable row state for actions
  const [expandedActionId, setExpandedActionId] = useState(null);

  const fetchStatusAndData = async () => {
    try {
      const [stRes, rulesRes, actsRes, qRes, repRes] = await Promise.allSettled([
        aiManagerAPI.getStatus(),
        aiManagerAPI.getRules(),
        aiManagerAPI.getActions({ limit: 30 }),
        aiManagerAPI.getQueue(),
        aiManagerAPI.getReports(),
      ]);

      if (stRes.status === 'fulfilled') setStatusInfo(stRes.value.data);
      if (rulesRes.status === 'fulfilled') setRules(rulesRes.value.data || []);
      if (actsRes.status === 'fulfilled') setActions(actsRes.value.data || []);
      if (qRes.status === 'fulfilled') setQueueData(qRes.value.data || { counts: {}, jobs: [] });
      if (repRes.status === 'fulfilled') setReports(repRes.value.data || []);
    } catch (err) {
      console.error('Error fetching AI management data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatusAndData();
    const interval = setInterval(fetchStatusAndData, 20000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab === 'chat') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  const handleSendMessage = async (textToSend) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isSending) return;

    setInputMessage('');
    const userMsg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setIsSending(true);

    try {
      const historyPayload = messages.slice(-8).map(m => ({
        role: m.role,
        content: m.content
      }));

      const res = await aiManagerAPI.chat({
        message: text,
        history: historyPayload
      });

      const aiReply = {
        role: 'assistant',
        content: res.data?.message || 'Action processed.',
        toolCalls: res.data?.toolCallsExecuted || [],
        actionsCount: res.data?.actionsCount || 0
      };

      setMessages(prev => [...prev, aiReply]);
      // Refresh actions and queue in background
      aiManagerAPI.getActions({ limit: 30 }).then(r => setActions(r.data || []));
      aiManagerAPI.getQueue().then(r => setQueueData(r.data || { counts: {}, jobs: [] }));
    } catch (error) {
      const errText = error.response?.data?.error || error.message || 'Failed to communicate with AI Manager';
      toast.error(errText);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ Error executing directive: ${errText}. Backend safeguards prevented any unauthorized mutations.`,
          toolCalls: []
        }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleToggleRule = async (ruleId, currentVal) => {
    try {
      const newVal = !currentVal;
      await aiManagerAPI.updateRule(ruleId, { is_enabled: newVal });
      setRules(prev => prev.map(r => r.id === ruleId ? { ...r, is_enabled: newVal } : r));
      toast.success(`Rule "${ruleId}" ${newVal ? 'enabled' : 'disabled'}`);
    } catch (err) {
      toast.error('Failed to update automation rule');
    }
  };

  const handleRetryJob = async (jobId) => {
    try {
      await aiManagerAPI.retryJob(jobId);
      toast.success('Job re-enqueued for autonomous execution');
      const q = await aiManagerAPI.getQueue();
      setQueueData(q.data);
    } catch (err) {
      toast.error('Failed to retry job');
    }
  };

  const handleRunDailyReport = async () => {
    const toastId = toast.loading('Generating autonomous business intelligence report...');
    try {
      await aiManagerAPI.runDailyReport();
      toast.success('Daily intelligence report generated successfully!', { id: toastId });
      const reps = await aiManagerAPI.getReports();
      setReports(reps.data || []);
      setActiveTab('reports');
    } catch (err) {
      toast.error('Failed to generate report', { id: toastId });
    }
  };

  const handleTriggerQueue = async () => {
    try {
      await aiManagerAPI.processEvents();
      toast.success('Job processor cycle triggered');
      const q = await aiManagerAPI.getQueue();
      setQueueData(q.data);
    } catch (err) {
      toast.error('Failed to trigger queue');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* ── Header & Status Bar ── */}
      <div className="bg-dark-800 border border-dark-600 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gold-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gold-500/10 border border-gold-500/30 rounded-xl">
                <HiSparkles className="w-8 h-8 text-gold-400 animate-pulse" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-serif font-bold text-white tracking-wide">
                  Autonomous AI Operations Manager
                </h1>
                <p className="text-gray-400 text-sm mt-1">
                  OpenAI Autonomous Platform Brain • Verifications, Order Routing, Stock Sentinel & Governance
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Autonomous Mode Badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>Autonomous Active</span>
            </div>

            {/* Model Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-700 border border-dark-600 text-gray-300 text-xs">
              <HiServer className="w-4 h-4 text-gold-400" />
              <span>Model: <strong className="text-white">{statusInfo?.model || 'gpt-4o-mini'}</strong></span>
            </div>

            {/* Queue Counter */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-700 border border-dark-600 text-gray-300 text-xs">
              <HiLightningBolt className="w-4 h-4 text-amber-400" />
              <span>Pending Jobs: <strong className="text-white">{queueData.counts?.pending || 0}</strong></span>
            </div>

            <button
              onClick={fetchStatusAndData}
              disabled={loading}
              className="p-2 bg-dark-700 hover:bg-dark-600 text-gray-300 rounded-lg border border-dark-600 transition-colors"
              title="Refresh AI Status"
            >
              <HiRefresh className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-dark-700 overflow-x-auto">
          {[
            { id: 'chat', label: 'AI Operations Console', icon: HiChat },
            { id: 'rules', label: 'Automation Rules', icon: HiShieldCheck },
            { id: 'actions', label: 'Audit Trail & Decisions', icon: HiClipboardList },
            { id: 'queue', label: `Job Queue (${queueData.counts?.pending || 0})`, icon: HiLightningBolt },
            { id: 'reports', label: 'Intelligence Reports', icon: HiDocumentReport },
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                  active
                    ? 'bg-gold-500 text-dark-900 font-semibold shadow-lg shadow-gold-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-dark-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── TAB 1: Interactive Chat with Operations Manager ── */}
      {activeTab === 'chat' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Chat Feed */}
          <div className="lg:col-span-2 bg-dark-800 border border-dark-600 rounded-2xl flex flex-col h-[650px] shadow-xl">
            <div className="p-4 border-b border-dark-700 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-200">
                <HiChat className="w-5 h-5 text-gold-400" />
                <span>Executive Operations Terminal</span>
              </div>
              <span className="text-xs text-gray-400">Strict Tool Execution Guard Active</span>
            </div>

            {/* Message History */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed shadow-md ${
                      m.role === 'user'
                        ? 'bg-gold-500 text-dark-900 font-medium ml-12 rounded-tr-none'
                        : 'bg-dark-700 text-gray-100 border border-dark-600 mr-12 rounded-tl-none'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5 opacity-80 text-xs">
                      {m.role === 'user' ? (
                        <span>Administrator</span>
                      ) : (
                        <span className="flex items-center gap-1 font-semibold text-gold-400">
                          <HiSparkles className="w-3.5 h-3.5" /> KalaStyle AI Manager
                        </span>
                      )}
                    </div>

                    <div className="whitespace-pre-wrap">{m.content}</div>

                    {/* Tool Execution Badges */}
                    {m.toolCalls && m.toolCalls.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-dark-600/60 space-y-2">
                        <div className="text-[11px] font-semibold tracking-wider uppercase text-gold-400/90 flex items-center gap-1">
                          <HiShieldCheck className="w-3.5 h-3.5" /> Secure Tools Executed ({m.toolCalls.length})
                        </div>
                        {m.toolCalls.map((tc, tcIdx) => (
                          <div
                            key={tcIdx}
                            className="bg-dark-900/70 border border-dark-600 rounded-lg p-2.5 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between font-mono text-gold-300">
                              <span>⚡ {tc.tool}</span>
                              <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
                                <HiCheckCircle className="w-3.5 h-3.5" /> Success
                              </span>
                            </div>
                            {tc.args && Object.keys(tc.args).length > 0 && (
                              <div className="text-gray-400 font-mono text-[11px] truncate">
                                Params: {JSON.stringify(tc.args)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>

            {/* Quick Directive Chips */}
            <div className="px-4 py-2 bg-dark-900/50 border-t border-dark-700 flex items-center gap-2 overflow-x-auto">
              <span className="text-[11px] text-gray-400 whitespace-nowrap font-medium">Quick Directives:</span>
              {QUICK_PROMPTS.slice(0, 4).map((qp, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(qp)}
                  disabled={isSending}
                  className="px-2.5 py-1 bg-dark-700 hover:bg-dark-600 text-gray-300 hover:text-white rounded-lg text-xs whitespace-nowrap border border-dark-600 transition-colors"
                >
                  {qp}
                </button>
              ))}
            </div>

            {/* Input Bar */}
            <div className="p-3 border-t border-dark-700 bg-dark-800">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Direct the AI Business Manager (e.g. 'Verify all genuine artisans' or 'Show low-stock items')..."
                  disabled={isSending}
                  className="flex-1 bg-dark-900 border border-dark-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gold-500 transition-colors"
                />
                <button
                  type="submit"
                  disabled={!inputMessage.trim() || isSending}
                  className="px-5 py-2.5 bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-dark-900 font-semibold rounded-xl flex items-center gap-2 text-sm transition-all shadow-md"
                >
                  {isSending ? (
                    <HiRefresh className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>Execute</span>
                      <HiPaperAirplane className="w-4 h-4 rotate-90" />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Side Panel: Quick Actions & Live Summary */}
          <div className="space-y-6">
            <div className="bg-dark-800 border border-dark-600 rounded-2xl p-5 shadow-xl space-y-4">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <HiLightningBolt className="w-5 h-5 text-gold-400" /> Operational Directives
              </h3>
              <p className="text-xs text-gray-400">
                The AI executes real database modifications and Twilio WhatsApp dispatches through authorized tools.
              </p>
              <div className="space-y-2">
                {QUICK_PROMPTS.map((qp, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(qp)}
                    disabled={isSending}
                    className="w-full text-left p-2.5 bg-dark-700/60 hover:bg-dark-700 text-gray-200 text-xs rounded-xl border border-dark-600 transition-all flex items-center justify-between group"
                  >
                    <span className="truncate mr-2">{qp}</span>
                    <HiPaperAirplane className="w-3.5 h-3.5 text-gold-400 opacity-0 group-hover:opacity-100 rotate-90 transition-opacity" />
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-dark-800 border border-dark-600 rounded-2xl p-5 shadow-xl space-y-3">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <HiDocumentReport className="w-5 h-5 text-gold-400" /> Daily Intelligence
              </h3>
              <p className="text-xs text-gray-400">
                Generate an end-of-day operational report summarizing revenue, orders, verified artisans, and stock restock needs.
              </p>
              <button
                onClick={handleRunDailyReport}
                className="w-full py-2.5 bg-dark-700 hover:bg-gold-500 hover:text-dark-900 border border-gold-500/30 text-gold-400 font-semibold rounded-xl text-xs transition-all flex items-center justify-center gap-2"
              >
                <HiDocumentReport className="w-4 h-4" />
                <span>Generate Business Report Now</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: Automation Rules & Feature Policies ── */}
      {activeTab === 'rules' && (
        <div className="space-y-6">
          <div className="bg-dark-800 border border-dark-600 rounded-2xl p-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <HiShieldCheck className="w-6 h-6 text-gold-400" /> Configurable Autonomous Policies
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  Control which platform events OpenAI processes autonomously without manual administrative intervention.
                </p>
              </div>
              <button
                onClick={fetchStatusAndData}
                className="px-3 py-1.5 bg-dark-700 hover:bg-dark-600 text-gray-200 text-xs rounded-lg border border-dark-600 flex items-center gap-1.5"
              >
                <HiRefresh className="w-4 h-4" /> Reload Policies
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="bg-dark-700/60 border border-dark-600 rounded-xl p-5 flex items-start justify-between gap-4 hover:border-dark-500 transition-colors"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-white">{rule.name || rule.id}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        rule.is_enabled
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                      }`}>
                        {rule.is_enabled ? 'AUTONOMOUS' : 'PAUSED'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      {rule.description || 'Autonomous policy enforcement.'}
                    </p>
                  </div>

                  <button
                    onClick={() => handleToggleRule(rule.id, rule.is_enabled)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      rule.is_enabled ? 'bg-gold-500' : 'bg-dark-900'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        rule.is_enabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: Immutable Audit Trail & AI Decisions ── */}
      {activeTab === 'actions' && (
        <div className="bg-dark-800 border border-dark-600 rounded-2xl shadow-xl overflow-hidden">
          <div className="p-6 border-b border-dark-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <HiClipboardList className="w-6 h-6 text-gold-400" /> Autonomous Decision Audit Trail
              </h2>
              <p className="text-xs text-gray-400 mt-1">
                Every tool invocation, decision, rationale, confidence score, and affected entity is immutably logged.
              </p>
            </div>
            <span className="text-xs text-gray-400">Total Logged Actions: {actions.length}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-dark-900/60 text-xs uppercase tracking-wider text-gray-400 border-b border-dark-700">
                <tr>
                  <th className="px-5 py-3.5">Timestamp</th>
                  <th className="px-5 py-3.5">Tool Executed</th>
                  <th className="px-5 py-3.5">Decision</th>
                  <th className="px-5 py-3.5">Target Entity</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700/60">
                {actions.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-10 text-gray-500">
                      No actions logged yet. Direct the AI Manager to begin operations.
                    </td>
                  </tr>
                ) : (
                  actions.map((act) => {
                    const isExpanded = expandedActionId === act.id;
                    return (
                      <React.Fragment key={act.id}>
                        <tr className="hover:bg-dark-700/40 transition-colors">
                          <td className="px-5 py-3 text-xs text-gray-400 whitespace-nowrap">
                            {new Date(act.created_at).toLocaleString('en-IN')}
                          </td>
                          <td className="px-5 py-3 font-mono text-xs font-semibold text-gold-300">
                            ⚡ {act.tool_name || act.action_name}
                          </td>
                          <td className="px-5 py-3 text-xs">
                            <span className="px-2 py-0.5 rounded bg-dark-700 border border-dark-600 text-white font-medium">
                              {act.decision || act.action_name}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-xs text-gray-300">
                            {act.entity_type ? `${act.entity_type}: ` : ''}
                            <span className="font-mono text-gray-400">{act.entity_id ? act.entity_id.substring(0, 8) : 'N/A'}</span>
                          </td>
                          <td className="px-5 py-3">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              act.status === 'success'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                            }`}>
                              {act.status}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <button
                              onClick={() => setExpandedActionId(isExpanded ? null : act.id)}
                              className="text-gold-400 hover:text-gold-300 text-xs flex items-center gap-1 font-medium"
                            >
                              <span>{isExpanded ? 'Hide' : 'Inspect'}</span>
                              {isExpanded ? <HiChevronUp /> : <HiChevronDown />}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-dark-900/80">
                            <td colSpan="6" className="px-6 py-4 text-xs space-y-2 border-b border-dark-700">
                              <div>
                                <strong className="text-gray-300">Operational Reason:</strong>{' '}
                                <span className="text-gray-400">{act.reason || 'None specified'}</span>
                              </div>
                              {act.input_summary && (
                                <div>
                                  <strong className="text-gray-300">Input Parameters:</strong>
                                  <pre className="mt-1 p-2 bg-dark-950 rounded text-gray-400 font-mono text-[11px] overflow-x-auto">
                                    {typeof act.input_summary === 'object' ? JSON.stringify(act.input_summary, null, 2) : act.input_summary}
                                  </pre>
                                </div>
                              )}
                              {act.result && (
                                <div>
                                  <strong className="text-gray-300">Execution Result:</strong>
                                  <pre className="mt-1 p-2 bg-dark-950 rounded text-emerald-400 font-mono text-[11px] overflow-x-auto">
                                    {JSON.stringify(act.result, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 4: Background Autonomous Job Queue ── */}
      {activeTab === 'queue' && (
        <div className="space-y-6">
          {/* Queue KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
              <div className="text-xs text-gray-400 font-medium">Pending Jobs</div>
              <div className="text-2xl font-bold text-amber-400 mt-1">{queueData.counts?.pending || 0}</div>
            </div>
            <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
              <div className="text-xs text-gray-400 font-medium">Processing</div>
              <div className="text-2xl font-bold text-blue-400 mt-1">{queueData.counts?.processing || 0}</div>
            </div>
            <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
              <div className="text-xs text-gray-400 font-medium">Completed</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">{queueData.counts?.completed || 0}</div>
            </div>
            <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
              <div className="text-xs text-gray-400 font-medium">Failed / Dead-Letter</div>
              <div className="text-2xl font-bold text-rose-400 mt-1">{queueData.counts?.failed || 0}</div>
            </div>
          </div>

          <div className="bg-dark-800 border border-dark-600 rounded-2xl shadow-xl overflow-hidden">
            <div className="p-6 border-b border-dark-700 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <HiLightningBolt className="w-6 h-6 text-gold-400" /> Asynchronous Event Queue
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  Background events dispatched by order checkout, artisan onboarding, and catalog submissions.
                </p>
              </div>
              <button
                onClick={handleTriggerQueue}
                className="px-4 py-2 bg-gold-500 hover:bg-gold-400 text-dark-900 font-semibold text-xs rounded-xl transition-all shadow"
              >
                Trigger Execution Pass
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-300">
                <thead className="bg-dark-900/60 text-xs uppercase tracking-wider text-gray-400 border-b border-dark-700">
                  <tr>
                    <th className="px-5 py-3.5">Event Type</th>
                    <th className="px-5 py-3.5">Entity</th>
                    <th className="px-5 py-3.5">Attempts</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Last Error</th>
                    <th className="px-5 py-3.5">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-700/60">
                  {queueData.jobs?.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="text-center py-8 text-gray-500">
                        Queue is clean. All platform events have been processed.
                      </td>
                    </tr>
                  ) : (
                    queueData.jobs?.map((job) => (
                      <tr key={job.id} className="hover:bg-dark-700/40">
                        <td className="px-5 py-3 font-semibold text-xs text-white">
                          {job.event_type}
                        </td>
                        <td className="px-5 py-3 text-xs text-gray-300">
                          {job.entity_type}:{job.entity_id ? job.entity_id.substring(0, 8) : ''}
                        </td>
                        <td className="px-5 py-3 text-xs">
                          {job.attempts || 0} / {job.max_attempts || 3}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            job.status === 'completed'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : job.status === 'processing'
                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                              : job.status === 'pending'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                          }`}>
                            {job.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-xs text-rose-400 font-mono max-w-xs truncate">
                          {job.last_error || '—'}
                        </td>
                        <td className="px-5 py-3">
                          {(job.status === 'failed' || job.status === 'dead_letter') && (
                            <button
                              onClick={() => handleRetryJob(job.id)}
                              className="px-2.5 py-1 bg-dark-700 hover:bg-gold-500 hover:text-dark-900 border border-dark-600 rounded text-xs text-gold-400 font-medium transition-colors"
                            >
                              Retry
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 5: Daily Intelligence Reports ── */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <HiDocumentReport className="w-6 h-6 text-gold-400" /> Autonomous Business Intelligence Reports
              </h2>
              <p className="text-xs text-gray-400 mt-1">
                Data-backed summaries of platform revenue, artisan verification metrics, and inventory restock requirements.
              </p>
            </div>
            <button
              onClick={handleRunDailyReport}
              className="px-4 py-2.5 bg-gold-500 hover:bg-gold-400 text-dark-900 font-semibold text-xs rounded-xl transition-all shadow flex items-center gap-2"
            >
              <HiSparkles className="w-4 h-4" />
              <span>Compile Today's Report</span>
            </button>
          </div>

          <div className="space-y-4">
            {reports.length === 0 ? (
              <div className="bg-dark-800 border border-dark-600 rounded-2xl p-12 text-center text-gray-400 space-y-3">
                <HiDocumentReport className="w-12 h-12 mx-auto text-gray-500" />
                <p>No historical daily intelligence reports stored yet.</p>
                <button
                  onClick={handleRunDailyReport}
                  className="px-4 py-2 bg-gold-500 text-dark-900 font-semibold rounded-xl text-xs"
                >
                  Generate First Daily Report
                </button>
              </div>
            ) : (
              reports.map((rep) => (
                <div
                  key={rep.id}
                  className="bg-dark-800 border border-dark-600 rounded-2xl p-6 shadow-xl space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-dark-700 pb-3">
                    <h3 className="text-base font-bold text-white">{rep.title}</h3>
                    <span className="text-xs text-gray-400 font-mono">
                      Generated: {new Date(rep.created_at).toLocaleString('en-IN')}
                    </span>
                  </div>

                  <p className="text-sm text-gray-300 leading-relaxed">{rep.summary}</p>

                  {/* Metrics Row */}
                  {rep.metrics && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                      <div className="bg-dark-900/60 p-3 rounded-xl border border-dark-700">
                        <div className="text-[11px] text-gray-400">Processed Volume</div>
                        <div className="text-lg font-bold text-white mt-0.5">
                          {rep.metrics.allOrdersCount || 0} Orders
                        </div>
                      </div>
                      <div className="bg-dark-900/60 p-3 rounded-xl border border-dark-700">
                        <div className="text-[11px] text-gray-400">Total Revenue</div>
                        <div className="text-lg font-bold text-emerald-400 mt-0.5">
                          ₹{(rep.metrics.totalRevenue || 0).toLocaleString('en-IN')}
                        </div>
                      </div>
                      <div className="bg-dark-900/60 p-3 rounded-xl border border-dark-700">
                        <div className="text-[11px] text-gray-400">Verified Artisans</div>
                        <div className="text-lg font-bold text-gold-400 mt-0.5">
                          {rep.metrics.verifiedArtisans || 0}
                        </div>
                      </div>
                      <div className="bg-dark-900/60 p-3 rounded-xl border border-dark-700">
                        <div className="text-[11px] text-gray-400">Low Stock Items</div>
                        <div className="text-lg font-bold text-amber-400 mt-0.5">
                          {rep.metrics.lowStockCount || 0}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Insights & Recommendations */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    {rep.insights && rep.insights.length > 0 && (
                      <div className="bg-dark-900/40 border border-dark-700 rounded-xl p-4 space-y-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-gold-400">
                          Operational Insights
                        </div>
                        <ul className="space-y-1.5 text-xs text-gray-300 list-disc list-inside">
                          {rep.insights.map((ins, idx) => (
                            <li key={idx} className="leading-relaxed">{ins}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {rep.recommendations && rep.recommendations.length > 0 && (
                      <div className="bg-dark-900/40 border border-dark-700 rounded-xl p-4 space-y-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                          Strategic Recommendations
                        </div>
                        <ul className="space-y-1.5 text-xs text-gray-300 list-disc list-inside">
                          {rep.recommendations.map((rec, idx) => (
                            <li key={idx} className="leading-relaxed">{rec}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
