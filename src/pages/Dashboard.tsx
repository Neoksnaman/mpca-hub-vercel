import React, { useContext, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../App';
import { 
    CheckCircle, 
    Briefcase, 
    FileText, 
    AlertTriangle, 
    TrendingUp, 
    Users, 
    Clock, 
    ArrowUpRight,
    Building2,
    Calendar
} from 'lucide-react';
import { 
    BarChart, 
    Bar, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    Legend, 
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    LabelList,
    AreaChart,
    Area
} from 'recharts';
import { UserRole } from '../types';

const normalizeId = (id: any) => String(id || '').trim().replace(/^0+/, '') || '0';

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const computeActualDueDate = (monthStr: string, yearStr: string, code: string, fiscalYearEnd: string) => {
    const monthIndex = months.indexOf(monthStr);
    if (monthIndex === -1) return { formatted: 'N/A', raw: new Date() };

    const match = code.match(/([MQYA])\+(\d+)([DM])/);
    if (!match) return { formatted: 'N/A', raw: new Date() };

    const type = match[1];
    const val = parseInt(match[2]);
    const unit = match[3];

    const year = parseInt(yearStr);
    let date: Date;

    if (type === 'M' || type === 'Q') {
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

    const currentMonth = new Date(new Date().setMonth(new Date().getMonth() - 1)).toLocaleString('default', { month: 'long' });
    const currentYear = String(new Date().getFullYear());

    const dashboardData = useMemo(() => {
        // Filter helper for RBAC
        const isVisible = (assignedStaffStr: string | undefined) => {
            if (!user) return false;
            // Admins, Managers, and Supervisors see everything
            if (user.role === UserRole.ADMIN || user.role === UserRole.MANAGER || user.role === UserRole.SUPERVISOR) return true;
            if (!assignedStaffStr) return false;

            const staffNames = assignedStaffStr.split(',').map(s => s.trim());
            return staffNames.some(staffName => {
                const staffUser = allUsers.find(u => 
                    u.id === staffName || 
                    `${u.firstName} ${u.lastName}` === staffName || 
                    u.firstName === staffName
                );
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
            const retainer = retainers.find(r => normalizeId(r.id) === normalizeId(d.retainerID));
            if (!retainer || retainer.engagementStatus === 'Inactive') return null;

            // RBAC Check
            if (!isVisible(retainer.assignedStaff)) return null;

            const client = clients.find(c => normalizeId(c.id) === normalizeId(retainer.clientId));
            if (!client || client.status === 'Inactive') return null;
            
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
            const log = retainerLogs.find(l => normalizeId(l[0]) === normalizeId(d.deadlineID) && l[1] === periodKey);
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
            return { id: d.deadlineID, status, staff: retainer.assignedStaff };
        }).filter(Boolean);

        const filingStats = {
            total: activeInstances.length,
            filed: activeInstances.filter(i => i!.status === 'Filed').length,
            late: activeInstances.filter(i => i!.status === 'LATE').length,
            pending: activeInstances.filter(i => i!.status === 'Pending').length
        };

        const staffWorkload = allUsers.filter(u => u.status === 'Active' && u.role !== UserRole.ADMIN).filter(u => {
            // In staff view, only show themselves. In Senior view, show team.
            if (user?.role === UserRole.STAFF) return u.id === user.id;
            if (user?.role === UserRole.SENIOR) return u.team === user.team;
            return true;
        }).map(u => {
            const name = `${u.firstName} ${u.lastName}`;
            const retainerCount = activeInstances.filter(i => i!.staff === name || i!.staff === u.firstName).length;
            const specialCount = specials.filter(s => (s.assignedStaff === name || s.assignedStaff === u.firstName) && s.status === 'In Progress').length;
            return { name: u.firstName, engagements: retainerCount + specialCount };
        }).sort((a, b) => b.engagements - a.engagements);

        // Filter clients based on visibility and retainer presence
        const visibleRetainerClients = clients.filter(c => {
            const hasRetainer = retainers.some(r => normalizeId(r.clientId) === normalizeId(c.id) && isVisible(r.assignedStaff));
            if (user?.role === UserRole.ADMIN || user?.role === UserRole.MANAGER || user?.role === UserRole.SUPERVISOR) {
                return c.status === 'Active' && retainers.some(r => normalizeId(r.clientId) === normalizeId(c.id));
            }
            return c.status === 'Active' && hasRetainer;
        });

        const activeSpecials = specials.filter(s => s.status === 'In Progress' && isVisible(s.assignedStaff));
        const blockedSpecials = specials.filter(s => s.status === 'Blocked' && isVisible(s.assignedStaff));

        // 5. Recent Activity Log (Feed)
        const recentActivity = context?.activityLog?.map(activity => {
            const task = context?.taskLog?.find(t => normalizeId(t.taskID) === normalizeId(activity.taskID));
            if (!task) return null;
            const special = specials.find(s => normalizeId(s.id) === normalizeId(task.specialID));
            if (!special || !isVisible(special.assignedStaff)) return null;

            return {
                id: activity.activityID,
                date: activity.dateCompleted,
                description: activity.description,
                clientName: clients.find(c => normalizeId(c.id) === normalizeId(special.clientId))?.name || 'Unknown Client',
                projectTitle: special.projectTitle,
                status: special.status,
                specialId: special.id
            };
        }).filter(Boolean).sort((a, b) => {
            const dateA = new Date(a!.date).getTime();
            const dateB = new Date(b!.date).getTime();
            return dateB - dateA;
        }).slice(0, 5);

        return {
            filingStats,
            totalRetainerClients: visibleRetainerClients.length,
            entityDistribution: Array.from(new Set(visibleRetainerClients.map(c => c.entityType))).map(type => ({
                name: type || 'Other',
                value: visibleRetainerClients.filter(c => c.entityType === type).length
            })).filter(d => d.value > 0),
            activeSpecials: activeSpecials.length,
            blockedSpecials: blockedSpecials.length,
            staffWorkload,
            recentActivity
        };
    }, [clients, retainers, specials, deadlines, retainerLogs, allUsers, currentMonth, currentYear, user, context?.activityLog, context?.taskLog]);

    const COLORS = ['#B4262A', '#F9A825', '#4B4B4B', '#10B981', '#3B82F6', '#8B5CF6'];

    return (
        <div className="w-full mx-auto p-2 space-y-6 animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 px-1">
                <div className="space-y-0.5">
                    <div className="flex items-center gap-2.5">
                        <div className="w-1.5 h-7 bg-primary rounded-full" />
                        <h1 className="text-3xl font-black text-neutral-dark dark:text-white tracking-tight">Business Intelligence</h1>
                    </div>
                    <p className="text-sm text-secondary dark:text-gray-300 font-medium pl-4 opacity-70 dark:opacity-100">Performance overview for {currentMonth} {currentYear}</p>
                </div>
                <div className="flex items-center gap-2 bg-white/50 dark:bg-gray-800/50 backdrop-blur-md px-4 py-2 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm">
                    <Calendar size={14} className="text-primary" />
                    <span className="text-[11px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest">{new Date().toDateString()}</span>
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {[
                    { label: 'Retainer Clients', value: dashboardData.totalRetainerClients, icon: Building2, color: 'text-blue-600', bg: 'bg-blue-500/10', path: '/clients', state: { activeTab: 'Retainer' } },
                    { label: 'Compliance Score', value: `${dashboardData.filingStats.total > 0 ? Math.round((dashboardData.filingStats.filed / dashboardData.filingStats.total) * 100) : 100}%`, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-500/10', path: '/engagements', state: { activeTab: 'Retainer' } },
                    { label: 'Active Projects', value: dashboardData.activeSpecials, icon: Briefcase, color: 'text-amber-600', bg: 'bg-amber-500/10', path: '/engagements', state: { activeTab: 'Special' } },
                    { label: 'Blocked Items', value: dashboardData.blockedSpecials, icon: AlertTriangle, color: 'text-rose-600', bg: 'bg-rose-500/10', path: '/engagements', state: { activeTab: 'Special' } },
                ].map((stat, i) => (
                    <div 
                        key={i} 
                        onClick={() => stat.path && navigate(stat.path, { state: stat.state })}
                        className={`bg-white dark:bg-gray-800 p-6 rounded-[2rem] border border-neutral-medium dark:border-gray-700 shadow-xl shadow-neutral-dark/5 group ${stat.path ? 'cursor-pointer hover:scale-[1.02]' : ''} transition-all duration-300`}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className={`p-3 ${stat.bg} ${stat.color} rounded-2xl transition-transform group-hover:rotate-12`}>
                                <stat.icon size={24} />
                            </div>
                            <ArrowUpRight size={20} className="text-secondary/20 dark:text-white/20 group-hover:text-primary transition-colors" />
                        </div>
                        <h3 className="text-sm font-black text-secondary dark:text-gray-300 uppercase tracking-widest opacity-60 dark:opacity-100 mb-1">{stat.label}</h3>
                        <p className="text-3xl font-black text-neutral-dark dark:text-white tracking-tighter">{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* Charts & Resources Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Filing Distribution Chart */}
                <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] border border-neutral-medium dark:border-gray-700 shadow-2xl shadow-neutral-dark/5">
                    <div className="flex items-center justify-between mb-8">
                        <div className="space-y-1">
                            <h3 className="text-lg font-black text-neutral-dark dark:text-white tracking-tight">Compliance Health</h3>
                            <p className="text-xs text-secondary dark:text-gray-400 font-medium opacity-100">Monthly filing status breakdown</p>
                        </div>
                        <div className="flex gap-4">
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                <span className="text-[10px] font-black text-secondary dark:text-gray-400 uppercase">Filed</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-amber-500" />
                                <span className="text-[10px] font-black text-secondary dark:text-gray-400 uppercase">Pending</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-rose-500" />
                                <span className="text-[10px] font-black text-secondary dark:text-gray-400 uppercase">Late</span>
                            </div>
                        </div>
                    </div>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={[
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
                <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] border border-neutral-medium dark:border-gray-700 shadow-2xl shadow-neutral-dark/5">
                    <div className="flex items-center justify-between mb-8 px-2">
                        <div className="space-y-1">
                            <h3 className="text-lg font-black text-neutral-dark dark:text-white tracking-tight">Resource Management</h3>
                            <p className="text-xs text-secondary dark:text-gray-400 font-medium opacity-100">Active engagement load per staff</p>
                        </div>
                        <Users size={20} className="text-primary opacity-50" />
                    </div>
                    <div className="overflow-y-auto pr-2 custom-scrollbar" style={{ height: '300px' }}>
                        <ResponsiveContainer width="100%" height={Math.max(300, dashboardData.staffWorkload.length * 30)}>
                            <BarChart 
                                layout="vertical" 
                                data={dashboardData.staffWorkload}
                                margin={{ left: 0, right: 30, top: 0, bottom: 10 }}
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
                                    {dashboardData.staffWorkload.map((entry, index) => {
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
            <div className="bg-white dark:bg-gray-800 p-10 rounded-[3rem] border border-neutral-medium dark:border-gray-700 shadow-2xl shadow-neutral-dark/5">
                <div className="flex items-center justify-between mb-10">
                    <div className="space-y-1">
                        <h3 className="text-xl font-black text-neutral-dark dark:text-white tracking-tight">Activity Log</h3>
                        <p className="text-sm text-secondary dark:text-gray-300 font-medium opacity-100">Real-time progress feed from Special Projects</p>
                    </div>
                    <div className="flex items-center gap-4">
                         <button onClick={() => navigate('/engagements', { state: { activeTab: 'Special' } })} className="px-6 py-2 bg-neutral-light dark:bg-gray-900 rounded-xl text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest hover:bg-primary hover:text-white transition-all">
                            View Historical Logs
                        </button>
                    </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                    {dashboardData.recentActivity.length > 0 ? (
                        dashboardData.recentActivity.map((activity: any, i) => (
                            <div 
                                key={i} 
                                onClick={() => navigate('/engagements', { state: { activeTab: 'Special', specialId: activity.specialId } })}
                                className="flex gap-6 group relative p-3 -m-3 rounded-2xl cursor-pointer hover:bg-neutral-light/50 dark:hover:bg-gray-700/50 transition-colors"
                            >
                                <div className="relative z-10">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 ${
                                        activity.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-600' :
                                        activity.status === 'Blocked' ? 'bg-rose-500/10 text-rose-600' :
                                        'bg-blue-500/10 text-blue-600'
                                    }`}>
                                        <Briefcase size={22} />
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0 py-1">
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <h4 className="text-sm font-black text-neutral-dark dark:text-white uppercase truncate tracking-tight">{activity.projectTitle}</h4>
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-neutral-light dark:bg-gray-700 rounded-md">
                                            <Calendar size={10} className="text-secondary dark:text-gray-400" />
                                            <span className="text-[9px] font-black text-secondary dark:text-gray-300 uppercase tracking-tighter opacity-100">{activity.date}</span>
                                        </div>
                                    </div>
                                    <p className="text-xs font-bold text-secondary dark:text-gray-400 mb-3 leading-relaxed">{activity.description}</p>
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
                        <div className="col-span-2 text-center py-20 opacity-30 italic text-lg">No recent activity found</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
