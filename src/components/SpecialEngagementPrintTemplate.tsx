import React, { forwardRef } from 'react';

interface Task {
  taskID: string;
  specialID: string;
  taskName: string;
  status: string;
}

interface Activity {
  activityID: string;
  taskID: string;
  description: string;
  dateCompleted: string;
}

interface SpecialEngagement {
  id: string;
  clientId: string;
  clientName: string;
  assignedStaff: string;
  serviceType: string;
  serviceName?: string;
  projectTitle: string;
  startDate: string;
  endDate: string;
  status: string;
  description: string;
}

interface SpecialEngagementPrintTemplateProps {
  engagement: SpecialEngagement | null;
  tasks: Task[];
  activities: Activity[];
  logoUrl?: string;
}

export const SpecialEngagementPrintTemplate = forwardRef<HTMLDivElement, SpecialEngagementPrintTemplateProps>(
  ({ engagement, tasks, activities, logoUrl }, ref) => {
    if (!engagement) return null;

    const formatDisplayDate = (dateStr: string) => {
      if (!dateStr || !dateStr.includes('/')) return dateStr;
      const [m, d, y] = dateStr.split('/');
      const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
      return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    };

    const todayStr = new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    return (
      <div
        ref={ref}
        className="bg-white text-black p-10 font-sans print-container"
        style={{
          fontFamily: 'Arial, sans-serif',
          width: '8.5in',
          minHeight: '11in',
          boxSizing: 'border-box'
        }}
      >
        {/* Print styling overrides */}
        <style>{`
          @media print {
            @page {
              margin: 20mm 15mm 20mm 15mm !important;
            }
            .print-container {
              padding: 0 !important;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            thead {
              display: table-header-group !important;
            }
            tr {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            .print-visible {
              overflow: visible !important;
            }
            .print-keep-together {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
          }
        `}</style>

        {/* Header/Letterhead */}
        <div className="flex justify-between items-start border-b-2 border-red-700 pb-5 mb-6">
          <div className="w-64 h-16 flex items-center">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
            ) : (
              <div className="text-xl font-bold text-red-700 uppercase tracking-tighter leading-none">
                MP Camaso <br />
                <span className="text-xs text-gray-600">& Associates</span>
              </div>
            )}
          </div>
          <div className="text-right text-[10px] text-gray-600 font-bold leading-normal pt-1">
            <p>Unit 301, West Insula Building,</p>
            <p>#135 West Avenue Brgy. Bungad, Quezon City</p>
            <p>Tel No. (02) 8800-5415 | Email: info@mpcamaso.com</p>
          </div>
        </div>

        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black tracking-wider uppercase text-gray-900 leading-none">
            SPECIAL ENGAGEMENT REPORT
          </h1>
          <p className="text-xs text-gray-500 font-bold tracking-widest uppercase mt-2">
            Project Blueprint & Progress History
          </p>
        </div>

        {/* Info Grid - Project Details */}
        <div className="border border-gray-300 rounded-lg p-5 bg-gray-50/50 mb-8 text-[12px]">
          <h2 className="text-sm font-black uppercase text-red-700 border-b border-gray-200 pb-2 mb-4">
            PROJECT DETAILS
          </h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            {/* Left Column */}
            <div className="space-y-2">
              <div className="grid grid-cols-[110px_1fr] gap-x-2">
                <span className="font-bold text-gray-500">Client Name:</span>
                <span className="font-black text-gray-900">{engagement.clientName}</span>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-x-2">
                <span className="font-bold text-gray-500">Project Title:</span>
                <span className="font-black text-gray-900 leading-tight">{engagement.projectTitle}</span>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-x-2">
                <span className="font-bold text-gray-500">Service Type:</span>
                <span className="font-semibold text-gray-800">
                  {engagement.serviceName || engagement.serviceType}
                </span>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-x-2">
                <span className="font-bold text-gray-500">Assigned Staff:</span>
                <span className="font-semibold text-gray-800">{engagement.assignedStaff}</span>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-2">
              <div className="grid grid-cols-[110px_1fr] gap-x-2">
                <span className="font-bold text-gray-500">Project Status:</span>
                <span className="font-black text-red-700 uppercase">{engagement.status}</span>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-x-2">
                <span className="font-bold text-gray-500">Start Date:</span>
                <span className="font-semibold text-gray-800">{formatDisplayDate(engagement.startDate) || 'N/A'}</span>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-x-2">
                <span className="font-bold text-gray-500">Target Date:</span>
                <span className="font-semibold text-gray-800">{formatDisplayDate(engagement.endDate) || 'N/A'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Project Description */}
        <div className="border border-gray-300 rounded-lg p-4 mb-8 text-[12px]">
          <h2 className="text-sm font-black uppercase text-red-700 border-b border-gray-200 pb-1.5 mb-2">
            PROJECT DESCRIPTION / BRIEF
          </h2>
          <p className="text-gray-700 leading-relaxed font-medium italic">
            {engagement.description || 'No description provided for this project.'}
          </p>
        </div>

        {/* Tasks and Activities Log */}
        <div className="mb-10 text-[12px] print-visible">
          <h2 className="text-sm font-black uppercase text-red-700 border-b-2 border-gray-300 pb-1.5 mb-4">
            MILESTONES & PROGRESS HISTORY
          </h2>

          {tasks.length === 0 ? (
            <p className="text-center py-6 text-gray-400 italic">No tasks or milestones recorded for this project.</p>
          ) : (
            <div className="space-y-6 print-visible">
              {tasks.map((task) => {
                const taskActivities = activities
                  .filter((a) => a.taskID === task.taskID)
                  .sort((a, b) => {
                    const timeA = new Date(a.dateCompleted).getTime();
                    const timeB = new Date(b.dateCompleted).getTime();
                    return timeA - timeB;
                  });

                return (
                  <div key={task.taskID} className="border border-gray-200 rounded-lg overflow-hidden print-visible">
                    {/* Task Header */}
                    <div className="bg-gray-100/80 px-4 py-2 flex justify-between items-center border-b border-gray-200">
                      <span className="font-black text-gray-800 uppercase tracking-tight">{task.taskName}</span>
                      <span
                        className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${
                          task.status === 'Completed'
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                        }`}
                      >
                        {task.status}
                      </span>
                    </div>

                    {/* Task Activities */}
                    <div className="p-3 print-visible">
                      {taskActivities.length === 0 ? (
                        <p className="text-[11px] text-gray-400 italic pl-2 py-1">No progress logged for this task.</p>
                      ) : (
                        <table className="w-full text-left border-collapse text-[11px]">
                          <thead>
                            <tr className="border-b border-gray-200 text-gray-500 font-bold uppercase">
                              <th className="py-1 w-32">Date Completed</th>
                              <th className="py-1">Progress Description</th>
                            </tr>
                          </thead>
                          <tbody>
                            {taskActivities.map((act) => (
                              <tr key={act.activityID} className="border-b border-gray-100 last:border-0">
                                <td className="py-2 pr-4 font-bold text-gray-600">
                                  {formatDisplayDate(act.dateCompleted)}
                                </td>
                                <td className="py-2 text-gray-800 leading-normal">{act.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Signatures Footer */}
        <div className="mt-16 pt-8 border-t border-gray-200 grid grid-cols-3 gap-8 text-[11px] text-center font-bold print-keep-together">
          <div>
            <div className="border-b border-black pb-8 text-gray-800 font-normal">
              {engagement.assignedStaff}
            </div>
            <p className="mt-1 uppercase text-[9px] tracking-wider text-gray-500">Prepared By</p>
          </div>
          <div>
            <div className="border-b border-black pb-8 text-gray-800 font-normal">
              &nbsp;
            </div>
            <p className="mt-1 uppercase text-[9px] tracking-wider text-gray-500">Reviewed By</p>
          </div>
          <div>
            <div className="border-b border-black pb-8 text-gray-800 font-normal">
              &nbsp;
            </div>
            <p className="mt-1 uppercase text-[9px] tracking-wider text-gray-500">Client Acknowledged</p>
          </div>
        </div>

        {/* Document Metadata */}
        <div className="mt-8 text-right text-[8px] text-gray-400 font-bold print-keep-together">
          Generated on: {todayStr} | MP Camaso & Associates CRM
        </div>
      </div>
    );
  }
);

SpecialEngagementPrintTemplate.displayName = 'SpecialEngagementPrintTemplate';
