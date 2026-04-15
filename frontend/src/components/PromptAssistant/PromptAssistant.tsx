import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, Send, Bot, FileText, CheckCircle2, GitCompare,
  ChevronRight, Sparkles, RotateCcw, Info
} from 'lucide-react';
import { promptsAPI } from '../../services/api';

interface PromptAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  currentPrompt?: string;
  onApply: (generatedPrompt: string) => void;
  mode: 'edit' | 'create';
  chatContext?: any;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface EditPatch {
  find: string;
  replace: string;
}

interface PatchResult {
  edits: EditPatch[];
  summary: string;
}

// ─── Diff Engine ──────────────────────────────────────────────────────────────
type DiffLine = { type: 'added' | 'removed' | 'unchanged'; text: string };

function computeDiff(original: string, modified: string): DiffLine[] {
  const origLines = original.split('\n');
  const modLines = modified.split('\n');

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
function applyPatches(original: string, patches: EditPatch[]): { result: string; applied: number; failed: string[] } {
  let result = original;
  let applied = 0;
  const failed: string[] = [];

  for (const patch of patches) {
    if (patch.find === '') {
      // Full replacement (new prompt from scratch)
      result = patch.replace;
      applied++;
      continue;
    }
    if (result.includes(patch.find)) {
      result = result.replace(patch.find, patch.replace);
      applied++;
    } else {
      failed.push(patch.find.slice(0, 50) + (patch.find.length > 50 ? '...' : ''));
    }
  }
  return { result, applied, failed };
}

// ─── Extract JSON from AI response ───────────────────────────────────────────
function extractPatchJSON(raw: string): PatchResult | null {
  try {
    const match = raw.match(/```(?:json)?\n?([\s\S]*?)```/);
    const jsonStr = match ? match[1] : raw;
    const parsed = JSON.parse(jsonStr.trim());
    if (parsed.edits && Array.isArray(parsed.edits)) return parsed as PatchResult;
  } catch {}
  return null;
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
  const [pendingPatch, setPendingPatch] = useState<PatchResult | null>(null);
  // workingPrompt: accumulated version of the prompt after each round of patches
  const [workingPrompt, setWorkingPrompt] = useState<string>(currentPrompt);
  const [patchError, setPatchError] = useState<string[]>([]);
  const [leftView, setLeftView] = useState<'current' | 'diff'>('current');
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingTextRef = useRef('');
  // Use ref so handleSend always reads the latest workingPrompt without stale closure
  const workingPromptRef = useRef(currentPrompt);

  useEffect(() => {
    if (isOpen) {
      setMessages([]);
      setInput('');
      setIsStreaming(false);
      setStreamingText('');
      setPendingPatch(null);
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

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      // Always send the accumulated working version so AI patches the right base
      const response = await promptsAPI.streamAssistantChat(apiText, history, workingPromptRef.current, chatContext);
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
            }
          } catch {}
        }
      }

      const finalText = streamingTextRef.current;
      setMessages(prev => [...prev, { role: 'assistant', content: finalText }]);

      // Apply patch on top of the CURRENT accumulated workingPrompt
      const patch = extractPatchJSON(finalText);
      if (patch && mode === 'edit') {
        const { result, applied, failed } = applyPatches(workingPromptRef.current, patch.edits);
        // Update both ref and state so next round uses the new accumulated version
        workingPromptRef.current = result;
        setWorkingPrompt(result);
        setPendingPatch(patch);
        setPatchError(failed);
        setLeftView('diff');
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Erro ao conectar-se ao assistente.' }]);
    } finally {
      setIsStreaming(false);
      setStreamingText('');
      streamingTextRef.current = '';
    }
  };

  const handleApply = () => {
    // Apply the fully accumulated working prompt
    onApply(workingPrompt);
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
    const hasUnsaved = pendingPatch !== null && workingPrompt !== currentPrompt;
    if (hasUnsaved) {
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
            {hasDiff && (
              <>
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}
                  onClick={handleDiscard}
                >
                  <RotateCcw size={13} /> Descartar
                </button>
                <button
                  className={`btn btn-sm ${leftView === 'diff' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.75rem' }}
                  onClick={() => setLeftView(leftView === 'diff' ? 'current' : 'diff')}
                >
                  <GitCompare size={13} /> {leftView === 'diff' ? 'Ver Original' : 'Ver Diff'}
                </button>
                <button
                  className="btn btn-sm"
                  style={{ background: 'var(--accent)', color: '#fff', fontSize: '0.75rem' }}
                  onClick={handleApply}
                >
                  <CheckCircle2 size={13} /> Aplicar Alterações
                </button>
              </>
            )}
            <button className="btn-icon-sm" onClick={handleRequestClose} style={{ marginLeft: '8px' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ─── BODY ────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: isEditMode ? '1fr 1fr' : '1fr', overflow: 'hidden' }}>

          {/* LEFT: Prompt Panel (Edit mode only) */}
          {isEditMode && (
            <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', overflow: 'hidden' }}>
              {/* Left header */}
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
                  <div style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    {pendingPatch.summary}
                  </div>
                )}
              </div>

              {/* Left content */}
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

              {/* Patch error banner */}
              {patchError.length > 0 && (
                <div style={{ padding: '8px 14px', background: 'rgba(239,68,68,0.1)', borderTop: '1px solid rgba(239,68,68,0.3)', fontSize: '0.72rem', color: '#f87171', flexShrink: 0 }}>
                  <Info size={11} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                  {patchError.length} trecho(s) não encontrado(s) para aplicar. Peça à IA para corrigir.
                </div>
              )}
            </div>
          )}

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
                        const patch = extractPatchJSON(m.content);
                        if (patch) {
                          // Render a clean summary card for patch responses
                          return (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', color: 'var(--accent)', fontWeight: 700, fontSize: '0.8rem' }}>
                                <CheckCircle2 size={14} />
                                {patch.edits.length} edição(ões) calculada(s)
                              </div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>{patch.summary}</div>
                              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {patch.edits.map((e, i) => (
                                  <div key={i} style={{ background: 'var(--bg-card)', borderRadius: '6px', padding: '6px 10px', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
                                    <div style={{ color: '#f87171', marginBottom: '2px' }}>− {e.find.slice(0, 60)}{e.find.length > 60 ? '…' : ''}</div>
                                    {e.replace && <div style={{ color: '#4ade80' }}>+ {e.replace.slice(0, 60)}{e.replace.length > 60 ? '…' : ''}</div>}
                                  </div>
                                ))}
                              </div>
                              <div style={{ marginTop: '10px', fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                ← Veja o diff aplicado no painel esquerdo
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div dangerouslySetInnerHTML={{ __html: m.content.replace(/\n/g, '<br/>').replace(/```[\s\S]*?```/g, '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
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
                    {streamingText ? (
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
    </div>
  );
}
