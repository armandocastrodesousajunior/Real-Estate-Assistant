import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, Send, Bot, FileText, CheckCircle2, GitCompare,
  ChevronRight, Sparkles, RotateCcw, Info, Activity
} from 'lucide-react';
import { promptsAPI } from '../../services/api';
import type { AgentSpec } from '../../types/agent';
import TraceModal from '../TraceModal/TraceModal';

interface PromptAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  currentPrompt?: string;
  onApply: (generatedData: string | AgentSpec) => void;
  mode: 'edit' | 'create';
  chatContext?: any;
}


interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  metadata?: any;
}

interface EditPatch {
  find: string;
  replace: string;
}

interface StandardResponse {
  action: 'chat' | 'patch' | 'spec' | 'create';
  message?: string;
  edits?: EditPatch[];
  agent_spec?: AgentSpec;
}

// ─── Diff Engine ──────────────────────────────────────────────────────────────
type DiffLine = { type: 'added' | 'removed' | 'unchanged'; text: string };

function computeDiff(original: string, modified: string): DiffLine[] {
  // Normalize line endings to LF
  const normOriginal = original.replace(/\r\n/g, '\n');
  const normModified = modified.replace(/\r\n/g, '\n');
  
  const origLines = normOriginal.split('\n');
  const modLines = normModified.split('\n');

  // LCS-based diff (simplified for line-level)
  const m = origLines.length;
  const n = modLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (origLines[i] === modLines[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && origLines[i] === modLines[j]) {
      result.push({ type: 'unchanged', text: origLines[i] });
      i++; j++;
    } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
      result.push({ type: 'added', text: modLines[j] });
      j++;
    } else {
      result.push({ type: 'removed', text: origLines[i] });
      i++;
    }
  }
  return result;
}

// ─── Apply patches to a prompt ───────────────────────────────────────────────
// ─── Simplify Text for Deep Patching ─────────────────────────────────────────
function deepSimplify(text: string): string {
  if (!text) return "";
  // Removes ALL non-alphanumeric characters and normalizes spaces
  return text
    .replace(/[^a-z0-9àáâãéèêíïóôõöúçñ]/gi, '')
    .toLowerCase();
}

// ─── Apply patches to a prompt ───────────────────────────────────────────────
function applyPatches(original: string, patches: EditPatch[]): { result: string; applied: number; failed: string[] } {
  let result = original;
  let applied = 0;
  const failed: string[] = [];

  for (const patch of patches) {
    if (patch.find === '') {
      result = patch.replace;
      applied++;
      continue;
    }

    // 1. Exact match (High precision)
    if (result.includes(patch.find)) {
      result = result.replace(patch.find, patch.replace);
      applied++;
      continue;
    }

    // 2. Fallback: Normalized line endings
    const normResult = result.replace(/\r\n/g, '\n');
    const normFind = patch.find.replace(/\r\n/g, '\n');
    if (normResult.includes(normFind)) {
      result = normResult.replace(normFind, patch.replace);
      applied++;
      continue;
    }

    // 3. Deep Match (Bullet-Blind, Markdown-Agnostic, Space-Agnostic)
    const lines = result.split('\n');
    const findClean = deepSimplify(patch.find);
    let lineMatched = -1;

    if (findClean.length > 3) {
      for (let i = 0; i < lines.length; i++) {
        const lineClean = deepSimplify(lines[i]);
        if (lineClean && (lineClean === findClean || lineClean.includes(findClean) || findClean.includes(lineClean))) {
          lineMatched = i;
          break;
        }
      }
    }

    if (lineMatched !== -1) {
      lines[lineMatched] = patch.replace;
      result = lines.join('\n');
      applied++;
    } else {
      failed.push(patch.find.slice(0, 50) + (patch.find.length > 50 ? '...' : ''));
    }
  }
  return { result, applied, failed };
}

