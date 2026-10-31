import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon: LucideIcon;
  accentColor?: string;
  iconBg?: string;
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subtext,
  icon: Icon,
  accentColor = '#10b981',
  iconBg = 'rgba(16, 185, 129, 0.12)',
  onClick,
}) => {
  return (
    <div
      className="stat-card"
      style={{
        cursor: onClick ? 'pointer' : 'default',
        ['--stat-accent' as any]: accentColor,
        ['--stat-icon-bg' as any]: iconBg,
      }}
      onClick={onClick}
    >
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <div className="stat-icon-wrap">
          <Icon size={20} />
        </div>
      </div>
      <div className="stat-value">{value}</div>
      {subtext && <div className="stat-subtext">{subtext}</div>}
    </div>
  );
};
