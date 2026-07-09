import React, { forwardRef } from 'react';
import { User } from '../types';

interface ClientsPrintTemplateProps {
  clients: any[];
  filters: {
    status: string;
    engagement: string;
    retainerService: string;
    specialService: string;
    staff: string;
  };
  groupBy: string;
  searchQuery: string;
  currentUser: User | null;
  allUsers: any[];
  logoUrl?: string;
}

// ─── Row renderer ────────────────────────────────────────────────────────────

const ClientRow = ({ client, index }: { key?: React.Key; client: any; index: number }) => {
  const services = Array.from(new Set([
    ...Array.from(client.retainerServices || []),
    ...Array.from(client.specialServices || [])
  ])) as string[];

  const staffArr = Array.from(client.staff || []) as string[];

  const isInactive =
    String(client.status || '').toLowerCase().includes('inactive') ||
    (!client.status && !client.isActive);

  return (
    <tr className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
      <td className="px-3 py-2 border-r border-gray-300 font-bold text-gray-900">
        {client.name}
      </td>
      <td className="px-3 py-2 border-r border-gray-300 text-gray-700 font-medium">
        {services.length > 0 ? (
          <div className="flex flex-col gap-0.5">
            {services.map((srv, sIdx) => (
              <span key={sIdx} className="leading-tight">• {srv}</span>
            ))}
          </div>
        ) : (
          <span className="text-gray-400 italic">No active services</span>
        )}
      </td>
      <td className="px-3 py-2 border-r border-gray-300 text-gray-700">
        {staffArr.length > 0 ? (
          <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 font-medium">
            {staffArr.map((staffName, stIdx) => (
              <span key={stIdx} className="bg-gray-100 border border-gray-200 px-1 rounded-[3px] text-[9px]">
                {staffName}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-gray-400 italic">Unassigned</span>
        )}
      </td>
      <td className="px-3 py-2 text-center font-bold">
        <span className={`inline-block px-1.5 py-0.5 rounded-[4px] text-[8px] uppercase tracking-wider border ${
          isInactive
            ? 'bg-gray-100 text-gray-500 border-gray-300'
            : 'bg-emerald-50 text-emerald-700 border-emerald-300'
        }`}>
          {client.status || (client.isActive ? 'Active' : 'Inactive')}
        </span>
      </td>
    </tr>
  );
};

// ─── Group header row ─────────────────────────────────────────────────────────

const GroupHeaderRow = ({ title, count }: { key?: React.Key; title: string; count: number }) => (
  <tr className="bg-gray-200 border-y border-gray-400">
    <td colSpan={4} className="px-3 py-1.5 font-black text-[9px] uppercase tracking-widest text-gray-700">
      {title}
      <span className="ml-2 font-bold text-gray-500">({count})</span>
    </td>
  </tr>
);

// ─── Main component ───────────────────────────────────────────────────────────

export const ClientsPrintTemplate = forwardRef<HTMLDivElement, ClientsPrintTemplateProps>(
  ({ clients, filters, groupBy, searchQuery, currentUser, allUsers, logoUrl }, ref) => {
    const todayStr = new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const formatFilterLabel = (key: string, value: string) => {
      if (!value || value === 'All' || value === 'None') return null;
      return (
        <span key={key} className="inline-block bg-gray-100 text-gray-800 text-[10px] font-semibold px-2 py-0.5 rounded mr-2 mb-1 border border-gray-200">
          <span className="capitalize text-gray-500 font-bold mr-1">{key}:</span>
          {value}
        </span>
      );
    };

    // Build grouped sections — mirrors logic in Clients.tsx renderContent()
    const getAssignedUsers = (client: any) =>
      Array.from(client.staff || []).map((staffStr: any) =>
        allUsers.find((u: any) =>
          u.id === staffStr || u.username === staffStr ||
          u.firstName === staffStr || `${u.firstName} ${u.lastName}` === staffStr
        )
      ).filter(Boolean);

    let sections: { title: string; clients: any[] }[] = [];
    const useGrouping = groupBy !== 'None' && !searchQuery.trim();

    if (useGrouping) {
      if (groupBy === 'Staff') {
        const map = new Map<string, any[]>();
        clients.forEach(c => {
          const users = getAssignedUsers(c);
          if (users.length === 0) {
            map.set('Unassigned', [...(map.get('Unassigned') || []), c]);
          } else {
            users.forEach((u: any) => {
              const name = `${u.firstName} ${u.lastName}`;
              map.set(name, [...(map.get(name) || []), c]);
            });
          }
        });
        sections = Array.from(map.entries())
          .sort((a, b) => a[0] === 'Unassigned' ? 1 : b[0] === 'Unassigned' ? -1 : a[0].localeCompare(b[0]))
          .map(([title, cls]) => ({ title, clients: cls }));

      } else if (groupBy === 'Team') {
        const map = new Map<string, any[]>();
        clients.forEach(c => {
          const users = getAssignedUsers(c);
          const teams = new Set(users.map((u: any) => u.team).filter(Boolean));
          if (teams.size === 0) {
            map.set('No Team', [...(map.get('No Team') || []), c]);
          } else {
            teams.forEach(t => {
              const key = t as string;
              map.set(key, [...(map.get(key) || []), c]);
            });
          }
        });
        sections = Array.from(map.entries())
          .sort((a, b) => a[0] === 'No Team' ? 1 : b[0] === 'No Team' ? -1 : a[0].localeCompare(b[0]))
          .map(([team, cls]) => ({ title: `Team: ${team}`, clients: cls }));

      } else if (groupBy === 'Service' || groupBy === 'RetainerService' || groupBy === 'SpecialService') {
        const map = new Map<string, any[]>();
        clients.forEach(c => {
          const services = new Set([
            ...(groupBy === 'Service' || groupBy === 'RetainerService' ? Array.from(c.retainerServices || []) : []),
            ...(groupBy === 'Service' || groupBy === 'SpecialService' ? Array.from(c.specialServices || []) : [])
          ]);
          if (services.size === 0) {
            map.set('No Active Services', [...(map.get('No Active Services') || []), c]);
          } else {
            services.forEach(s => {
              const key = s as string;
              map.set(key, [...(map.get(key) || []), c]);
            });
          }
        });
        sections = Array.from(map.entries())
          .sort((a, b) => a[0] === 'No Active Services' ? 1 : b[0] === 'No Active Services' ? -1 : a[0].localeCompare(b[0]))
          .map(([service, cls]) => ({ title: service, clients: cls }));
      }
    }

    // Flat table body rows (no grouping)
    const renderFlatRows = () =>
      clients.map((client, index) => (
        <ClientRow key={client.id || index} client={client} index={index} />
      ));

    // Grouped table body rows
    const renderGroupedRows = () =>
      sections.flatMap((section, sIdx) => [
        <GroupHeaderRow key={`header-${sIdx}`} title={section.title} count={section.clients.length} />,
        ...section.clients.map((client, cIdx) => (
          <ClientRow key={`${sIdx}-${client.id || cIdx}`} client={client} index={cIdx} />
        ))
      ]);

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
              size: portrait;
              margin: 15mm 10mm 15mm 10mm !important;
            }
            .print-container {
              padding: 0 !important;
              width: 100% !important;
              max-width: 100% !important;
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
          }
        `}</style>

        {/* Header/Letterhead */}
        <div className="flex justify-between items-start border-b-2 border-red-700 pb-4 mb-5">
          <div className="w-60 h-14 flex items-center">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
            ) : (
              <div className="text-lg font-bold text-red-700 uppercase tracking-tighter leading-none">
                MP Camaso <br /><span className="text-[10px] text-gray-600 font-normal">& Associates</span>
              </div>
            )}
          </div>
          <div className="text-right text-[8px] font-bold leading-tight italic text-gray-700">
            <p>Unit 301, West Insula Building,</p>
            <p>#135 West Avenue Brgy. Bungad, Quezon City</p>
            <p>Tel No. (02) 8800-5413</p>
          </div>
        </div>

        {/* Report Title */}
        <div className="text-center mb-6">
          <h1 className="text-xl font-extrabold uppercase tracking-wider text-gray-900 leading-none">
            Client Directory Report
          </h1>
          <p className="text-[10px] font-bold text-gray-500 mt-1 uppercase">
            Confidential Internal Document
          </p>
        </div>

        {/* Document Metadata & Filters */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3.5 mb-6 text-[10px] flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-gray-500 font-bold uppercase tracking-wider">Generated By</p>
              <p className="text-gray-900 font-bold mt-0.5">
                {currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'System User'}
                {currentUser?.role ? ` (${currentUser.role})` : ''}
              </p>
            </div>
            <div className="text-right">
              <p className="text-gray-500 font-bold uppercase tracking-wider">Date &amp; Time Generated</p>
              <p className="text-gray-900 font-bold mt-0.5">{todayStr}</p>
            </div>
          </div>

          <div className="border-t border-gray-200/60 pt-2 flex flex-wrap items-center">
            <span className="text-gray-500 font-bold uppercase tracking-wider mr-2">Active Filters:</span>
            <div className="flex flex-wrap items-center flex-1">
              {formatFilterLabel('status', filters.status)}
              {formatFilterLabel('engagement', filters.engagement)}
              {filters.engagement === 'Retainer' && formatFilterLabel('retainer service', filters.retainerService)}
              {filters.engagement === 'Special Project' && formatFilterLabel('special service', filters.specialService)}
              {formatFilterLabel('assigned staff', filters.staff)}
              {groupBy && groupBy !== 'None' && formatFilterLabel('group by', groupBy)}
              {searchQuery && formatFilterLabel('search query', searchQuery)}
              {!searchQuery &&
               filters.status === 'All' &&
               filters.engagement === 'All' &&
               filters.staff === 'All' &&
               (!groupBy || groupBy === 'None') && (
                <span className="text-gray-500 italic">None (Displaying All Records)</span>
              )}
            </div>
          </div>

          <div className="border-t border-gray-200/60 pt-2 flex justify-between">
            <div>
              <span className="text-gray-500 font-bold uppercase tracking-wider">Total Records:</span>
              <span className="text-gray-900 font-bold ml-1.5">{clients.length} clients</span>
            </div>
            {useGrouping && sections.length > 0 && (
              <div>
                <span className="text-gray-500 font-bold uppercase tracking-wider">Groups:</span>
                <span className="text-gray-900 font-bold ml-1.5">{sections.length}</span>
              </div>
            )}
          </div>
        </div>

        {/* Compact Table */}
        <div className="overflow-x-visible">
          <table className="w-full text-left text-[10px] leading-tight border border-gray-300">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-300 text-gray-700 font-black uppercase tracking-wider text-[9px]">
                <th className="px-3 py-2 border-r border-gray-300 w-[45%]">Client Entity</th>
                <th className="px-3 py-2 border-r border-gray-300 w-[30%]">Active Services</th>
                <th className="px-3 py-2 border-r border-gray-300 w-[15%]">Assigned Staff</th>
                <th className="px-3 py-2 w-[10%] text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {useGrouping ? renderGroupedRows() : renderFlatRows()}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="mt-8 border-t border-dashed border-gray-300 pt-4 flex justify-between items-center text-[8px] text-gray-500 font-bold uppercase tracking-wider">
          <span>MP Camaso &amp; Associates • Client Directory Report</span>
          <span>Confidential • Internal Use Only</span>
        </div>
      </div>
    );
  }
);

ClientsPrintTemplate.displayName = 'ClientsPrintTemplate';
