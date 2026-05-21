
import React, { useState } from 'react';
import { type Task, Status } from '../types';
import { MOCK_USERS } from '../constants';
import { MoreHorizontal } from 'lucide-react';

interface KanbanCardProps {
  task: Task;
}

const KanbanCard: React.FC<KanbanCardProps> = ({ task }) => {
  const assignee = MOCK_USERS.find(u => u.id === task.assigneeId);
  const [imgError, setImgError] = useState(false);
  return (
    <div className="bg-white dark:bg-gray-700 rounded-lg shadow-sm p-3 mb-3 border border-neutral-medium dark:border-gray-600">
      <div className="flex justify-between items-center mb-2">
        <h4 className="font-semibold text-sm text-neutral-dark dark:text-white">{task.title}</h4>
        <button className="text-secondary dark:text-gray-400">
          <MoreHorizontal size={16} />
        </button>
      </div>
      <p className="text-xs text-secondary dark:text-gray-400 mb-3">Due: {new Date(task.dueDate).toLocaleDateString()}</p>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {assignee && (
            assignee.avatarUrl && assignee.avatarUrl.trim() !== '' && !imgError ? (
              <img 
                src={assignee.avatarUrl} 
                alt={assignee.username} 
                className="w-6 h-6 rounded-full object-cover" 
                title={assignee.username} 
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-bold" title={assignee.username}>
                {assignee.firstName?.charAt(0).toUpperCase() || assignee.username?.charAt(0).toUpperCase()}
              </div>
            )
          )}
        </div>
        <span className="px-2 py-1 text-xs font-medium text-primary-dark bg-primary-light/30 rounded-full">
            Engagement #{task.engagementId.split('-')[1]}
        </span>
      </div>
    </div>
  );
};

interface KanbanColumnProps {
  title: string;
  tasks: Task[];
  status: Status;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({ title, tasks, status }) => {
  const columnTasks = tasks.filter(task => task.status === status);
  const colorMap = {
      [Status.TODO]: 'border-t-yellow-500',
      [Status.IN_PROGRESS]: 'border-t-blue-500',
      [Status.COMPLETED]: 'border-t-green-500',
  }

  return (
    <div className="flex-shrink-0 w-80 bg-neutral-light dark:bg-neutral-dark rounded-lg p-3">
      <div className={`p-2 rounded-t-lg border-t-4 ${colorMap[status]}`}>
        <h3 className="font-bold text-neutral-dark dark:text-white">{title} <span className="text-sm font-normal text-secondary dark:text-gray-400">{columnTasks.length}</span></h3>
      </div>
      <div className="mt-4 space-y-3 h-full overflow-y-auto">
        {columnTasks.map(task => <KanbanCard key={task.id} task={task} />)}
      </div>
    </div>
  );
};

export const KanbanBoard: React.FC<{ tasks: Task[] }> = ({ tasks }) => {
  return (
    <div className="flex space-x-4 overflow-x-auto p-2">
      <KanbanColumn title="To Do" tasks={tasks} status={Status.TODO} />
      <KanbanColumn title="In Progress" tasks={tasks} status={Status.IN_PROGRESS} />
      <KanbanColumn title="Completed" tasks={tasks} status={Status.COMPLETED} />
    </div>
  );
};
