
import React from 'react';
import { type LucideIcon } from 'lucide-react';

interface DashboardCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  colorClass: string;
  children?: React.ReactNode;
}

const DashboardCard: React.FC<DashboardCardProps> = ({ title, value, icon: Icon, colorClass, children }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border-l-4" style={{ borderLeftColor: colorClass }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-secondary dark:text-gray-400 uppercase">{title}</p>
          <p className="text-2xl font-bold text-neutral-dark dark:text-white">{value}</p>
        </div>
        <div className="p-3 rounded-full" style={{ backgroundColor: `${colorClass}20` }}>
          <Icon size={24} style={{ color: colorClass }} />
        </div>
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
};

export default DashboardCard;
