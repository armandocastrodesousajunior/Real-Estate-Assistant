import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Bot, FileText, CheckCircle2 } from 'lucide-react';
import { promptsAPI } from '../../services/api';

interface PromptAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  currentPrompt?: string;
  onApply: (generatedPrompt: string) => void;
  mode: 'edit' | 'create';
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function PromptAssistant({ isOpen, onClose, currentPrompt, onApply, mode }: PromptAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingTextRef = useRef('');

  useEffect(() => {
    if (isOpen) {
      setMessages([]);
      setInput('');
      setIsStreaming(false);
      setStreamingText('');
      streamingTextRef.current = '';
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');
    setIsStreaming(true);
    setStreamingText('');
    streamingTextRef.current = '';

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const response = await promptsAPI.streamAssistantChat(text, history, currentPrompt);
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
            } else if (event.type === 'done') {
              // Finish parsing
            } else if (event.type === 'error') {
              console.error('Error from assistant:', event.message);
            }
          } catch (e) {}
        }
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: streamingTextRef.current }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Erro ao conectar-se ao assistente.' }]);
    } finally {
      setIsStreaming(false);
      setStreamingText('');
      streamingTextRef.current = '';
    }
  };

  const extractMarkdownBlocks = (text: string) => {
    const regex = /```markdown\n([\s\S]*?)```/g;
    let match;
    const blocks: string[] = [];
    while ((match = regex.exec(text)) !== null) {
      blocks.push(match[1]);
    }
    // Fallback se ele não usou ```markdown
    const regex2 = /```\n([\s\S]*?)```/g;
    while ((match = regex2.exec(text)) !== null) {
      blocks.push(match[1]);
    }
    return blocks.length > 0 ? blocks[blocks.length - 1] : text;
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
      {/* Increased size for the AI assistant modal */}
      <div className="modal-content" style={{ width: '80vw', maxWidth: '1000px', height: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: 42, height: 42, borderRadius: 'var(--radius-md)', background: 'var(--primary-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
              <Bot size={22} />
            </div>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.15rem', color: 'var(--text-primary)' }}>
                Engenheiro de Prompts IA
              </h2>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                {mode === 'edit' ? 'Refinando o prompt atual' : 'Gerando um novo especialista'}
              </p>
            </div>
          </div>
          <button className="btn-icon-sm" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Chat Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 4px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {messages.length === 0 && !streamingText && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              <FileText size={48} style={{ opacity: 0.2, margin: '0 auto 16px' }} />
              <h3 style={{ fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '8px' }}>Como posso ajudar?</h3>
              <p style={{ fontSize: '0.85rem' }}>
                Descreva o comportamento desejado. Eu gerarei um prompt formatado no padrão da imobiliária.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '20px' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setInput('Adicione a capacidade de ele marcar visitas na agenda.')}>Adicionar marcação de visita</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setInput('Mude o tom de voz dele para ser mais descontraído.')}>Mudar tom de voz</button>
              </div>
            </div>
          )}

          {messages.map((m, idx) => (
            <div key={idx} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
              <div style={{
                background: m.role === 'user' ? 'var(--primary)' : 'var(--bg-elevated)',
                color: m.role === 'user' ? 'white' : 'var(--text-primary)',
                padding: '12px 16px',
                borderRadius: '8px',
                border: m.role === 'assistant' ? '1px solid var(--border)' : 'none',
                fontSize: '0.86rem',
                lineHeight: '1.5'
              }}>
                {m.role === 'assistant' ? (
                  <div dangerouslySetInnerHTML={{ __html: m.content.replace(/\n/g, '<br/>').replace(/```markdown/g, '<div style="background:var(--bg-card);padding:10px;border-radius:4px;margin:8px 0;border:1px solid var(--border);font-family:monospace;font-size:0.8rem;overflow-x:auto;">').replace(/```/g, '</div>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                ) : (
                  m.content
                )}
              </div>
              
              {m.role === 'assistant' && (
                <div style={{ marginTop: '6px', textAlign: 'right' }}>
                  <button 
                    className="btn btn-sm btn-ghost" 
                    style={{ fontSize: '0.7rem', padding: '2px 8px', height: 'auto',  color: 'var(--accent)'}}
                    onClick={() => onApply(extractMarkdownBlocks(m.content))}
                  >
                    <CheckCircle2 size={12} style={{ marginRight: '4px' }}/> Aplicar Prompt Gerado
                  </button>
                </div>
              )}
            </div>
          ))}

          {isStreaming && (
            <div style={{ alignSelf: 'flex-start', maxWidth: '85%' }}>
              <div style={{
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                padding: '12px 16px',
                borderRadius: '8px',
                border: '1px solid var(--accent)',
                fontSize: '0.86rem',
                lineHeight: '1.5'
              }}>
                <div dangerouslySetInnerHTML={{ __html: streamingText.replace(/\n/g, '<br/>').replace(/```markdown/g, '<div style="background:var(--bg-card);padding:10px;border-radius:4px;margin:8px 0;border:1px solid var(--accent);font-family:monospace;font-size:0.8rem;overflow-x:auto;">').replace(/```/g, '</div>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                <span className="typing-dot-loading" style={{marginLeft: '8px'}}><span/></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: 'auto' }}>
          <div className="input-box-container" style={{ background: 'var(--bg-elevated)' }}>
            <textarea
              placeholder={isStreaming ? 'IA está pensando...' : 'Descreva as alterações ou o propósito do agente... (Enter para enviar)'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              disabled={isStreaming}
              rows={2}
              style={{ padding: '12px', fontSize: '0.85rem' }}
            />
            <button className="btn-send" onClick={handleSend} disabled={isStreaming || !input.trim()}>
              <Send size={18} />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