// ─── JSON Sanitizer ──────────────────────────────────────────────────────────
function sanitizeJSON(str: string): string {
  if (!str) return "";
  
  let cleaned = str.trim();
  
  // 1. Handle unescaped newlines inside quotes
  // This is a common AI error. We try to escape them.
  // Note: This is a heuristic and might not be 100% perfect for all cases.
  cleaned = cleaned.replace(/"([^"]*)"/g, (match, p1) => {
    return '"' + p1.replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
  });

  // 2. Remove trailing commas in arrays/objects
  cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');

  // 3. Remove any control characters that aren't allowed in JSON
  // eslint-disable-next-line no-control-regex
  cleaned = cleaned.replace(/[\x00-\x1F\x7F-\x9F]/g, (c) => {
    if (c === '\n' || c === '\r' || c === '\t') return c; // keep these as literal for now as they'll be escaped next
    return "";
  });

  return cleaned;
}

// ─── Unified JSON Parser ───────────────────────────────────────────────────
function parseAssistantResponse(raw: string): StandardResponse | null {
  try {
    // 1. Try to find JSON block
    const blockMatch = raw.match(/```(?:json)?\n?([\s\S]*?({[\s\S]*?})[\s\S]*?)```/);
    let jsonStr = blockMatch ? blockMatch[2] : null;
    
    // 2. Try raw object if no block
    if (!jsonStr) {
      const rawMatch = raw.match(/({[\s\S]*})/);
      if (rawMatch) jsonStr = rawMatch[1];
    }
    
    if (!jsonStr) return null;
    
    const cleaned = sanitizeJSON(jsonStr);
    const parsed = JSON.parse(cleaned);
    
    // Map fields to unified response
    // RealtyAI Standard: type, response.output
    // Legacy: action, message/summary
    const rawAction = parsed.type || parsed.action || (parsed.edits ? 'patch' : parsed.agent_spec ? 'create' : 'chat');
    const finalAction = rawAction === 'response' ? 'chat' : rawAction;
    const finalMessage = parsed.response?.output || parsed.message || parsed.summary || "";

    return {
      action: finalAction,
      message: finalMessage,
      edits: parsed.edits,
      agent_spec: parsed.agent_spec
    } as StandardResponse;
  } catch (e) {
    console.warn("Falha ao analisar resposta do assistente:", e);
    return null;
  }
}

