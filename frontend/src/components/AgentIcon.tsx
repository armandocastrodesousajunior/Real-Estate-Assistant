import React from 'react';

interface AgentIconProps {
  name: string;
  emoji?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  style?: React.CSSProperties;
}

const AgentIcon: React.FC<AgentIconProps> = ({ 
  name, 
  emoji, 
  size = 'md', 
  className = '', 
  style = {} 
}) => {
  // Determine if it's a valid single emoji
  const isEmoji = (str: string) => {
    if (!str) return false;
    // Basic check for emoji or single character
    const charCount = Array.from(str).length;
    return charCount === 1;
  };

  const getInitials = (n: string) => {
    return n.trim().charAt(0).toUpperCase();
  };

  const getGradient = (n: string) => {
    const colors = [
      ['#10B981', '#059669'], // Emerald
      ['#6366F1', '#4F46E5'], // Indigo
      ['#3B82F6', '#2563EB'], // Blue
      ['#F59E0B', '#D97706'], // Amber
      ['#EC4899', '#DB2777'], // Pink
      ['#8B5CF6', '#7C3AED'], // Violet
    ];
    
    // Hash name to pick a stable color
    let hash = 0;
    for (let i = 0; i < n.length; i++) {
      hash = n.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return `linear-gradient(135deg, ${colors[index][0]}, ${colors[index][1]})`;
  };

  const sizeMap = {
    xs: { dim: 24, font: '12px' },
    sm: { dim: 32, font: '16px' },
    md: { dim: 38, font: '18px' },
    lg: { dim: 46, font: '22px' },
    xl: { dim: 72, font: '36px' },
  };

  const s = sizeMap[size];
  const useEmoji = emoji && isEmoji(emoji);

  return (
    <div 
      className={`agent-avatar-root ${className}`}
      style={{
        width: s.dim,
        height: s.dim,
        borderRadius: size === 'xl' ? 'var(--radius-xl)' : 'var(--radius-md)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        background: useEmoji ? 'var(--bg-elevated)' : getGradient(name),
        border: useEmoji ? '1px solid var(--border)' : 'none',
        color: '#fff',
        fontSize: s.font,
        fontWeight: 700,
        boxShadow: useEmoji ? 'none' : '0 4px 12px rgba(0,0,0,0.2)',
        ...style
      }}
    >
      {useEmoji ? emoji : getInitials(name)}
    </div>
  );
};

export default AgentIcon;
