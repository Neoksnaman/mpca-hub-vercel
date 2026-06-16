import React, { useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../App';
import { 
    CheckCircle, 
    Briefcase, 
    AlertTriangle, 
    TrendingUp, 
    Users, 
    Building2,
    Calendar,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import { 
    BarChart, 
    Bar, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    ResponsiveContainer,
    Cell,
    LabelList,
} from 'recharts';
import { Client, ProjectTask, RetainerEngagement, SpecialEngagement, UserRole } from '../types';

const normalizeId = (id: any) => String(id || '').trim().replace(/^0+/, '') || '0';

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const parseRetainerStartDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    const date = dateStr.includes('/')
        ? (() => {
            const [m, d, y] = dateStr.split('/');
            return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
        })()
        : dateStr.includes('-')
            ? (() => {
                const [y, m, d] = dateStr.split('-');
                return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
            })()
            : new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
};

const isPeriodBeforeRetainerStart = (startDate: string, monthName: string, year: string | number) => {
    const start = parseRetainerStartDate(startDate);
    const monthIndex = months.indexOf(monthName);
    const periodYear = Number(year);
    if (!start || monthIndex === -1 || Number.isNaN(periodYear)) return false;

    const startKey = start.getFullYear() * 12 + start.getMonth();
    const periodKey = periodYear * 12 + monthIndex;
    return periodKey < startKey;
};

const computeActualDueDate = (monthStr: string, yearStr: string, code: string, fiscalYearEnd: string) => {
    const monthIndex = months.indexOf(monthStr);
    if (monthIndex === -1) return { formatted: 'N/A', raw: new Date() };

    const match = String(code || '').trim().match(/^(SM|[MQYA])([+-])([+-]?\d+)([DM])$/i);
    if (!match) return { formatted: 'N/A', raw: new Date() };

    const type = match[1].toUpperCase();
    const offsetSign = match[2] === '-' ? -1 : 1;
    const signedValue = parseInt(match[3], 10);
    const val = Math.abs(signedValue) * (signedValue < 0 ? -1 : offsetSign);
    const unit = match[4].toUpperCase();

    const year = parseInt(yearStr);
    let date: Date;

    if (type === 'M' || type === 'Q' || type === 'SM') {
        date = new Date(year, monthIndex + 1, 0);
    } else {
        const [fyM, fyD] = (fiscalYearEnd || '12/31').split('/').map(Number);
        date = new Date(year, fyM - 1, fyD);
    }

    date.setHours(12, 0, 0, 0);

    if (unit === 'D') {
        date.setDate(date.getDate() + val);
    } else if (unit === 'M') {
        const targetMonth = date.getMonth() + val;
        date = new Date(date.getFullYear(), targetMonth + 1, 0);
    }

    const dayOfWeek = date.getDay();
    if (dayOfWeek === 6) date.setDate(date.getDate() + 2);
    else if (dayOfWeek === 0) date.setDate(date.getDate() + 1);

    return {
        formatted: date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        raw: date
    };
};

const Dashboard: React.FC = () => {
    const context = useContext(AppContext);
    const theme = context?.theme || 'light';
    const navigate = useNavigate();
    const user = context?.user;
    const clients = context?.clients || [];
    const retainers = context?.retainers || [];
    const specials = context?.specials || [];
    const deadlines = context?.deadlines || [];
    const retainerLogs = context?.retainerLogs || [];
    const allUsers = context?.allUsers || [];

    const [selectedPeriod, setSelectedPeriod] = useState(() => {
        const date = new Date();
        date.setMonth(date.getMonth() - 1);
        date.setDate(1);
        date.setHours(12, 0, 0, 0);
        return date;
    });
    const currentMonth = selectedPeriod.toLocaleString('default', { month: 'long' });
    const currentYear = String(selectedPeriod.getFullYear());

    const shiftPeriod = (monthDelta: number) => {
        setSelectedPeriod(prev => {
            const next = new Date(prev);
            next.setMonth(next.getMonth() + monthDelta);
            next.setDate(1);
            next.setHours(12, 0, 0, 0);
            return next;
        });
    };

    const resetPeriod = () => {
        const date = new Date();
        date.setMonth(date.getMonth() - 1);
        date.setDate(1);
        date.setHours(12, 0, 0, 0);
        setSelectedPeriod(date);
    };

    const dashboardData = useMemo(() => {
        const userByKey = new Map<string, any>();
        allUsers.forEach(u => {
            userByKey.set(String(u.id), u);
            userByKey.set(u.firstName, u);
            userByKey.set(`${u.firstName} ${u.lastName}`, u);
        });
        const retainerById = new Map<string, RetainerEngagement>(retainers.map(r => [normalizeId(r.id), r]));
        const clientById = new Map<string, Client>(clients.map(c => [normalizeId(c.id), c]));
        const retainerLogsByDeadlinePeriod = new Map(retainerLogs.map(l => [`${normalizeId(l[0])}|${l[1]}`, l]));
        const taskById = new Map<string, ProjectTask>((context?.taskLog || []).map(t => [normalizeId(t.taskID), t]));
        const specialById = new Map<string, SpecialEngagement>(specials.map(s => [normalizeId(s.id), s]));
        const taxById = new Map<string, any>((context?.taxCompliances || []).map((t: any) => [normalizeId(t.taxID), t]));
        const serviceById = new Map<string, any>((context?.services || []).map((s: any) => [normalizeId(s.id), s]));

        // Filter helper for RBAC
        const isVisible = (assignedStaffStr: string | undefined) => {
            if (!user) return false;
            // Admins, Managers, and Supervisors see everything
            if (user.role === UserRole.ADMIN || user.role === UserRole.MANAGER || user.role === UserRole.SUPERVISOR) return true;
            if (!assignedStaffStr) return false;

            const staffNames = assignedStaffStr.split(',').map(s => s.trim());
            return staffNames.some(staffName => {
                const staffUser = userByKey.get(staffName);
                if (!staffUser) return false;

                // Seniors see their team
                if (user.role === UserRole.SENIOR) {
                    return staffUser.team === user.team;
                }

                // Staff see only their own
                return staffUser.id === user.id;
            });
        };

        const activeInstances = deadlines.map(d => {
            const retainer = retainerById.get(normalizeId(d.retainerID));
            if (!retainer || retainer.engagementStatus === 'Inactive') return null;

            // RBAC Check
            if (!isVisible(retainer.assignedStaff)) return null;

            const client = clientById.get(normalizeId(retainer.clientId));
            if (!client || client.status === 'Inactive') return null;
            if (isPeriodBeforeRetainerStart(retainer.startDate, currentMonth, currentYear)) return null;
            
            const frequency = d.dueDate.startsWith('M') ? 'Monthly' : d.dueDate.startsWith('Q') ? 'Quarterly' : (d.dueDate.startsWith('Y') || d.dueDate.startsWith('A')) ? 'Annual' : 'Monthly';
            const calendarOnlyTaxIDs = ['0007', '0008', '0012', '0013', '0016', '0017', '0018', '0019', '0020', '0021', '0022'].map(id => normalizeId(id));
            const isCalendarOnly = calendarOnlyTaxIDs.includes(normalizeId(d.taxID));
            const fyMonth = isCalendarOnly ? 12 : (client?.fiscalYearEnd ? parseInt(client.fiscalYearEnd.split('/')[0]) : 12);
            const monthIdx = months.indexOf(currentMonth) + 1;

            if (frequency === 'Quarterly') {
                const diff = (monthIdx - fyMonth + 12) % 3;
                if (diff !== 0) return null;
                if (['0009', '0010', '0014', '0015'].map(id => normalizeId(id)).includes(normalizeId(d.taxID)) && monthIdx === fyMonth) return null;
            } else if (frequency === 'Annual' && monthIdx !== fyMonth) return null;
            if (['1', '2'].includes(normalizeId(d.taxID)) && [3, 6, 9, 12].includes(monthIdx)) return null;

            const periodKey = `${String(monthIdx).padStart(2, '0')}/${currentYear}`;
            const log = retainerLogsByDeadlinePeriod.get(`${normalizeId(d.deadlineID)}|${periodKey}`);
            const dueInfo = computeActualDueDate(currentMonth, currentYear, d.dueDate, isCalendarOnly ? '12/31' : (client?.fiscalYearEnd || '12/31'));

            let status = 'Pending';
            if (log && log[2]) {
                const [lm, ld, ly] = log[2].split('/');
                const filedDate = new Date(parseInt(ly), parseInt(lm) - 1, parseInt(ld));
                filedDate.setHours(12, 0, 0, 0);
                const compareDue = new Date(dueInfo.raw);
                compareDue.setHours(12, 0, 0, 0);
                status = filedDate > compareDue ? 'LATE' : 'Filed';
            }
            const tax = d.taxID ? taxById.get(normalizeId(d.taxID)) : null;
            const service = !d.taxID ? serviceById.get(normalizeId(d.serviceID)) : null;

            return {
                id: d.deadlineID,
                status,
                staff: retainer.assignedStaff,
                clientName: client.name,
                title: tax?.complianceName || service?.name || 'General Compliance',
                dueDate: dueInfo.formatted,
                rawDueDate: dueInfo.raw
            };
        }).filter(Boolean);

        const filingStats = activeInstances.reduce((acc, i) => {
            acc.total += 1;
            if (i!.status === 'Filed') acc.filed += 1;
            else if (i!.status === 'LATE') acc.late += 1;
            else if (i!.status === 'Pending') acc.pending += 1;
            return acc;
        }, { total: 0, filed: 0, late: 0, pending: 0 });

        const activeInstanceCountByStaff = new Map<string, number>();
        activeInstances.forEach(i => {
            if (!i) return;
            activeInstanceCountByStaff.set(i.staff, (activeInstanceCountByStaff.get(i.staff) || 0) + 1);
        });

        const activeSpecialCountByStaff = new Map<string, number>();
        let activeSpecialsCount = 0;
        let blockedSpecialsCount = 0;
        let overdueSpecialsCount = 0;
        const today = new Date();
        today.setHours(12, 0, 0, 0);
        specials.forEach(s => {
            if (!isVisible(s.assignedStaff)) return;
            if (s.status === 'In Progress') {
                activeSpecialsCount++;
                activeSpecialCountByStaff.set(s.assignedStaff, (activeSpecialCountByStaff.get(s.assignedStaff) || 0) + 1);
            } else if (s.status === 'Blocked') {
                blockedSpecialsCount++;
            }
            if (s.status !== 'Completed' && s.endDate) {
                const [m, d, y] = s.endDate.split('/');
                const endDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
                endDate.setHours(23, 59, 59, 999);
                if (today > endDate) overdueSpecialsCount++;
            }
        });

        const staffWorkload = allUsers.filter(u => u.status === 'Active' && u.role !== UserRole.ADMIN).filter(u => {
            // In staff view, only show themselves. In Senior view, show team.
            if (user?.role === UserRole.STAFF) return u.id === user.id;
            if (user?.role === UserRole.SENIOR) return u.team === user.team;
            return true;
        }).map(u => {
            const name = `${u.firstName} ${u.lastName}`;
            const retainerCount = (activeInstanceCountByStaff.get(name) || 0) + (activeInstanceCountByStaff.get(u.firstName) || 0);
            const specialCount = (activeSpecialCountByStaff.get(name) || 0) + (activeSpecialCountByStaff.get(u.firstName) || 0);
            return { name: u.firstName, engagements: retainerCount + specialCount };
        }).sort((a, b) => b.engagements - a.engagements);

        const visibleRetainerClientIds = new Set<string>();
        retainers.forEach(r => {
            if (isVisible(r.assignedStaff)) visibleRetainerClientIds.add(normalizeId(r.clientId));
        });
        const visibleRetainerClients = clients.filter(c => c.status === 'Active' && visibleRetainerClientIds.has(normalizeId(c.id)));
        const entityCounts = new Map<string, number>();
        visibleRetainerClients.forEach(c => {
            const type = c.entityType || 'Other';
            entityCounts.set(type, (entityCounts.get(type) || 0) + 1);
        });

        // 5. Recent Activity Log (Feed)
        const recentActivityRows = context?.activityLog?.map(activity => {
            const task = taskById.get(normalizeId(activity.taskID));
            if (!task) return null;
            const special = specialById.get(normalizeId(task.specialID));
            if (!special || !isVisible(special.assignedStaff)) return null;

            return {
                id: activity.activityID,
                date: activity.dateCompleted,
                description: activity.description,
                clientName: clientById.get(normalizeId(special.clientId))?.name || 'Unknown Client',
                projectTitle: special.projectTitle,
                status: special.status,
                specialId: special.id
            };
        }).filter(Boolean).sort((a, b) => {
            const dateA = new Date(a!.date).getTime();
            const dateB = new Date(b!.date).getTime();
            return dateB - dateA;
        });

        const activityByProject = new Map<string, any>();
        recentActivityRows.forEach((activity: any) => {
            const existing = activityByProject.get(activity.specialId);
            if (!existing) {
                activityByProject.set(activity.specialId, { ...activity, activityCount: 1 });
            } else {
                existing.activityCount += 1;
            }
        });
        const recentActivity = Array.from(activityByProject.values()).slice(0, 5);

        const lateCompliances = activeInstances.filter(i => i?.status === 'LATE').length;

        const needsAttention = [
            {
                label: 'Late Compliances',
                value: lateCompliances,
                description: 'Filed after deadline or still marked late',
                tone: 'rose',
                icon: AlertTriangle,
                path: '/retainers'
            },
            {
                label: 'Blocked Projects',
                value: blockedSpecialsCount,
                description: 'Special projects that need unblock action',
                tone: 'red',
                icon: AlertTriangle,
                path: '/special-projects'
            },
            {
                label: 'Overdue Projects',
                value: overdueSpecialsCount,
                description: 'Open special projects past target date',
                tone: 'blue',
                icon: Briefcase,
                path: '/special-projects'
            }
        ];

        return {
            filingStats,
            totalRetainerClients: visibleRetainerClients.length,
            entityDistribution: Array.from(entityCounts.entries()).map(([name, value]) => ({ name, value })),
            activeSpecials: activeSpecialsCount,
            blockedSpecials: blockedSpecialsCount,
            overdueSpecials: overdueSpecialsCount,
            staffWorkload,
            recentActivity,
            needsAttention
        };
    }, [clients, retainers, specials, deadlines, retainerLogs, allUsers, currentMonth, currentYear, user, context?.activityLog, context?.taskLog, context?.taxCompliances, context?.services]);

    const filingRate = dashboardData.filingStats.total > 0 ? Math.round((dashboardData.filingStats.filed / dashboardData.filingStats.total) * 100) : 100;
    const topWorkload = dashboardData.staffWorkload.slice(0, 8);
    const hiddenWorkloadCount = Math.max(0, dashboardData.staffWorkload.length - topWorkload.length);
    const hasDashboardData = dashboardData.filingStats.total > 0 || dashboardData.staffWorkload.length > 0 || dashboardData.activeSpecials > 0;
    const chartLoadKey = hasDashboardData ? 'ready' : 'loading';

    return (
        <div className="w-full mx-auto p-2 space-y-3 animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 px-1">
                <div className="space-y-0.5">
                    <div className="flex items-center gap-2.5">
                        <div className="w-1.5 h-7 bg-primary rounded-full" />
                        <h1 className="text-3xl font-black text-neutral-dark dark:text-white tracking-tight">Dashboard</h1>
                    </div>
                    <p className="text-sm text-secondary dark:text-gray-300 font-medium pl-4 opacity-70 dark:opacity-100">Performance overview for {currentMonth} {currentYear}</p>
                </div>
                <div className="flex items-center gap-2 bg-white dark:bg-gray-800 p-1 rounded-xl border border-neutral-medium dark:border-gray-700 shadow-sm">
                    <button
                        onClick={() => shiftPeriod(-1)}
                        className="p-2 rounded-lg text-secondary hover:text-primary hover:bg-neutral-light dark:hover:bg-gray-700 transition-colors"
                        title="Previous month"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <div className="flex items-center gap-2 px-3 py-1.5 min-w-[150px] justify-center">
                        <Calendar size={14} className="text-primary" />
                        <span className="text-[11px] font-black text-neutral-dark dark:text-white uppercase tracking-widest">{currentMonth} {currentYear}</span>
                    </div>
                    <button
                        onClick={() => shiftPeriod(1)}
                        className="p-2 rounded-lg text-secondary hover:text-primary hover:bg-neutral-light dark:hover:bg-gray-700 transition-colors"
                        title="Next month"
                    >
                        <ChevronRight size={16} />
                    </button>
                    <button
                        onClick={resetPeriod}
                        className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-secondary hover:text-primary hover:bg-neutral-light dark:hover:bg-gray-700 transition-colors"
                    >
                        Latest
                    </button>
                </div>
            </div>

            {/* Snapshot and Needs Attention */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm shadow-neutral-dark/5 overflow-hidden">
                    <div className="px-4 py-3 border-b border-neutral-medium/60 dark:border-gray-700">
                        <h3 className="text-sm font-black text-neutral-dark dark:text-white">Snapshot</h3>
                        <p className="text-[11px] font-bold text-secondary/70 dark:text-gray-400">Monthly operating overview</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-neutral-medium/50 dark:divide-gray-700">
                        {[
                            { label: 'Retainer Clients', value: dashboardData.totalRetainerClients, helper: 'Active retainers', icon: Building2, color: 'text-blue-600', bg: 'bg-blue-500/10', path: '/clients', state: { activeTab: 'Retainer' } },
                            { label: 'Filed Rate', value: `${filingRate}%`, helper: `${dashboardData.filingStats.filed}/${dashboardData.filingStats.total} filed`, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-500/10', path: '/retainers' },
                            { label: 'Active Projects', value: dashboardData.activeSpecials, helper: 'In progress', icon: Briefcase, color: 'text-amber-600', bg: 'bg-amber-500/10', path: '/special-projects' },
                        ].map((stat: any) => (
                            <button
                                key={stat.label}
                                onClick={() => stat.path && navigate(stat.path, { state: stat.state })}
                                className={`text-left p-3 group ${stat.path ? 'cursor-pointer hover:bg-neutral-light/50 dark:hover:bg-gray-900/40' : 'cursor-default'} transition-colors`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <p className="text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest">{stat.label}</p>
                                        <p className="text-2xl font-black text-neutral-dark dark:text-white mt-1 leading-none">{stat.value}</p>
                                    </div>
                                    <div className={`p-2 rounded-xl ${stat.bg} ${stat.color}`}>
                                        <stat.icon size={15} />
                                    </div>
                                </div>
                                <p className="text-[10px] font-bold text-secondary/70 dark:text-gray-400 mt-2 leading-snug">{stat.helper}</p>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm shadow-neutral-dark/5 overflow-hidden">
                    <div className="px-4 py-3 border-b border-neutral-medium/60 dark:border-gray-700 flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-black text-neutral-dark dark:text-white">Needs Attention</h3>
                            <p className="text-[11px] font-bold text-secondary/70 dark:text-gray-400">Items that may need action before routine reporting</p>
                        </div>
                        <AlertTriangle size={18} className="text-primary/60" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-neutral-medium/50 dark:divide-gray-700">
                        {dashboardData.needsAttention.map((item: any) => {
                            const shortLabel = item.label.replace(' Compliances', '').replace(' Projects', '');
                            const helper = item.value === 0
                                ? 'Clear this month'
                                : item.label === 'Late Compliances'
                                    ? 'Past deadline'
                                    : item.label === 'Blocked Projects'
                                        ? 'Needs unblock action'
                                        : 'Past target date';
                            const Icon = item.value === 0 ? CheckCircle : item.icon;
                            const tone = item.value === 0
                                ? 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                                : item.tone === 'rose'
                                    ? 'bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20'
                                    : item.tone === 'blue'
                                        ? 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20'
                                        : 'bg-red-50 text-red-600 border-red-100 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20';

                            return (
                                <button
                                    key={item.label}
                                    onClick={() => navigate(item.path)}
                                    className="text-left p-3 hover:bg-neutral-light/50 dark:hover:bg-gray-900/40 transition-colors group"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <p className="text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest">{shortLabel}</p>
                                            <p className="text-2xl font-black text-neutral-dark dark:text-white mt-1 leading-none">{item.value}</p>
                                        </div>
                                        <div className={`p-2 rounded-xl border ${tone}`}>
                                            <Icon size={15} />
                                        </div>
                                    </div>
                                    <p className="text-[10px] font-bold text-secondary/70 dark:text-gray-400 mt-2 leading-snug">{helper}</p>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Charts & Resources Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* Filing Distribution Chart */}
                <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm shadow-neutral-dark/5">
                    <div className="flex items-center justify-between mb-5">
                        <div className="space-y-1">
                            <h3 className="text-base font-black text-neutral-dark dark:text-white tracking-tight">Compliance Health</h3>
                            <p className="text-xs text-secondary dark:text-gray-400 font-medium opacity-100">
                                {dashboardData.filingStats.filed} filed, {dashboardData.filingStats.pending} pending, {dashboardData.filingStats.late} late
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-2xl font-black text-neutral-dark dark:text-white leading-none">{filingRate}%</p>
                            <p className="text-[10px] font-black uppercase tracking-widest text-secondary dark:text-gray-400 mt-1">Filed Rate</p>
                        </div>
                    </div>
                    <div className="h-[260px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart key={`compliance-${chartLoadKey}`} data={[
                                { name: 'Filed', count: dashboardData.filingStats.filed, color: '#10B981' },
                                { name: 'Pending', count: dashboardData.filingStats.pending, color: '#F59E0B' },
                                { name: 'Late', count: dashboardData.filingStats.late, color: '#EF4444' }
                            ]}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#374151' : '#E5E7EB'} />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: theme === 'dark' ? '#9CA3AF' : '#6B7280' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: theme === 'dark' ? '#9CA3AF' : '#6B7280' }} />
                                <Tooltip cursor={{ fill: theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }} content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        return (
                                            <div className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-neutral-dark/95'} backdrop-blur-md px-4 py-3 rounded-2xl border ${theme === 'dark' ? 'border-gray-700' : 'border-white/10'} shadow-2xl`}>
                                                <p className={`text-[10px] font-black ${theme === 'dark' ? 'text-gray-400' : 'text-white/60'} uppercase tracking-widest mb-1`}>{payload[0].payload.name}</p>
                                                <p className={`text-xl font-black ${theme === 'dark' ? 'text-white' : 'text-white'}`}>{payload[0].value} Compliances</p>
                                            </div>
                                        );
                                    }
                                    return null;
                                }} />
                                <Bar dataKey="count" radius={[8, 8, 8, 8]} barSize={60}>
                                    {[0, 1, 2].map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={index === 0 ? '#10B981' : index === 1 ? '#F59E0B' : '#EF4444'} fillOpacity={0.8} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Resource Management Chart */}
                <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm shadow-neutral-dark/5">
                    <div className="flex items-center justify-between mb-5 px-1">
                        <div className="space-y-1">
                            <h3 className="text-base font-black text-neutral-dark dark:text-white tracking-tight">Resource Management</h3>
                            <p className="text-xs text-secondary dark:text-gray-400 font-medium opacity-100">
                                Top workload this month{hiddenWorkloadCount > 0 ? `, ${hiddenWorkloadCount} more in reports` : ''}
                            </p>
                        </div>
                        <Users size={20} className="text-primary opacity-50" />
                    </div>
                    <div style={{ height: '300px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart 
                                key={`workload-${chartLoadKey}`}
                                layout="vertical" 
                                data={topWorkload}
                                margin={{ left: 0, right: 42, top: 0, bottom: 10 }}
                            >
                                <defs>
                                    <linearGradient id="lowLoad" x1="0" y1="0" x2="1" y2="0">
                                        <stop offset="0%" stopColor="#FDA4AF" />
                                        <stop offset="100%" stopColor="#FB7185" />
                                    </linearGradient>
                                    <linearGradient id="medLoad" x1="0" y1="0" x2="1" y2="0">
                                        <stop offset="0%" stopColor="#FB7185" />
                                        <stop offset="100%" stopColor="#F43F5E" />
                                    </linearGradient>
                                    <linearGradient id="highLoad" x1="0" y1="0" x2="1" y2="0">
                                        <stop offset="0%" stopColor="#F43F5E" />
                                        <stop offset="100%" stopColor="#B4262A" />
                                    </linearGradient>
                                </defs>
                                <XAxis 
                                    type="number" 
                                    orientation="top"
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fontSize: 9, fontWeight: 900, fill: theme === 'dark' ? '#9CA3AF' : '#6B7280' }}
                                />
                                <YAxis 
                                    dataKey="name" 
                                    type="category" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    width={70}
                                    tick={{ fontSize: 9, fontWeight: 900, fill: theme === 'dark' ? '#9CA3AF' : '#6B7280' }} 
                                />
                                <Tooltip 
                                    cursor={{ fill: theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }} 
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            return (
                                                <div className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-neutral-dark/95'} backdrop-blur-md px-3 py-2 rounded-xl border ${theme === 'dark' ? 'border-gray-700' : 'border-white/10'} shadow-2xl`}>
                                                    <p className={`text-[9px] font-black ${theme === 'dark' ? 'text-gray-400' : 'text-white/60'} uppercase tracking-widest mb-0.5`}>{payload[0].payload.name}</p>
                                                    <p className={`text-sm font-black ${theme === 'dark' ? 'text-white' : 'text-white'}`}>{payload[0].value} Engagements</p>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }} 
                                />
                                <Bar 
                                    dataKey="engagements" 
                                    radius={[0, 4, 4, 0]} 
                                    barSize={12}
                                    animationDuration={1000}
                                >
                                    <LabelList dataKey="engagements" position="right" className="text-[10px] font-black fill-secondary dark:fill-gray-300" />
                                    {topWorkload.map((entry, index) => {
                                        let gradientId = "lowLoad";
                                        if (entry.engagements > 12) gradientId = "highLoad";
                                        else if (entry.engagements > 6) gradientId = "medLoad";
                                        return <Cell key={`cell-${index}`} fill={`url(#${gradientId})`} />;
                                    })}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Full Width Activity Log */}
            <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm shadow-neutral-dark/5">
                <div className="flex items-center justify-between mb-4">
                    <div className="space-y-1">
                        <h3 className="text-base font-black text-neutral-dark dark:text-white tracking-tight">Recent Project Updates</h3>
                        <p className="text-xs text-secondary dark:text-gray-300 font-medium opacity-100">Latest progress grouped by Special Project</p>
                    </div>
                    <div className="flex items-center gap-4">
                         <button onClick={() => navigate('/special-projects')} className="px-3 py-2 bg-neutral-light dark:bg-gray-900 rounded-xl text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest hover:bg-primary hover:text-white transition-all">
                            View All
                        </button>
                    </div>
                </div>
                
                <div className="divide-y divide-neutral-medium/50 dark:divide-gray-700">
                    {dashboardData.recentActivity.length > 0 ? (
                        dashboardData.recentActivity.map((activity: any, i) => (
                            <div 
                                key={i} 
                                onClick={() => navigate('/special-projects', { state: { specialId: activity.specialId } })}
                                className="flex gap-3 group relative py-3 cursor-pointer hover:bg-neutral-light/50 dark:hover:bg-gray-700/50 transition-colors"
                            >
                                <div className="relative z-10">
                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 ${
                                        activity.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-600' :
                                        activity.status === 'Blocked' ? 'bg-rose-500/10 text-rose-600' :
                                        'bg-blue-500/10 text-blue-600'
                                    }`}>
                                        <Briefcase size={17} />
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <h4 className="text-sm font-black text-neutral-dark dark:text-white truncate tracking-tight">{activity.projectTitle}</h4>
                                            {activity.activityCount > 1 && (
                                                <span className="shrink-0 px-2 py-0.5 rounded-full bg-primary/5 border border-primary/10 text-[8px] font-black uppercase tracking-widest text-primary">
                                                    {activity.activityCount} updates
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-neutral-light dark:bg-gray-700 rounded-md shrink-0">
                                            <Calendar size={10} className="text-secondary dark:text-gray-400" />
                                            <span className="text-[9px] font-black text-secondary dark:text-gray-300 uppercase tracking-tighter opacity-100">{activity.date}</span>
                                        </div>
                                    </div>
                                    <p className="text-xs font-bold text-secondary dark:text-gray-400 mb-2 leading-relaxed line-clamp-2">{activity.description}</p>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Building2 size={12} className="text-primary opacity-40" />
                                            <span className="text-[10px] font-black text-secondary/60 dark:text-gray-300 uppercase tracking-widest truncate max-w-[200px]">{activity.clientName}</span>
                                        </div>
                                        <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${
                                            activity.status === 'Completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' :
                                            activity.status === 'Blocked' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400' :
                                            'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'
                                        }`}>
                                            {activity.status}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-10 opacity-30 italic text-sm">No recent activity found</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
