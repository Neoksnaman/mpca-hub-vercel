import React, { useContext, useMemo, useState } from 'react';
import { AppContext } from '../App';
import { UserRole } from '../types';
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
    LineChart,
    Line,
    AreaChart,
    Area
} from 'recharts';
import { 
    Users, 
    Shield, 
    Briefcase, 
    TrendingUp, 
    FileText, 
    Activity, 
    Calendar, 
    ArrowUpRight, 
    Filter, 
    Building2,
    Clock,
    CheckCircle,
    FileSpreadsheet,
    Award,
    AlertCircle
} from 'lucide-react';

const getUserFullName = (user: any) => `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
const sortUsersByName = (users: any[]) => [...users].sort((a, b) => getUserFullName(a).localeCompare(getUserFullName(b)));

const normalizeId = (id: any) => String(id || '').replace(/^0+(?!$)/, '').trim() || '0';

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Safety-first Date Parser to handle MM/DD/YYYY and YYYY-MM-DD
const parseDateSafe = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    const cleanStr = String(dateStr).trim();
    const parts = cleanStr.includes('/') ? cleanStr.split('/') : cleanStr.split('-');
    if (parts.length < 3) return null;
    
    let year: number, month: number, day: number;
    
    if (parts[0].length === 4) {
        // YYYY-MM-DD
        year = parseInt(parts[0]);
        month = parseInt(parts[1]) - 1;
        day = parseInt(parts[2]);
    } else {
        // MM/DD/YYYY
        year = parseInt(parts[2]);
        month = parseInt(parts[0]) - 1;
        day = parseInt(parts[1]);
    }
    
    if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
    return new Date(year, month, day);
};

const Reports: React.FC = () => {
    const context = useContext(AppContext);
    const theme = context?.theme || 'light';
    const currentUser = context?.user;
    
    // Core data sources from AppContext
    const clients = context?.clients || [];
    const retainers = context?.retainers || [];
    const specials = context?.specials || [];
    const deadlines = context?.deadlines || [];
    const retainerLogs = context?.retainerLogs || [];
    const allUsers = context?.allUsers || [];
    const transmittals = context?.transmittals || [];
    const meetings = context?.meetings || [];
    const taxCompliances = context?.taxCompliances || [];

    // State Hooks for Filters & Tabs
    const [activeTab, setActiveTab] = useState<'compliance' | 'portfolio' | 'specials' | 'staff' | 'logistics'>('compliance');
    const [timePeriod, setTimePeriod] = useState<'all' | 'year' | '6months' | 'month'>('all');
    const [selectedTeam, setSelectedTeam] = useState<string>('All');
    const [selectedStaffMember, setSelectedStaffMember] = useState<string>('All');

    // UI Harmonious Palette matching brand styling
    const COLORS = ['#B4262A', '#F9A825', '#4B4B4B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6'];
    const PIE_COLORS = {
        retainer: '#3B82F6',  // Professional Blue
        special: '#F59E0B',   // Warm Amber
        both: '#10B981',      // Emerald Green
        none: '#9CA3AF'       // Gray
    };

    // Filter staff based on context role to restrict dropdown values
    const allowedStaffList = useMemo(() => {
        const activeStaff = sortUsersByName(allUsers.filter((u: any) => u.status === 'Active'));
        if (currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.MANAGER || currentUser?.role === UserRole.SUPERVISOR) {
            return activeStaff;
        }
        if (currentUser?.role === UserRole.SENIOR) {
            return activeStaff.filter((u: any) => u.team === currentUser?.team || u.id === currentUser?.id);
        }
        // General staff can only select themselves
        return activeStaff.filter((u: any) => u.id === currentUser?.id);
    }, [allUsers, currentUser]);

    // Available teams
    const teams = useMemo(() => {
        const allTeams = allUsers.filter((u: any) => u.status === 'Active').map((u: any) => u.team).filter(Boolean);
        return ['All', ...Array.from(new Set(allTeams)).sort()];
    }, [allUsers]);

    const reportScopeLabel = useMemo(() => {
        if (selectedStaffMember !== 'All') return selectedStaffMember;
        if (selectedTeam !== 'All') return `${selectedTeam} Team`;
        return 'Firm-wide';
    }, [selectedStaffMember, selectedTeam]);

    const reportingWindowLabel = {
        all: 'All Time',
        year: 'Year to Date',
        '6months': 'Last 6 Months',
        month: 'Current Month'
    }[timePeriod];

    // Check date within selected filter range
    const isDateInFilterRange = (date: Date | null): boolean => {
        if (!date) return false;
        const now = new Date();
        if (timePeriod === 'month') {
            return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        }
        if (timePeriod === '6months') {
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(now.getMonth() - 6);
            return date >= sixMonthsAgo;
        }
        if (timePeriod === 'year') {
            return date.getFullYear() === now.getFullYear();
        }
        return true;
    };

    const reportLookups = useMemo(() => {
        const retainerById = new Map<string, any>();
        retainers.forEach(r => retainerById.set(normalizeId(r.id), r));

        const clientById = new Map<string, any>();
        clients.forEach(c => clientById.set(normalizeId(c.id), c));

        const userByName = new Map<string, any>();
        allUsers.forEach(u => {
            userByName.set(u.firstName, u);
            userByName.set(`${u.firstName} ${u.lastName}`, u);
            userByName.set(String(u.id), u);
        });

        const logsByDeadline = new Map<string, any[]>();
        retainerLogs.forEach(l => {
            const key = normalizeId(l[0]);
            if (!logsByDeadline.has(key)) logsByDeadline.set(key, []);
            logsByDeadline.get(key)!.push(l);
        });

        const taxById = new Map<string, any>();
        taxCompliances.forEach(tc => taxById.set(normalizeId(tc.taxID), tc));

        const tasksBySpecial = new Map<string, any[]>();
        (context?.taskLog || []).forEach(t => {
            const key = normalizeId(t.specialID);
            if (!tasksBySpecial.has(key)) tasksBySpecial.set(key, []);
            tasksBySpecial.get(key)!.push(t);
        });

        return { retainerById, clientById, userByName, logsByDeadline, taxById, tasksBySpecial };
    }, [retainers, clients, allUsers, retainerLogs, taxCompliances, context?.taskLog]);

    // -------------------------------------------------------------
    // CALCULATIONS: Tab 1 - Compliance Trends & Accuracy
    // -------------------------------------------------------------
    const complianceReportsData = useMemo(() => {
        if (activeTab !== 'compliance') {
            return { taxPerformance: [], timeline: [], summary: { totalFiling: 0, onTime: 0, late: 0 } };
        }
        const monthsList = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        
        // 1. Process Deadlines vs Logs
        const deadlineMap = deadlines.map((d: any) => {
            const retainer = reportLookups.retainerById.get(normalizeId(d.retainerID));
            if (!retainer) return null;

            // Staff & Team Filters
            if (selectedStaffMember !== 'All') {
                const isAssigned = retainer.assignedStaff === selectedStaffMember || 
                                   retainer.assignedStaff?.includes(selectedStaffMember);
                if (!isAssigned) return null;
            } else if (selectedTeam !== 'All') {
                const assignedUser = reportLookups.userByName.get(retainer.assignedStaff);
                if (assignedUser?.team !== selectedTeam) return null;
            }

            const client = reportLookups.clientById.get(normalizeId(retainer.clientId));
            if (!client || client.status === 'Inactive') return null;

            // Generate status & filing dates across active logs
            const matchedLogs = reportLookups.logsByDeadline.get(normalizeId(d.deadlineID)) || [];
            
            return {
                id: d.deadlineID,
                taxID: d.taxID,
                assignedStaff: retainer.assignedStaff,
                logs: matchedLogs,
                clientName: client.name,
                dueDateCode: d.dueDate
            };
        }).filter(Boolean);

        // 2. Performance by Tax Code
        const taxPerformanceMap: Record<string, { code: string; name: string; filed: number; late: number; total: number }> = {};
        
        deadlineMap.forEach((d: any) => {
            const tax = reportLookups.taxById.get(normalizeId(d.taxID));
            const codeKey = tax?.complianceCode || d.taxID || 'Other';
            if (!taxPerformanceMap[codeKey]) {
                taxPerformanceMap[codeKey] = {
                    code: codeKey,
                    name: tax?.complianceName || 'General Compliance',
                    filed: 0,
                    late: 0,
                    total: 0
                };
            }

            d.logs.forEach((log: any) => {
                const dateCompleted = parseDateSafe(log[2]);
                if (!isDateInFilterRange(dateCompleted)) return;

                // Determine if late
                const isLate = String(log[2] && log[3]).toLowerCase().includes('late') || false;
                
                taxPerformanceMap[codeKey].total += 1;
                if (isLate) {
                    taxPerformanceMap[codeKey].late += 1;
                } else {
                    taxPerformanceMap[codeKey].filed += 1;
                }
            });
        });

        // 3. Monthly Accuracy Timeline
        const monthlyTimelineMap: Record<string, { month: string; filed: number; late: number; onTimeRate: number; sortKey: number }> = {};
        
        deadlineMap.forEach((d: any) => {
            d.logs.forEach((log: any) => {
                const dateCompleted = parseDateSafe(log[2]);
                if (!dateCompleted || !isDateInFilterRange(dateCompleted)) return;

                const mName = monthsList[dateCompleted.getMonth()];
                const yName = dateCompleted.getFullYear();
                const key = `${mName} ${yName}`;
                
                const isLate = String(log[2] && log[3]).toLowerCase().includes('late') || false;

                if (!monthlyTimelineMap[key]) {
                    monthlyTimelineMap[key] = {
                        month: key,
                        filed: 0,
                        late: 0,
                        onTimeRate: 100,
                        sortKey: dateCompleted.getFullYear() * 100 + dateCompleted.getMonth()
                    };
                }

                if (isLate) {
                    monthlyTimelineMap[key].late += 1;
                } else {
                    monthlyTimelineMap[key].filed += 1;
                }
            });
        });

        const timelineArray = Object.values(monthlyTimelineMap).sort((a, b) => a.sortKey - b.sortKey);
        timelineArray.forEach(item => {
            const total = item.filed + item.late;
            item.onTimeRate = total > 0 ? Math.round((item.filed / total) * 100) : 100;
        });

        return {
            taxPerformance: Object.values(taxPerformanceMap).filter(t => t.total > 0),
            timeline: timelineArray,
            summary: {
                totalFiling: deadlineMap.reduce((acc, curr) => acc + curr.logs.length, 0),
                onTime: deadlineMap.reduce((acc, curr) => acc + curr.logs.filter(l => !String(l[2] && l[3]).toLowerCase().includes('late')).length, 0),
                late: deadlineMap.reduce((acc, curr) => acc + curr.logs.filter(l => String(l[2] && l[3]).toLowerCase().includes('late')).length, 0)
            }
        };
    }, [activeTab, deadlines, reportLookups, timePeriod, selectedTeam, selectedStaffMember]);

    // -------------------------------------------------------------
    // CALCULATIONS: Tab 2 - Client Portfolio & Saturation
    // -------------------------------------------------------------
    const portfolioReportsData = useMemo(() => {
        if (activeTab !== 'portfolio') {
            return { saturation: [], entityDistribution: [], credentialsRate: 0, activeClientCount: 0 };
        }
        const activeClients = clients.filter(c => c.status === 'Active');
        const retainerClientIds = new Set(retainers.filter(r => r.engagementStatus === 'Active').map(r => normalizeId(r.clientId)));
        const specialClientIds = new Set(specials.filter(s => s.status !== 'Completed').map(s => normalizeId(s.clientId)));
        const credentialClientIds = new Set((context?.credentials || []).map(cr => normalizeId(cr.clientID)));
        
        let retainerClients = 0;
        let specialClients = 0;
        let bothClients = 0;
        let noServicesClients = 0;

        const entityTypeCount: Record<string, number> = {};

        activeClients.forEach(c => {
            const clientId = normalizeId(c.id);
            const hasRetainer = retainerClientIds.has(clientId);
            const hasSpecial = specialClientIds.has(clientId);

            if (hasRetainer && hasSpecial) bothClients++;
            else if (hasRetainer) retainerClients++;
            else if (hasSpecial) specialClients++;
            else noServicesClients++;

            // Entity saturation
            const entity = c.entityType || 'Other';
            entityTypeCount[entity] = (entityTypeCount[entity] || 0) + 1;
        });

        // Credentials Completeness Gauge
        const clientsWithCreds = activeClients.filter(c => credentialClientIds.has(normalizeId(c.id))).length;

        const saturationData = [
            { name: 'Retainers Only', value: retainerClients, fill: PIE_COLORS.retainer },
            { name: 'Special Projects Only', value: specialClients, fill: PIE_COLORS.special },
            { name: 'Both Services', value: bothClients, fill: PIE_COLORS.both },
            { name: 'No Active Service', value: noServicesClients, fill: PIE_COLORS.none }
        ].filter(d => d.value > 0);

        const entityData = Object.entries(entityTypeCount).map(([name, value]) => ({ name, value }));

        return {
            saturation: saturationData,
            entityDistribution: entityData,
            credentialsRate: activeClients.length > 0 ? Math.round((clientsWithCreds / activeClients.length) * 100) : 0,
            activeClientCount: activeClients.length
        };
    }, [activeTab, clients, retainers, specials, context?.credentials]);

    // -------------------------------------------------------------
    // CALCULATIONS: Tab 3 - Special Engagements (One-Time Projects) Direct Report
    // -------------------------------------------------------------
    const specialEngagementsReportsData = useMemo(() => {
        if (activeTab !== 'specials') {
            return { total: 0, inProgress: 0, completed: 0, blocked: 0, planning: 0, statusChartData: [], serviceTypesData: [], projectProgressList: [], avgTurnaround: null };
        }
        // Filter specials based on date / team / staff selector
        const filteredSpecials = specials.filter((s: any) => {
            // Staff Filter
            if (selectedStaffMember !== 'All') {
                const isAssigned = s.assignedStaff === selectedStaffMember || 
                                   s.assignedStaff?.includes(selectedStaffMember);
                if (!isAssigned) return false;
            } else if (selectedTeam !== 'All') {
                const assignedUser = reportLookups.userByName.get(s.assignedStaff);
                if (assignedUser?.team !== selectedTeam) return false;
            }

            // Date Range
            const startDate = parseDateSafe(s.startDate);
            if (!isDateInFilterRange(startDate)) return false;

            return true;
        });

        // 1. Summary Counts
        const total = filteredSpecials.length;
        const inProgress = filteredSpecials.filter((s: any) => s.status === 'In Progress').length;
        const completed = filteredSpecials.filter((s: any) => s.status === 'Completed').length;
        const blocked = filteredSpecials.filter((s: any) => s.status === 'Blocked').length;
        const planning = filteredSpecials.filter((s: any) => s.status === 'Planning').length;

        // 2. Status Chart Data
        const statusChartData = [
            { name: 'In Progress', value: inProgress, fill: '#3B82F6' },
            { name: 'Completed', value: completed, fill: '#10B981' },
            { name: 'Blocked', value: blocked, fill: '#EF4444' },
            { name: 'Planning', value: planning, fill: '#F59E0B' }
        ].filter(d => d.value > 0);

        // 3. Service Type Saturation
        const serviceTypesMap: Record<string, number> = {};
        filteredSpecials.forEach((s: any) => {
            const type = s.serviceType || s.serviceName || 'Consulting';
            serviceTypesMap[type] = (serviceTypesMap[type] || 0) + 1;
        });
        const serviceTypesData = Object.entries(serviceTypesMap).map(([name, value]) => ({
            name,
            value
        })).sort((a, b) => b.value - a.value);

        // 4. Progress Tracker
        const projectProgressList = filteredSpecials.map((s: any) => {
            const relatedTasks = reportLookups.tasksBySpecial.get(normalizeId(s.id)) || [];
            const totalTasks = relatedTasks.length;
            const completedTasks = relatedTasks.filter(t => t.status === 'Completed').length;
            
            const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
            const client = reportLookups.clientById.get(normalizeId(s.clientId));

            return {
                id: s.id,
                title: s.projectTitle || s.serviceName || s.serviceType,
                clientName: client?.name || 'Unknown Client',
                assignedStaff: s.assignedStaff,
                status: s.status,
                priority: s.priority || 'Medium',
                progress,
                completedTasks,
                totalTasks
            };
        }).sort((a, b) => b.progress - a.progress);

        // 5. Turnaround Efficiency
        const completedSpecials = filteredSpecials.filter((s: any) => s.status === 'Completed');
        let totalDays = 0;
        let evaluatedCount = 0;
        
        completedSpecials.forEach((s: any) => {
            const start = parseDateSafe(s.startDate);
            const end = parseDateSafe(s.endDate);
            if (start && end) {
                const diffTime = Math.abs(end.getTime() - start.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                totalDays += diffDays;
                evaluatedCount++;
            }
        });

        const avgTurnaround = evaluatedCount > 0 ? Math.round(totalDays / evaluatedCount) : null;

        return {
            total,
            inProgress,
            completed,
            blocked,
            planning,
            statusChartData,
            serviceTypesData,
            projectProgressList,
            avgTurnaround
        };
    }, [activeTab, specials, selectedStaffMember, selectedTeam, timePeriod, reportLookups]);

    // -------------------------------------------------------------
    // CALCULATIONS: Tab 4 - Staff & Team Load Performance
    // -------------------------------------------------------------
    const staffReportsData = useMemo(() => {
        if (activeTab !== 'staff') {
            return { loadChart: [], scoreboard: [], averages: { seniorAvgLoad: '0', juniorAvgLoad: '0' } };
        }
        // Filter users who are active and not system administrators (core workers)
        const activeUsersList = sortUsersByName(allUsers.filter((u: any) => u.status === 'Active' && u.role !== UserRole.ADMIN));
        const retainersByStaff = new Map<string, any[]>();
        retainers.forEach(r => {
            [r.assignedStaff].forEach(key => {
                if (!retainersByStaff.has(key)) retainersByStaff.set(key, []);
                retainersByStaff.get(key)!.push(r);
            });
        });
        const specialsByStaff = new Map<string, any[]>();
        specials.forEach(s => {
            if (!specialsByStaff.has(s.assignedStaff)) specialsByStaff.set(s.assignedStaff, []);
            specialsByStaff.get(s.assignedStaff)!.push(s);
        });

        const staffLoad = activeUsersList.map((u: any) => {
            const name = `${u.firstName} ${u.lastName}`;
            const shortName = u.firstName;

            // Retainers workload
            const activeRetainers = [...(retainersByStaff.get(name) || []), ...(retainersByStaff.get(shortName) || [])];
            // Special active projects
            const activeSpecials = [...(specialsByStaff.get(name) || []), ...(specialsByStaff.get(shortName) || [])].filter(s => s.status === 'In Progress');
            
            // Total volume assigned
            const totalLoad = activeRetainers.length + activeSpecials.length;

            // Filing stats to compute timeliness score
            let userFilingsCount = 0;
            let userOnTimeCount = 0;

            deadlines.forEach((d: any) => {
                const parentRet = reportLookups.retainerById.get(normalizeId(d.retainerID));
                if (parentRet && (parentRet.assignedStaff === name || parentRet.assignedStaff === shortName)) {
                    const logs = reportLookups.logsByDeadline.get(normalizeId(d.deadlineID)) || [];
                    logs.forEach(log => {
                        const dateComp = parseDateSafe(log[2]);
                        if (!isDateInFilterRange(dateComp)) return;

                        const isLate = String(log[2] && log[3]).toLowerCase().includes('late') || false;
                        userFilingsCount++;
                        if (!isLate) userOnTimeCount++;
                    });
                }
            });

            return {
                id: u.id,
                name: `${u.firstName} ${u.lastName}`,
                role: u.role,
                team: u.team || 'No Team',
                retainersLoad: activeRetainers.length,
                specialsLoad: activeSpecials.length,
                totalLoad: totalLoad,
                filingsCount: userFilingsCount,
                timelinessScore: userFilingsCount > 0 ? Math.round((userOnTimeCount / userFilingsCount) * 100) : 100
            };
        }).filter(u => {
            if (selectedTeam !== 'All' && u.team !== selectedTeam) return false;
            if (selectedStaffMember !== 'All' && u.name !== selectedStaffMember) return false;
            return true;
        });

        // Compute Role-Based Averages
        const seniorGroup = staffLoad.filter(u => u.role === UserRole.SENIOR);
        const juniorGroup = staffLoad.filter(u => u.role === UserRole.STAFF);

        const seniorAvgLoad = seniorGroup.length > 0 ? (seniorGroup.reduce((acc, c) => acc + c.totalLoad, 0) / seniorGroup.length).toFixed(1) : '0';
        const juniorAvgLoad = juniorGroup.length > 0 ? (juniorGroup.reduce((acc, c) => acc + c.totalLoad, 0) / juniorGroup.length).toFixed(1) : '0';

        return {
            loadChart: staffLoad.map(s => ({
                name: s.name.split(' ')[0], // First name for neat chart presentation
                'Retainers': s.retainersLoad,
                'Special Projects': s.specialsLoad,
                'Total': s.totalLoad
            })).sort((a, b) => b.Total - a.Total),
            scoreboard: staffLoad.sort((a, b) => b.timelinessScore - a.timelinessScore),
            averages: {
                seniorAvgLoad,
                juniorAvgLoad
            }
        };
    }, [activeTab, allUsers, retainers, specials, deadlines, reportLookups, selectedTeam, selectedStaffMember, timePeriod]);

    // -------------------------------------------------------------
    // CALCULATIONS: Tab 5 - Operational Logistics
    // -------------------------------------------------------------
    const logisticsReportsData = useMemo(() => {
        if (activeTab !== 'logistics') {
            return { transmittalsTimeline: [], topDocuments: [], summary: { totalTransmittals: 0, totalMeetings: 0, avgAttendees: '0' } };
        }
        const monthsList = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        
        // 1. Transmittals Volume timeline
        const transmittalsTimeline: Record<string, { month: string; count: number; sortKey: number }> = {};
        
        // 2. Parse Shipped document types
        const documentTypeFrequencies: Record<string, number> = {};

        let filteredTransmittalCount = 0;
        transmittals.forEach((t: any) => {
            const tDate = parseDateSafe(t.date);
            if (!tDate || !isDateInFilterRange(tDate)) return;
            filteredTransmittalCount++;

            const mName = monthsList[tDate.getMonth()];
            const yName = tDate.getFullYear();
            const key = `${mName} ${yName}`;

            if (!transmittalsTimeline[key]) {
                transmittalsTimeline[key] = {
                    month: key,
                    count: 0,
                    sortKey: tDate.getFullYear() * 100 + tDate.getMonth()
                };
            }
            transmittalsTimeline[key].count += 1;

            // Document Parsing (by Semicolon or double pipes)
            const docItems = String(t.items || '').split(/\|\||;/);
            docItems.forEach(item => {
                const cleanItem = item.trim().replace(/\d/g, '').replace(/^-+/, '').trim(); // Remove leading numbers
                if (cleanItem && cleanItem.length > 2) {
                    // Standardize document titles to group effectively
                    let category = cleanItem;
                    if (cleanItem.toLowerCase().includes('bir') || cleanItem.toLowerCase().includes('tax')) {
                        category = 'BIR Tax Return Forms';
                    } else if (cleanItem.toLowerCase().includes('financial') || cleanItem.toLowerCase().includes('afs')) {
                        category = 'Audited Financial Statements';
                    } else if (cleanItem.toLowerCase().includes('sec') || cleanItem.toLowerCase().includes('general info')) {
                        category = 'SEC / GIS Filings';
                    } else if (cleanItem.toLowerCase().includes('payroll') || cleanItem.toLowerCase().includes('payslip')) {
                        category = 'Payroll Sheets & Payslips';
                    } else if (cleanItem.toLowerCase().includes('receipt') || cleanItem.toLowerCase().includes('billing')) {
                        category = 'Invoices & Billing Receipts';
                    }
                    documentTypeFrequencies[category] = (documentTypeFrequencies[category] || 0) + 1;
                }
            });
        });

        const timelineArray = Object.values(transmittalsTimeline).sort((a, b) => a.sortKey - b.sortKey);
        
        const topDocsArray = Object.entries(documentTypeFrequencies)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);

        // 3. Meeting Collaboration Stats
        const meetingTimeline = meetings.filter((m: any) => {
            const mDate = parseDateSafe(m.date);
            return mDate && isDateInFilterRange(mDate);
        });

        let totalAttendeesCount = 0;
        meetingTimeline.forEach((m: any) => {
            const attendees = String(m.userIDs || '').split(',').filter(Boolean);
            totalAttendeesCount += attendees.length;
        });

        const avgAttendees = meetingTimeline.length > 0 ? (totalAttendeesCount / meetingTimeline.length).toFixed(1) : '0';

        return {
            transmittalsTimeline: timelineArray,
            topDocuments: topDocsArray,
            summary: {
                totalTransmittals: filteredTransmittalCount,
                totalMeetings: meetingTimeline.length,
                avgAttendees: avgAttendees
            }
        };
    }, [activeTab, transmittals, meetings, timePeriod]);

    return (
        <div className="w-full mx-auto p-2 space-y-6 animate-in fade-in duration-700 print:p-0 print:space-y-4">
            
            {/* 1. Header with Title & Custom Print CTA */}
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 px-1 print:hidden">
                <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                        <div className="w-1.5 h-7 bg-primary rounded-full" />
                        <h1 className="text-3xl font-black text-neutral-dark dark:text-white tracking-tight">Reports & Analytics</h1>
                    </div>
                    <p className="text-sm text-secondary dark:text-gray-300 font-medium pl-4 opacity-70">
                        Compliance health, client portfolio, workload, and office operations in one view.
                    </p>
                </div>
            </div>

            {/* 2. Global Strategic Filtering Bar (Admins see all, Seniors see team, Staff see self) */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm flex flex-wrap items-center justify-between gap-4 print:hidden">
                <div className="flex flex-wrap items-center gap-3.5">
                    
                    {/* Time Period Filter */}
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-black text-secondary dark:text-gray-400 ml-1">Reporting Window</label>
                        <div className="flex bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 p-1 rounded-xl">
                            {[
                                { key: 'all', label: 'All Time' },
                                { key: 'year', label: 'YTD' },
                                { key: '6months', label: '6 Months' },
                                { key: 'month', label: 'Current Month' }
                            ].map(item => (
                                <button
                                    key={item.key}
                                    onClick={() => setTimePeriod(item.key as any)}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${timePeriod === item.key ? 'bg-primary text-white shadow-sm shadow-primary/20' : 'text-secondary hover:text-neutral-dark dark:text-gray-300 dark:hover:text-white'}`}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Team Scope Filter - Manager and above only */}
                    {currentUser?.role !== UserRole.STAFF && (
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-black text-secondary dark:text-gray-400 ml-1">Team Scope</label>
                            <select
                                value={selectedTeam}
                                onChange={(e) => {
                                    setSelectedTeam(e.target.value);
                                    setSelectedStaffMember('All'); // Reset staff filter on team change
                                }}
                                className="px-4 py-2 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-xl text-[11px] font-black text-secondary dark:text-white outline-none cursor-pointer focus:ring-2 focus:ring-primary/20"
                            >
                                <option value="All">All Teams</option>
                                {teams.filter(t => t !== 'All').map(t => (
                                    <option key={t} value={t}>{t} Team</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Staff Member Scope Filter */}
                    {currentUser?.role !== UserRole.STAFF && (
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-black text-secondary dark:text-gray-400 ml-1">Staff Scope</label>
                            <select
                                value={selectedStaffMember}
                                onChange={(e) => setSelectedStaffMember(e.target.value)}
                                className="px-4 py-2 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-xl text-[11px] font-black text-secondary dark:text-white outline-none cursor-pointer focus:ring-2 focus:ring-primary/20"
                            >
                                <option value="All">All Staff / Seniors</option>
                                {allowedStaffList.map(u => (
                                    <option key={u.id} value={`${u.firstName} ${u.lastName}`}>{u.firstName} {u.lastName} ({u.role})</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2 bg-primary/5 px-3 py-2 rounded-xl border border-primary/10">
                    <Filter size={12} className="text-primary" />
                    <span className="text-[10px] font-black text-primary">
                        {reportScopeLabel} · {reportingWindowLabel}
                    </span>
                </div>
            </div>

            {/* 3. High-Fidelity Custom Analytical Tabs */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm p-2 flex flex-wrap items-center gap-2 print:hidden">
                {[
                    { key: 'compliance', label: 'Compliance', icon: Shield },
                    { key: 'portfolio', label: 'Clients', icon: Building2 },
                    { key: 'specials', label: 'Special Projects', icon: Briefcase },
                    { key: 'staff', label: 'Staff Load', icon: Users },
                    { key: 'logistics', label: 'Operations', icon: FileSpreadsheet }
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key as any)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-black transition-all ${activeTab === tab.key ? 'bg-primary text-white shadow-sm shadow-primary/20' : 'text-secondary hover:text-neutral-dark hover:bg-neutral-light/70 dark:hover:bg-gray-900 dark:hover:text-white'}`}
                    >
                        <tab.icon size={14} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ------------------------------------------------------------- */}
            {/* TAB CONTAINER: 1. Compliance Accuracy & Trends */}
            {/* ------------------------------------------------------------- */}
            {activeTab === 'compliance' && (
                <div className="space-y-6">
                    {/* Metrics Summary Row */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm flex items-center gap-4">
                            <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 shrink-0">
                                <FileText size={22} />
                            </div>
                            <div>
                                <h4 className="text-[9px] font-black uppercase tracking-widest text-secondary opacity-60 dark:opacity-100">Evaluated Filings</h4>
                                <p className="text-3xl font-black text-neutral-dark dark:text-white mt-0.5">{complianceReportsData.summary.totalFiling}</p>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm flex items-center gap-4">
                            <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 shrink-0">
                                <CheckCircle size={22} />
                            </div>
                            <div>
                                <h4 className="text-[9px] font-black uppercase tracking-widest text-secondary opacity-60 dark:opacity-100">On-Time Filings</h4>
                                <p className="text-3xl font-black text-neutral-dark dark:text-white mt-0.5">{complianceReportsData.summary.onTime}</p>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm flex items-center gap-4">
                            <div className="w-12 h-12 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-500 shrink-0">
                                <Clock size={22} />
                            </div>
                            <div>
                                <h4 className="text-[9px] font-black uppercase tracking-widest text-secondary opacity-60 dark:opacity-100">Late Filings</h4>
                                <p className="text-3xl font-black text-neutral-dark dark:text-white mt-0.5">{complianceReportsData.summary.late}</p>
                            </div>
                        </div>
                    </div>

                    {/* Compliance Charts */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm">
                            <div className="mb-6">
                                <h3 className="text-base font-black text-neutral-dark dark:text-white">Tax Compliance Performance</h3>
                                <p className="text-xs text-secondary dark:text-gray-400 font-medium">On-Time vs Late Filings grouped by Tax Code</p>
                            </div>
                            <div className="h-[300px] w-full">
                                {complianceReportsData.taxPerformance.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={complianceReportsData.taxPerformance} barSize={25}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#374151' : '#E5E7EB'} />
                                            <XAxis dataKey="code" tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: theme === 'dark' ? '#9CA3AF' : '#6B7280' }} />
                                            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: theme === 'dark' ? '#9CA3AF' : '#6B7280' }} />
                                            <Tooltip cursor={{ fill: 'transparent' }} />
                                            <Legend verticalAlign="top" height={36} />
                                            <Bar dataKey="filed" fill="#10B981" name="On Time" radius={[4, 4, 0, 0]} />
                                            <Bar dataKey="late" fill="#EF4444" name="Late Filed" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-xs italic text-secondary opacity-50">No filings recorded for the selected scope.</div>
                                )}
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm">
                            <div className="mb-6">
                                <h3 className="text-base font-black text-neutral-dark dark:text-white">Historical Timeliness Rate</h3>
                                <p className="text-xs text-secondary dark:text-gray-400 font-medium">Monthly compliance accuracy percentage trends</p>
                            </div>
                            <div className="h-[300px] w-full">
                                {complianceReportsData.timeline.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={complianceReportsData.timeline}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#374151' : '#E5E7EB'} />
                                            <XAxis dataKey="month" tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: theme === 'dark' ? '#9CA3AF' : '#6B7280' }} />
                                            <YAxis domain={[0, 100]} unit="%" tickLine={false} axisLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: theme === 'dark' ? '#9CA3AF' : '#6B7280' }} />
                                            <Tooltip />
                                            <Legend verticalAlign="top" height={36} />
                                            <Line type="monotone" dataKey="onTimeRate" stroke="#B4262A" strokeWidth={3} name="On-Time Rate %" activeDot={{ r: 8 }} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-xs italic text-secondary opacity-50">No timeline data available for the selected scope.</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* TAB CONTAINER: 2. Client Portfolio & Saturation */}
            {/* ------------------------------------------------------------- */}
            {activeTab === 'portfolio' && (
                <div className="space-y-6">
                    {/* Portfolio Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm flex items-center gap-4">
                            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shrink-0">
                                <Building2 size={22} />
                            </div>
                            <div>
                                <h4 className="text-[9px] font-black uppercase tracking-widest text-secondary opacity-60 dark:opacity-100">Total Managed Clients</h4>
                                <p className="text-3xl font-black text-neutral-dark dark:text-white mt-0.5">{portfolioReportsData.activeClientCount}</p>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm flex items-center gap-4">
                            <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-500 shrink-0">
                                <Shield size={22} />
                            </div>
                            <div>
                                <h4 className="text-[9px] font-black uppercase tracking-widest text-secondary opacity-60 dark:opacity-100">Credential completeness</h4>
                                <p className="text-3xl font-black text-neutral-dark dark:text-white mt-0.5">{portfolioReportsData.credentialsRate}%</p>
                            </div>
                        </div>
                    </div>

                    {/* Portfolio Charts */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm flex flex-col justify-between">
                            <div className="mb-4">
                                <h3 className="text-base font-black text-neutral-dark dark:text-white">Services Saturation</h3>
                                <p className="text-xs text-secondary dark:text-gray-400 font-medium">Division of clients by enrolled active service segments</p>
                            </div>
                            <div className="h-[250px] w-full relative flex items-center justify-center">
                                {portfolioReportsData.saturation.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie 
                                                data={portfolioReportsData.saturation} 
                                                cx="50%" 
                                                cy="50%" 
                                                innerRadius={65} 
                                                outerRadius={95} 
                                                paddingAngle={4} 
                                                dataKey="value"
                                            >
                                                {portfolioReportsData.saturation.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                                ))}
                                            </Pie>
                                            <Tooltip />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="text-xs italic text-secondary opacity-50">No clients registered.</div>
                                )}
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3 mt-4 border-t border-neutral-medium dark:border-gray-700 pt-4">
                                {portfolioReportsData.saturation.map((s, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.fill }} />
                                        <span className="text-[10px] font-black text-secondary dark:text-gray-300 uppercase tracking-tight">{s.name} ({s.value})</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm">
                            <div className="mb-6">
                                <h3 className="text-base font-black text-neutral-dark dark:text-white">Portfolio by Client Entity Type</h3>
                                <p className="text-xs text-secondary dark:text-gray-400 font-medium">Saturation of Corporation, Partnership vs Individual clients</p>
                            </div>
                            <div className="h-[300px] w-full">
                                {portfolioReportsData.entityDistribution.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={portfolioReportsData.entityDistribution} barSize={30}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#374151' : '#E5E7EB'} />
                                            <XAxis dataKey="name" tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: theme === 'dark' ? '#9CA3AF' : '#6B7280' }} />
                                            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: theme === 'dark' ? '#9CA3AF' : '#6B7280' }} />
                                            <Tooltip cursor={{ fill: 'transparent' }} />
                                            <Bar dataKey="value" fill="#B4262A" radius={[6, 6, 0, 0]} name="Active Clients" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-xs italic text-secondary opacity-50">No client data.</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* TAB CONTAINER: 3. Special Engagements (One-Time Projects) Direct Report */}
            {/* ------------------------------------------------------------- */}
            {activeTab === 'specials' && (
                <div className="space-y-6">
                    
                    {/* Summary Row */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm flex items-center gap-4">
                            <div className="w-10 h-10 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 shrink-0">
                                <Briefcase size={20} />
                            </div>
                            <div>
                                <h4 className="text-[8px] font-black uppercase tracking-widest text-secondary opacity-60 dark:opacity-100">Total Specials</h4>
                                <p className="text-2xl font-black text-neutral-dark dark:text-white mt-0.5">{specialEngagementsReportsData.total}</p>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm flex items-center gap-4">
                            <div className="w-10 h-10 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-500 shrink-0">
                                <TrendingUp size={20} />
                            </div>
                            <div>
                                <h4 className="text-[8px] font-black uppercase tracking-widest text-secondary opacity-60 dark:opacity-100">Active Work</h4>
                                <p className="text-2xl font-black text-neutral-dark dark:text-white mt-0.5">{specialEngagementsReportsData.inProgress}</p>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm flex items-center gap-4">
                            <div className="w-10 h-10 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-500 shrink-0">
                                <AlertCircle size={20} />
                            </div>
                            <div>
                                <h4 className="text-[8px] font-black uppercase tracking-widest text-secondary opacity-60 dark:opacity-100">Blocked Projects</h4>
                                <p className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-0.5">{specialEngagementsReportsData.blocked}</p>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm flex items-center gap-4">
                            <div className="w-10 h-10 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 shrink-0">
                                <Clock size={20} />
                            </div>
                            <div>
                                <h4 className="text-[8px] font-black uppercase tracking-widest text-secondary opacity-60 dark:opacity-100">Avg turnaround</h4>
                                <p className="text-2xl font-black text-neutral-dark dark:text-white mt-0.5">
                                    {specialEngagementsReportsData.avgTurnaround ? `${specialEngagementsReportsData.avgTurnaround} Days` : 'N/A'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Interactive Charts row */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Project Status Pie Chart */}
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm flex flex-col justify-between">
                            <div>
                                <h3 className="text-base font-black text-neutral-dark dark:text-white">Project Lifecycle Status</h3>
                                <p className="text-xs text-secondary dark:text-gray-400 font-medium">Progress division of active and finished engagements</p>
                            </div>
                            <div className="h-[230px] w-full flex items-center justify-center relative my-3">
                                {specialEngagementsReportsData.statusChartData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie 
                                                data={specialEngagementsReportsData.statusChartData} 
                                                cx="50%" 
                                                cy="50%" 
                                                innerRadius={60} 
                                                outerRadius={90} 
                                                paddingAngle={3} 
                                                dataKey="value"
                                            >
                                                {specialEngagementsReportsData.statusChartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                                ))}
                                            </Pie>
                                            <Tooltip />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="text-xs italic text-secondary opacity-50">No special projects match filters.</div>
                                )}
                            </div>
                            <div className="flex justify-center flex-wrap gap-4 border-t border-neutral-medium dark:border-gray-700 pt-3.5">
                                {specialEngagementsReportsData.statusChartData.map((d, index) => (
                                    <div key={index} className="flex items-center gap-1.5">
                                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.fill }} />
                                        <span className="text-[9px] font-black text-secondary dark:text-gray-300 uppercase tracking-widest">{d.name} ({d.value})</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Service Type Saturation */}
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm">
                            <div>
                                <h3 className="text-base font-black text-neutral-dark dark:text-white">Engagements by Consulting Service Type</h3>
                                <p className="text-xs text-secondary dark:text-gray-400 font-medium">saturation of one-time professional services</p>
                            </div>
                            <div className="h-[280px] w-full mt-4">
                                {specialEngagementsReportsData.serviceTypesData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={specialEngagementsReportsData.serviceTypesData} layout="vertical" barSize={12}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme === 'dark' ? '#374151' : '#E5E7EB'} />
                                            <XAxis type="number" tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: theme === 'dark' ? '#9CA3AF' : '#6B7280' }} />
                                            <YAxis dataKey="name" type="category" width={110} tickLine={false} axisLine={false} tick={{ fontSize: 8, fontWeight: 900, fill: theme === 'dark' ? '#9CA3AF' : '#6B7280' }} />
                                            <Tooltip cursor={{ fill: 'transparent' }} />
                                            <Bar dataKey="value" fill="#F9A825" radius={[0, 4, 4, 0]} name="Projects Count" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-xs italic text-secondary opacity-50">No engagements recorded.</div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Progress Tracker list */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm">
                        <div className="mb-5">
                            <h3 className="text-base font-black text-neutral-dark dark:text-white">Active Special Projects Progress Tracker</h3>
                            <p className="text-xs text-secondary dark:text-gray-400 font-medium">Task completed ratio calculated live from task audit logs</p>
                        </div>
                        
                        <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
                            {specialEngagementsReportsData.projectProgressList.length > 0 ? (
                                specialEngagementsReportsData.projectProgressList.map((project, idx) => {
                                    const priorityColors = project.priority === 'High' 
                                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' 
                                        : project.priority === 'Medium' 
                                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' 
                                        : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';

                                    const progressColor = project.status === 'Blocked' 
                                        ? 'bg-rose-500' 
                                        : project.progress === 100 
                                        ? 'bg-emerald-500' 
                                        : 'bg-primary';

                                    return (
                                        <div key={idx} className="p-4 rounded-3xl border border-neutral-medium dark:border-gray-700 bg-neutral-light/20 dark:bg-gray-900/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div className="space-y-1">
                                                <div className="flex items-center flex-wrap gap-2.5">
                                                    <span className="text-xs font-black text-neutral-dark dark:text-white">{project.title}</span>
                                                    <span className={`text-[8px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border ${priorityColors}`}>{project.priority}</span>
                                                    {project.status === 'Blocked' && (
                                                        <span className="text-[8px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-rose-600 text-white animate-pulse">BLOCKED</span>
                                                    )}
                                                </div>
                                                <div className="flex flex-wrap gap-x-3 text-[9px] text-secondary font-black uppercase tracking-wider">
                                                    <span>Client: {project.clientName}</span>
                                                    <span>•</span>
                                                    <span>Staff: {project.assignedStaff}</span>
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-4 shrink-0 min-w-[200px]">
                                                <div className="flex flex-col gap-1 w-full">
                                                    <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-secondary">
                                                        <span>Progress</span>
                                                        <span>{project.completedTasks}/{project.totalTasks} Tasks ({project.progress}%)</span>
                                                    </div>
                                                    <div className="w-full h-2 bg-neutral-medium/40 dark:bg-gray-700 rounded-full overflow-hidden">
                                                        <div className={`h-full ${progressColor} rounded-full transition-all duration-500`} style={{ width: `${project.progress}%` }} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="text-xs italic text-secondary opacity-50 py-10 text-center">No active projects found.</div>
                            )}
                        </div>
                    </div>

                </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* TAB CONTAINER: 4. Staff & Team Workload Capacity (Premium Oversight) */}
            {/* ------------------------------------------------------------- */}
            {activeTab === 'staff' && (
                <div className="space-y-6">
                    {/* Capacity indicators */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm flex items-center gap-4">
                            <div className="w-12 h-12 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-500 shrink-0">
                                <Award size={22} />
                            </div>
                            <div>
                                <h4 className="text-[9px] font-black uppercase tracking-widest text-secondary opacity-60 dark:opacity-100">Senior supervisory avg load</h4>
                                <p className="text-3xl font-black text-neutral-dark dark:text-white mt-0.5">{staffReportsData.averages.seniorAvgLoad} Engagements</p>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm flex items-center gap-4">
                            <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 shrink-0">
                                <Users size={22} />
                            </div>
                            <div>
                                <h4 className="text-[9px] font-black uppercase tracking-widest text-secondary opacity-60 dark:opacity-100">Junior Staff average load</h4>
                                <p className="text-3xl font-black text-neutral-dark dark:text-white mt-0.5">{staffReportsData.averages.juniorAvgLoad} Engagements</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Workload Capacity Bar Chart */}
                        <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm">
                            <div className="mb-6 flex justify-between items-center">
                                <div>
                                    <h3 className="text-base font-black text-neutral-dark dark:text-white">Active Workload Distribution</h3>
                                    <p className="text-xs text-secondary dark:text-gray-400 font-medium">Comparing total retainer engagements and active special projects per staff member</p>
                                </div>
                                <Activity size={18} className="text-primary opacity-60" />
                            </div>
                            
                            <div className="h-[320px] w-full">
                                {staffReportsData.loadChart.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={staffReportsData.loadChart} barSize={16}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#374151' : '#E5E7EB'} />
                                            <XAxis dataKey="name" tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: theme === 'dark' ? '#9CA3AF' : '#6B7280' }} />
                                            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: theme === 'dark' ? '#9CA3AF' : '#6B7280' }} />
                                            <Tooltip />
                                            <Legend verticalAlign="top" height={36} />
                                            <Bar dataKey="Retainers" stackId="a" fill="#3B82F6" radius={[0, 0, 0, 0]} />
                                            <Bar dataKey="Special Projects" stackId="a" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-xs italic text-secondary opacity-50">No staff workload data.</div>
                                )}
                            </div>
                        </div>

                        {/* On-Time Performance Scoreboard list */}
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm flex flex-col justify-between">
                            <div>
                                <div className="mb-4">
                                    <h3 className="text-base font-black text-neutral-dark dark:text-white">Timeliness Scoreboard</h3>
                                    <p className="text-xs text-secondary dark:text-gray-400 font-medium">Historical ratio of on-time tax filings</p>
                                </div>

                                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                                    {staffReportsData.scoreboard.length > 0 ? (
                                        staffReportsData.scoreboard.map((u, i) => {
                                            const score = u.timelinessScore;
                                            const colorClass = score >= 90 ? 'text-emerald-500' : score >= 70 ? 'text-amber-500' : 'text-rose-500';
                                            const bgBar = score >= 90 ? 'bg-emerald-500' : score >= 70 ? 'bg-amber-500' : 'bg-rose-500';

                                            return (
                                                <div key={i} className="flex flex-col gap-1.5 p-2.5 rounded-2xl bg-neutral-light/30 dark:bg-gray-900/30 border border-neutral-medium/50 dark:border-gray-700/50">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-black text-neutral-dark dark:text-white">{u.name}</span>
                                                            <span className="text-[8px] font-black text-secondary uppercase tracking-widest">{u.role} · {u.team}</span>
                                                        </div>
                                                        <span className={`text-xs font-black ${colorClass}`}>{score}%</span>
                                                    </div>
                                                    
                                                    {/* Custom Score Progress bar */}
                                                    <div className="w-full h-1.5 bg-neutral-medium/40 dark:bg-gray-700 rounded-full overflow-hidden">
                                                        <div className={`h-full ${bgBar} rounded-full transition-all duration-500`} style={{ width: `${score}%` }} />
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="text-xs italic text-secondary opacity-50 py-10 text-center">No active users.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* TAB CONTAINER: 5. Operational Logistics (Transmittals & Meetings) */}
            {/* ------------------------------------------------------------- */}
            {activeTab === 'logistics' && (
                <div className="space-y-6">
                    {/* Logistics Summary cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm flex items-center gap-4">
                            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shrink-0">
                                <FileSpreadsheet size={22} />
                            </div>
                            <div>
                                <h4 className="text-[9px] font-black uppercase tracking-widest text-secondary opacity-60 dark:opacity-100">Transmittals Released</h4>
                                <p className="text-3xl font-black text-neutral-dark dark:text-white mt-0.5">{logisticsReportsData.summary.totalTransmittals}</p>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm flex items-center gap-4">
                            <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 shrink-0">
                                <Users size={22} />
                            </div>
                            <div>
                                <h4 className="text-[9px] font-black uppercase tracking-widest text-secondary opacity-60 dark:opacity-100">Meetings Logged</h4>
                                <p className="text-3xl font-black text-neutral-dark dark:text-white mt-0.5">{logisticsReportsData.summary.totalMeetings}</p>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm flex items-center gap-4">
                            <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-500 shrink-0">
                                <Clock size={22} />
                            </div>
                            <div>
                                <h4 className="text-[9px] font-black uppercase tracking-widest text-secondary opacity-60 dark:opacity-100">Meeting Attendance Average</h4>
                                <p className="text-3xl font-black text-neutral-dark dark:text-white mt-0.5">{logisticsReportsData.summary.avgAttendees} Staff</p>
                            </div>
                        </div>
                    </div>

                    {/* Operational Logistics Charts */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        
                        {/* Transmittal Release Volume timeline */}
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm">
                            <div className="mb-6">
                                <h3 className="text-base font-black text-neutral-dark dark:text-white">Document Release Pipeline</h3>
                                <p className="text-xs text-secondary dark:text-gray-400 font-medium">Monthly volume of printed physical/digital transmittal slips</p>
                            </div>
                            <div className="h-[300px] w-full">
                                {logisticsReportsData.transmittalsTimeline.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={logisticsReportsData.transmittalsTimeline}>
                                            <defs>
                                                <linearGradient id="colorTrans" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#B4262A" stopOpacity={0.2}/>
                                                    <stop offset="95%" stopColor="#B4262A" stopOpacity={0}/>
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#374151' : '#E5E7EB'} />
                                            <XAxis dataKey="month" tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: theme === 'dark' ? '#9CA3AF' : '#6B7280' }} />
                                            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: theme === 'dark' ? '#9CA3AF' : '#6B7280' }} />
                                            <Tooltip />
                                            <Legend verticalAlign="top" height={36} />
                                            <Area type="monotone" dataKey="count" stroke="#B4262A" strokeWidth={3} fillOpacity={1} fill="url(#colorTrans)" name="Transmittal Slips Issued" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-xs italic text-secondary opacity-50">No transmittals logged in this scope.</div>
                                )}
                            </div>
                        </div>

                        {/* Top Document Types Table/Bar Chart */}
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm">
                            <div className="mb-6">
                                <h3 className="text-base font-black text-neutral-dark dark:text-white">Top Released Document Types</h3>
                                <p className="text-xs text-secondary dark:text-gray-400 font-medium">Parsing keyword frequency of items packed in transmittals</p>
                            </div>
                            <div className="h-[300px] w-full flex flex-col justify-center">
                                {logisticsReportsData.topDocuments.length > 0 ? (
                                    <div className="space-y-5">
                                        {logisticsReportsData.topDocuments.map((item, idx) => {
                                            const percentage = logisticsReportsData.summary.totalTransmittals > 0 
                                                ? Math.round((item.value / logisticsReportsData.summary.totalTransmittals) * 100) 
                                                : 100;
                                            
                                            return (
                                                <div key={idx} className="space-y-1.5">
                                                    <div className="flex items-center justify-between text-xs font-bold">
                                                        <span className="text-neutral-dark dark:text-white uppercase tracking-tight text-[11px] font-black">{idx + 1}. {item.name}</span>
                                                        <span className="text-secondary">{item.value} times ({percentage}%)</span>
                                                    </div>
                                                    
                                                    {/* Progress bar */}
                                                    <div className="w-full h-2 bg-neutral-medium/40 dark:bg-gray-700 rounded-full overflow-hidden">
                                                        <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${Math.min(100, percentage)}%` }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-xs italic text-secondary opacity-50 text-center py-20">No parsed documents detected. Make sure items are described in transmittals.</div>
                                )}
                            </div>
                        </div>

                    </div>
                </div>
            )}
            
            {/* 4. Printable report footer */}
            <div className="hidden print:flex flex-col items-center justify-center pt-8 border-t border-dashed border-neutral-medium/50 mt-12 text-center">
                <p className="text-[9px] font-black uppercase tracking-[0.25em] text-neutral-dark">MPCA Associates Reports & Analytics</p>
                <p className="text-[8px] font-bold text-secondary mt-1">Generated on {new Date().toDateString()}</p>
            </div>
            
        </div>
    );
};

export default Reports;