// ─── Diff Viewer Component ────────────────────────────────────────────────────
function DiffViewer({ original, modified }: { original: string; modified: string }) {
  const diff = computeDiff(original, modified);

  const addedCount = diff.filter(l => l.type === 'added').length;
  const removedCount = diff.filter(l => l.type === 'removed').length;

  return (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', lineHeight: '1.6', height: '100%', overflow: 'auto' }}>
      {/* Stats bar */}
      <div style={{ display: 'flex', gap: '16px', padding: '8px 12px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', fontSize: '0.7rem', fontFamily: 'var(--font-sans)', color: 'var(--text-muted)', position: 'sticky', top: 0, zIndex: 1 }}>
        <span style={{ color: '#4ade80' }}>+{addedCount} linhas adicionadas</span>
        <span style={{ color: '#f87171' }}>−{removedCount} linhas removidas</span>
      </div>
      {diff.map((line, idx) => {
        const bg = line.type === 'added' ? 'rgba(74,222,128,0.08)' : line.type === 'removed' ? 'rgba(248,113,113,0.08)' : 'transparent';
        const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' ';
        const color = line.type === 'added' ? '#4ade80' : line.type === 'removed' ? '#f87171' : 'var(--text-muted)';
        const border = line.type === 'added' ? '2px solid rgba(74,222,128,0.4)' : line.type === 'removed' ? '2px solid rgba(248,113,113,0.4)' : '2px solid transparent';

        return (
          <div
            key={idx}
            style={{ display: 'flex', alignItems: 'flex-start', background: bg, borderLeft: border, minHeight: '22px' }}
          >
            <span style={{ color, width: '28px', flexShrink: 0, textAlign: 'center', padding: '0 4px', userSelect: 'none', opacity: 0.8, fontSize: '0.72rem', paddingTop: '2px' }}>
              {prefix}
            </span>
            <span style={{
              color: line.type === 'unchanged' ? 'var(--text-secondary)' : line.type === 'added' ? '#86efac' : '#fca5a5',
              padding: '1px 8px 1px 0',
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap',
              flex: 1
            }}>
              {line.text || '\u00A0'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PromptAssistant({ isOpen, onClose, currentPrompt = '', onApply, mode, chatContext }: PromptAssistantProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [pendingPatch, setPendingPatch] = useState<StandardResponse | null>(null);
  const [pendingAgentSpec, setPendingAgentSpec] = useState<AgentSpec | null>(null);
  // workingPrompt: accumulated version of the prompt after each round of patches
  const [workingPrompt, setWorkingPrompt] = useState<string>(currentPrompt);
  const [patchError, setPatchError] = useState<string[]>([]);
  const [leftView, setLeftView] = useState<'current' | 'diff'>('current');
  const [isRepairing, setIsRepairing] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingTextRef = useRef('');
  // Use ref so handleSend always reads the latest workingPrompt without stale closure
  const workingPromptRef = useRef(currentPrompt);
  const [selectedTrace, setSelectedTrace] = useState<any>(null);
  const streamingTraceRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen) {
      setMessages([]);
      setInput('');
      setIsStreaming(false);
      setStreamingText('');
      setPendingPatch(null);
      setPendingAgentSpec(null);
      // Reset accumulated prompt to the original from props
      setWorkingPrompt(currentPrompt);
      workingPromptRef.current = currentPrompt;
      setPatchError([]);
      setLeftView('current');
      setShowConfirmClose(false);
      streamingTextRef.current = '';

      if (chatContext && chatContext.history) {
        // Trigger auto-analysis without user action
        setTimeout(() => {
          handleSend(
            "Aja como um consultor neste primeiro momento. Avalie o contexto detalhado dessa conversa e de que forma o agente lidou com o usuário até culminar na mensagem mencionada em foco. NÃO GERE UM JSON DE PATCH AGORA. Apenas me resuma de forma clara sua avaliação técnica da interação e pergunte como eu gostaria de modificar o comportamento do agente ou quais dúvidas tenho sobre o rastreamento.", 
            "Analise esta conversa e o comportamento do agente na mensagem mencionada."
          );
        }, 300);
      }
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const handleSend = async (overrideApiText?: string, overrideVisibleText?: string) => {
    const apiText = (typeof overrideApiText === 'string' ? overrideApiText : input).trim();
    const visibleText = (typeof overrideVisibleText === 'string' ? overrideVisibleText : apiText);
    if (!apiText || isStreaming) return;

    setMessages(prev => [...prev, { role: 'user', content: visibleText }]);
    setInput('');
    setIsStreaming(true);
    setStreamingText('');
    // Don't reset workingPrompt here — we want to ACCUMULATE patches
    setPatchError([]);
    streamingTextRef.current = '';
    streamingTraceRef.current = null;

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      // Always send the accumulated working version so AI patches the right base
      const response = await promptsAPI.streamAssistantChat(apiText, history, workingPromptRef.current, chatContext, mode);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'token') {
              streamingTextRef.current += event.content;
              setStreamingText(streamingTextRef.current);
            } else if (event.type === 'debug_trace') {
              streamingTraceRef.current = event.trace;
            } else if (event.type === 'error') {
              streamingTextRef.current = `❌ Error: ${event.message || 'Unknown error occurred'}`;
              setStreamingText(streamingTextRef.current);
            }
          } catch {}
        }
      }

      let finalText = streamingTextRef.current;
      let finalData = parseAssistantResponse(finalText);

      // 0. Auto-Repair attempt if parsing failed
      if (!finalData && (finalText.includes('{') || finalText.includes('edits') || mode === 'create')) {
        setIsRepairing(true);
        try {
          // Call dedicated backend repair agent
          const repaired = await promptsAPI.repairAssistantJSON(finalText, "Sintaxe JSON inválida ou incompleta", mode);
          if (repaired) {
            finalData = {
              action: repaired.action || (mode === 'edit' ? 'patch' : 'create'),
              message: repaired.message || repaired.summary || "Resposta reparada automaticamente.",
              edits: repaired.edits,
              agent_spec: repaired.agent_spec
            };
            // Update textual representation for the UI
            finalText = JSON.stringify(repaired, null, 2);
          }
        } catch (repairErr) {
          console.error("Auto-repair failed:", repairErr);
        } finally {
          setIsRepairing(false);
        }
      }

      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: finalText, 
        metadata: streamingTraceRef.current 
      }]);

      if (finalData) {
        // 1. Check for Patch (Edit mode)
        if (finalData.action === 'patch' && finalData.edits) {
          const { result, applied, failed } = applyPatches(workingPromptRef.current, finalData.edits);
          workingPromptRef.current = result;
          setWorkingPrompt(result);
          setPendingPatch(finalData);
          setPatchError(failed);
          setLeftView('diff');
        }

        // 2. Check for AgentSpec (Create mode)
        if ((finalData.action === 'create' || finalData.action === 'spec') && finalData.agent_spec) {
          const spec = finalData.agent_spec;
          setPendingAgentSpec(spec);
          setWorkingPrompt(spec.system_prompt);
          workingPromptRef.current = spec.system_prompt;
        }
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || err.message || 'Erro de conexão.';
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ **Falha:** ${errorMsg}` }]);
    } finally {
      setIsStreaming(false);
      setStreamingText('');
      streamingTextRef.current = '';
    }
  };

  const handleApply = () => {
    if (mode === 'create' && pendingAgentSpec) {
      onApply(pendingAgentSpec);
    } else {
      onApply(workingPrompt);
    }
  };

  const handleDiscard = () => {
    // Reset accumulated changes back to original
    setWorkingPrompt(currentPrompt);
    workingPromptRef.current = currentPrompt;
    setPendingPatch(null);
    setPatchError([]);
    setLeftView('current');
  };

  const handleRequestClose = () => {
    // hasDiff: true once at least one patch has been accumulated
    const hasUnsavedEdit = mode === 'edit' && pendingPatch !== null && workingPrompt !== currentPrompt;
    const hasUnsavedCreate = mode === 'create' && pendingAgentSpec !== null;
    
    if (hasUnsavedEdit || hasUnsavedCreate) {
      setShowConfirmClose(true);
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  // hasDiff: true once at least one patch has been accumulated (workingPrompt diverged from original)
  const hasDiff = pendingPatch !== null && workingPrompt !== currentPrompt;
  const isEditMode = mode === 'edit';

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 1000 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '78vw',
          height: '88vh',
          maxWidth: '1320px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '20px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(99,102,241,0.15)',
        }}
      >
        {/* ─── TOP BAR ─────────────────────────────────────────────── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          height: '54px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-sidebar)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'var(--primary-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
              <Sparkles size={16} />
            </div>
            <div>
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Engenheiro de Prompts IA</span>
              <span style={{ marginLeft: '12px', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {isEditMode ? 'Modo Edição Cirúrgica' : 'Modo Criação'}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {(hasDiff || (mode === 'create' && pendingAgentSpec)) && (
              <>
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}
                  onClick={handleDiscard}
                >
                  <RotateCcw size={13} /> Descartar
                </button>
                {mode === 'edit' && (
                  <button
                    className={`btn btn-sm ${leftView === 'diff' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: '0.75rem' }}
                    onClick={() => setLeftView(leftView === 'diff' ? 'current' : 'diff')}
                  >
                    <GitCompare size={13} /> {leftView === 'diff' ? 'Ver Original' : 'Ver Diff'}
                  </button>
                )}
                <button
                  className="btn btn-sm"
                  style={{ background: 'var(--accent)', color: '#fff', fontSize: '0.75rem' }}
                  onClick={handleApply}
                >
                  <CheckCircle2 size={13} /> {mode === 'create' ? 'Usar este Especialista' : 'Aplicar Alterações'}
                </button>
              </>
            )}
            <button className="btn-icon-sm" onClick={handleRequestClose} style={{ marginLeft: '8px' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ─── BODY ────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', overflow: 'hidden' }}>

          {/* LEFT: Prompt Panel (Edit mode) or Agent Preview (Create mode) */}
          <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', overflow: 'hidden' }}>
            {mode === 'edit' ? (
              <>
                {/* Left header editing */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '8px 14px', borderBottom: '1px solid var(--border)',
                  background: 'var(--bg-elevated)', flexShrink: 0
                }}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => setLeftView('current')}
                      style={{
                        padding: '3px 10px', fontSize: '0.72rem', borderRadius: '4px', border: 'none', cursor: 'pointer',
                        background: leftView === 'current' ? 'var(--bg-card)' : 'transparent',
                        color: leftView === 'current' ? 'var(--text-primary)' : 'var(--text-muted)',
                        fontWeight: leftView === 'current' ? 700 : 400,
                        transition: 'all 0.15s'
                      }}
                    >
                      <FileText size={11} style={{ marginRight: '5px', verticalAlign: 'middle' }} />
                      Prompt Atual
                    </button>
                    {hasDiff && (
                      <button
                        onClick={() => setLeftView('diff')}
                        style={{
                          padding: '3px 10px', fontSize: '0.72rem', borderRadius: '4px', border: 'none', cursor: 'pointer',
                          background: leftView === 'diff' ? 'var(--bg-card)' : 'transparent',
                          color: leftView === 'diff' ? 'var(--primary)' : 'var(--text-muted)',
                          fontWeight: leftView === 'diff' ? 700 : 400,
                          transition: 'all 0.15s',
                          display: 'flex', alignItems: 'center', gap: '4px'
                        }}
                      >
                        <GitCompare size={11} />
                        Comparar Mudanças
                        <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: '10px', padding: '0 5px', fontSize: '0.62rem', marginLeft: '2px' }}>
                          {pendingPatch?.edits.length}
                        </span>
                      </button>
                    )}
                  </div>

                  {hasDiff && pendingPatch && (
                    <div style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {isStreaming && <div className="spinner-xs" style={{ width: '10px', height: '10px' }} />}
                      {pendingPatch.summary}
                    </div>
                  )}
                </div>

                {/* Left content editing */}
                <div style={{ flex: 1, overflow: 'hidden', background: 'var(--bg-sidebar)' }}>
                  {leftView === 'current' ? (
                    <div style={{ height: '100%', overflow: 'auto', padding: '14px 16px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', lineHeight: '1.7', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {currentPrompt || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Nenhum prompt carregado.</span>}
                    </div>
                  ) : (
                    hasDiff && (
                      <DiffViewer original={currentPrompt} modified={workingPrompt} />
                    )
                  )}
                </div>
              </>
            ) : (
              /* MODO CREATE: Preview do Agente Gerado */
              <div style={{ flex: 1, overflow: 'auto', padding: '24px', background: 'var(--bg-sidebar)' }}>
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h4 style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', margin: 0 }}>
                      Projeto do Especialista
                    </h4>
                    {isStreaming && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', color: 'var(--primary)' }}>
                        <div className="spinner-xs" style={{ width: '10px', height: '10px' }} />
                        <span>Desenhando...</span>
                      </div>
                    )}
                  </div>
                  
                  {pendingAgentSpec ? (
                    <div className={`card ${isStreaming ? 'animate-pulse' : ''}`} style={{ padding: '24px', border: '1px solid var(--primary-dim)', background: 'var(--bg-card)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                        <div style={{ 
                          width: 64, height: 64, borderRadius: '16px', 
                          background: 'var(--primary-dim)', 
                          display: 'flex', alignItems: 'center', justifyContent: 'center', 
                          fontSize: '2.4rem',
                          border: '1px solid var(--primary-dim)'
                        }}>
                          {pendingAgentSpec.emoji || '🤖'}
                        </div>
                        <div>
                          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '2px' }}>
                            {pendingAgentSpec.name || 'Definindo nome...'}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--primary)', fontFamily: 'var(--font-mono)', opacity: 0.8 }}>
                            @{pendingAgentSpec.slug || 'slug-automatico'}
                          </div>
                        </div>
                      </div>
                      
                      <div style={{ marginBottom: '20px' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                          Competências & Roteamento
                        </div>
                        <div style={{ 
                          fontSize: '0.85rem', 
                          color: 'var(--text-secondary)', 
                          lineHeight: '1.6',
                          background: 'var(--bg-sidebar)',
                          padding: '12px',
                          borderRadius: '8px',
                          border: '1px solid var(--border)'
                        }}>
                          {pendingAgentSpec.description || 'A IA está descrevendo as habilidades deste agente...'}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                          System Prompt Estruturado
                        </div>
                        <div style={{ 
                          fontSize: '0.75rem', 
                          color: 'var(--text-muted)', 
                          fontFamily: 'var(--font-mono)', 
                          background: 'var(--bg-sidebar)', 
                          padding: '12px', 
                          borderRadius: '8px',
                          maxHeight: '200px',
                          overflow: 'hidden',
                          border: '1px solid var(--border)',
                          position: 'relative'
                        }}>
                          <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                            {pendingAgentSpec.system_prompt || 'O núcleo da inteligência está sendo formatado...'}
                          </div>
                          <div style={{ 
                            position: 'absolute', bottom: 0, left: 0, right: 0, 
                            height: '40px', background: 'linear-gradient(to bottom, transparent, var(--bg-sidebar))' 
                          }} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ 
                      padding: '60px 40px', textAlign: 'center', 
                      color: 'var(--text-muted)', 
                      border: '2px dashed var(--border)', 
                      borderRadius: '16px',
                      background: 'rgba(255,255,255,0.02)'
                    }}>
                      <div style={{ position: 'relative', width: 'fit-content', margin: '0 auto 20px' }}>
                        <Bot size={48} style={{ opacity: 0.15 }} />
                        <Sparkles size={20} style={{ position: 'absolute', top: -5, right: -5, color: 'var(--accent)', opacity: 0.4 }} />
                      </div>
                      <h5 style={{ color: 'var(--text-primary)', marginBottom: '8px', fontSize: '0.95rem' }}>Pronto para projetar</h5>
                      <p style={{ fontSize: '0.8rem', lineHeight: '1.5', maxWidth: '240px', margin: '0 auto' }}>
                        Descreva as funções do novo especialista no chat à direita para começar a construção.
                      </p>
                    </div>
                  )}
                </div>

                {pendingAgentSpec && !isStreaming && (
                  <div style={{ 
                    display: 'flex', gap: '12px', alignItems: 'center', 
                    padding: '14px 18px', background: 'var(--accent-dim)', 
                    borderRadius: '12px', border: '1px solid var(--accent)',
                    color: 'var(--accent)', fontSize: '0.8rem', fontWeight: 600
                  }}>
                    <div style={{ background: 'var(--accent)', color: '#fff', borderRadius: '50%', padding: '4px' }}>
                      <CheckCircle2 size={14} />
                    </div>
                    <span>Projeto finalizado! Clique em "Usar este Especialista" no topo.</span>
                  </div>
                )}
              </div>
            )}

            {/* Patch error banner */}
            {patchError.length > 0 && (
              <div style={{ padding: '8px 14px', background: 'rgba(239,68,68,0.1)', borderTop: '1px solid rgba(239,68,68,0.3)', fontSize: '0.72rem', color: '#f87171', flexShrink: 0 }}>
                <Info size={11} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                {patchError.length} trecho(s) não encontrado(s) para aplicar. Peça à IA para corrigir.
              </div>
            )}
          </div>

          {/* RIGHT: Chat Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-card)' }}>
            {/* Chat header */}
            <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)', flexShrink: 0, fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Bot size={12} />
              Converse com o Engenheiro de Prompts — ele retornará apenas as diferenças necessárias
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {messages.length === 0 && !streamingText && (
                <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Sparkles size={36} style={{ opacity: 0.15, margin: '0 auto 12px', display: 'block' }} />
                  <p style={{ fontSize: '0.85rem', marginBottom: '16px' }}>
                    {isEditMode
                      ? 'Descreva o que quer alterar no prompt. O Engenheiro editará apenas o necessário.'
                      : 'Descreva o especialista que quer criar e o Engenheiro gerará o prompt completo.'}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}>
                    {isEditMode ? (
                      <>
                        <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem', width: '100%', maxWidth: '340px' }} onClick={() => setInput('Mude o tom de voz para ser mais descontraído e próximo do cliente.')}>
                          💬 Mudar tom de voz
                        </button>
                        <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem', width: '100%', maxWidth: '340px' }} onClick={() => setInput('Adicione uma regra proibindo que este agente invente preços de imóveis.')}>
                          🚫 Adicionar restrição de preço
                        </button>
                        <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem', width: '100%', maxWidth: '340px' }} onClick={() => setInput('Adicione capacidade de marcar visitas a imóveis.')}>
                          📅 Adicionar marcação de visitas
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem', width: '100%', maxWidth: '340px' }} onClick={() => setInput('Quero um agente que apenas recepciona clientes e descobre o que eles precisam.')}>
                          👋 Agente de Atendimento
                        </button>
                        <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem', width: '100%', maxWidth: '340px' }} onClick={() => setInput('Quero um agente especialista em buscar imóveis no banco de dados.')}>
                          🔍 Agente Buscador
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {messages.map((m, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '90%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    fontSize: '0.83rem',
                    lineHeight: '1.55',
                    background: m.role === 'user' ? 'var(--primary)' : 'var(--bg-elevated)',
                    color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
                    border: m.role === 'assistant' ? '1px solid var(--border)' : 'none',
                  }}>
                    {m.role === 'assistant' ? (
                      (() => {
                        const data = parseAssistantResponse(m.content);

                        if (data && data.action === 'patch' && data.edits && mode === 'edit') {
                          return (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', color: 'var(--accent)', fontWeight: 700, fontSize: '0.8rem' }}>
                                <CheckCircle2 size={14} />
                                {data.edits.length} edição(ões) calculada(s)
                              </div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>{data.message || "Edição cirúrgica aplicada."}</div>
                              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {data.edits.map((e, i) => (
                                  <div key={i} style={{ background: 'var(--bg-card)', borderRadius: '6px', padding: '6px 10px', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
                                    <div style={{ color: '#f87171', marginBottom: '2px' }}>− {e.find.slice(0, 60)}{e.find.length > 60 ? '…' : ''}</div>
                                    {e.replace && <div style={{ color: '#4ade80' }}>+ {e.replace.slice(0, 60)}{e.replace.length > 60 ? '…' : ''}</div>}
                                  </div>
                                ))}
                              </div>
                              <div style={{ marginTop: '10px', fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                ← Veja o diff aplicado no painel esquerdo
                              </div>
                              {m.metadata && (
                                <button className="msg-action-btn" data-tooltip="Ver Rastreamento" onClick={() => setSelectedTrace(m.metadata)}>
                                  <Activity size={12} />
                                </button>
                              )}
                              {idx === messages.length - 1 && patchError.length > 0 && (
                                <div style={{ 
                                  marginTop: '12px', padding: '10px', background: 'rgba(248,113,113,0.1)', 
                                  border: '1px solid #f87171', borderRadius: '8px', fontSize: '0.75rem' 
                                }}>
                                  <div style={{ color: '#f87171', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                    <Info size={14} /> Trecho(s) não localizados automaticamente:
                                  </div>
                                  <ul style={{ paddingLeft: '15px', margin: 0, color: 'var(--text-secondary)' }}>
                                    {patchError.map((err, i) => <li key={i}>{err}</li>)}
                                  </ul>
                                </div>
                              )}
                            </div>
                          );
                        }
                        
                        if (data && (data.action === 'create' || data.action === 'spec') && data.agent_spec && mode === 'create') {
                          const spec = data.agent_spec;
                          return (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', color: 'var(--accent)', fontWeight: 700, fontSize: '0.8rem' }}>
                                <Sparkles size={14} />
                                Especialista Projetado!
                              </div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>{spec.name} ({spec.emoji}) foi configurado com sucesso.</div>
                              <div style={{ marginTop: '10px', fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                ← Confira o preview completo no painel esquerdo
                              </div>
                              {m.metadata && (
                                <button className="msg-action-btn" data-tooltip="Ver Rastreamento" onClick={() => setSelectedTrace(m.metadata)}>
                                  <Activity size={12} />
                                </button>
                              )}
                            </div>
                          );
                        }

                        // Fallback: If no component was rendered, show content while preserving code blocks
                        const contentToShow = data ? (data.message || JSON.stringify(data, null, 2)) : m.content;
                        return (
                          <div style={{ position: 'relative' }}>
                            <div dangerouslySetInnerHTML={{ 
                               __html: contentToShow
                                 .replace(/```([\s\S]*?)```/g, '<pre style="background:var(--bg-card); padding:8px; border-radius:4px; overflow:auto; font-size:0.75rem; margin:8px 0; border:1px solid var(--border);"><code>$1</code></pre>')
                                 .replace(/\n/g, '<br/>')
                                 .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') 
                            }} />
                            {m.metadata && (
                              <button className="msg-action-btn" data-tooltip="Ver Rastreamento" onClick={() => setSelectedTrace(m.metadata)}>
                                <Activity size={12} />
                              </button>
                            )}
                            {idx === messages.length - 1 && patchError.length > 0 && (
                               <div style={{ 
                                 marginTop: '12px', padding: '10px', background: 'rgba(248,113,113,0.1)', 
                                 border: '1px solid #f87171', borderRadius: '8px', fontSize: '0.75rem' 
                               }}>
                                 <div style={{ color: '#f87171', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                   <Info size={14} /> Trecho(s) não localizados automaticamente:
                                 </div>
                                 <ul style={{ paddingLeft: '15px', margin: 0, color: 'var(--text-secondary)' }}>
                                   {patchError.map((err, i) => <li key={i}>{err}</li>)}
                                 </ul>
                               </div>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      m.content
                    )}
                  </div>
                  {/* Apply button for non-edit mode assistant messages */}
                  {m.role === 'assistant' && !isEditMode && (
                    <button
                      className="btn btn-sm btn-ghost"
                      style={{ fontSize: '0.7rem', marginTop: '4px', color: 'var(--accent)', alignSelf: 'flex-end' }}
                      onClick={() => {
                        // Extract the full text content for create mode
                        const clean = m.content.replace(/```json[\s\S]*?```/g, '').trim();
                        onApply(clean);
                      }}
                    >
                      <CheckCircle2 size={11} /> Usar este Prompt
                    </button>
                  )}
                </div>
              ))}

              {isStreaming && (
                <div style={{ alignSelf: 'flex-start', maxWidth: '90%' }}>
                  <div style={{
                    padding: '10px 14px', borderRadius: '10px', fontSize: '0.83rem', lineHeight: '1.55',
                    background: 'var(--bg-elevated)', border: '1px solid var(--accent)', color: 'var(--text-primary)'
                  }}>
                    {isRepairing ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent)', fontSize: '0.78rem' }}>
                        <RotateCcw size={13} className="animate-spin" />
                        Reparando resposta com IA secundária...
                      </div>
                    ) : streamingText ? (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>
                        {streamingText.slice(0, 300)}{streamingText.length > 300 ? '…' : ''}
                      </span>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                        <Sparkles size={13} className="animate-pulse" />
                        Aguardando resposta...
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input bar */}
            <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', background: 'var(--bg-elevated)', flexShrink: 0 }}>
              <div className="input-box-container" style={{ background: 'var(--bg-card)', borderRadius: '10px' }}>
                <textarea
                  placeholder={isStreaming ? 'Processando...' : isEditMode ? 'Descreva o que alterar ou converse com a IA... (Enter envia)' : 'Descreva o novo especialista... (Enter envia)'}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  disabled={isStreaming}
                  rows={2}
                  style={{ padding: '10px 12px', fontSize: '0.83rem', resize: 'none' }}
                />
                <button
                  className="btn-send"
                  onClick={handleSend}
                  disabled={isStreaming || !input.trim()}
                >
                  <Send size={17} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showConfirmClose && (
        <div className="modal-overlay" style={{ zIndex: 1050, alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" style={{ maxWidth: '420px', padding: '24px', textAlign: 'center' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--warning-dim)', color: 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Info size={24} />
            </div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Alterações não salvas
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
              Você tem modificações pendentes no prompt que não foram aplicadas. Deseja aplicá-las ou descartá-las?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button 
                className="btn btn-primary" 
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => { setShowConfirmClose(false); handleApply(); }}
              >
                Salvar e Sair
              </button>
              <button 
                className="btn btn-danger" 
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => { setShowConfirmClose(false); handleDiscard(); onClose(); }}
              >
                Descartar Alterações
              </button>
              <button 
                className="btn btn-ghost" 
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => setShowConfirmClose(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <TraceModal 
        isOpen={selectedTrace !== null} 
        onClose={() => setSelectedTrace(null)} 
        trace={selectedTrace} 
      />
    </div>
  );
}
