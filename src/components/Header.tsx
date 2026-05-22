
import React, { useContext, useState, useRef, useEffect } from 'react';
import { Menu, Bell, User, Sun, Moon, Briefcase, Calendar, Check, AlertCircle } from 'lucide-react';
import { AppContext } from '../App';
import { markNotificationRead, markAllNotificationsRead } from '../services/googleSheetsService';
import { months, computeActualDueDate, parseDateStr } from '../utils/dateUtils';

const AUTO_NOTIF_IDS = ['approaching-deadlines', 'overdue-deadlines', 'transmittal-upload-warning'];

interface HeaderProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const Header: React.FC<HeaderProps> = ({ isSidebarOpen, setIsSidebarOpen }) => {
  const context = useContext(AppContext);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setImgError(false);
  }, [context?.user?.avatarUrl]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
            setNotificationsOpen(false);
        }
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
            setDropdownOpen(false);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!context) return null;
  const { theme, toggleTheme, user, notifications, refreshData } = context;

  let userNotifications = (notifications || []).filter(n => String(n.userId) === String(user?.id));

  // --- DYNAMIC DEADLINE NOTIFICATIONS ---
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;
  const userFullName = `${user?.firstName} ${user?.lastName}`.trim();
  const normalizeId = (id: any) => String(id || '').trim().replace(/^0+/, '') || '0';

  let approachingSpecials = 0;
  let overdueSpecials = 0;
  let approachingRetainers = 0;
  let overdueRetainers = 0;

  // --- Role Visibility Helper ---
  const isManagerOrAbove = user?.role === 'Manager' || user?.role === 'Supervisor' || user?.role === 'Admin';
  
  const isItemVisible = (assignedStaff: string) => {
      if (isManagerOrAbove) return true;
      const staffName = String(assignedStaff || '').trim();
      const isOwn = staffName === user?.firstName || staffName === `${user?.firstName} ${user?.lastName}` || staffName === userFullName || staffName === user?.id;
      if (isOwn) return true;
      
      if (user?.role === 'Senior') {
          const staff = (context.users || []).find((u: any) => u.firstName === staffName || `${u.firstName} ${u.lastName}` === staffName || String(u.id) === staffName);
          return !!(staff && staff.team === user.team);
      }
      return false;
  };

  // 1. Check Specials
  const mySpecials = (context.specials || []).filter(s => isItemVisible(s.assignedStaff));
  mySpecials.forEach(s => {
      if (s.status === 'Completed' || !s.endDate) return;
      const endDate = parseDateStr(s.endDate);
      if (!endDate || isNaN(endDate.getTime())) return;
      endDate.setHours(12, 0, 0, 0);
      const diff = endDate.getTime() - now.getTime();
      if (diff >= 0 && diff <= fiveDaysMs) {
          approachingSpecials++;
      } else if (diff < 0) {
          overdueSpecials++;
      }
  });

  // 2. Check Retainers
  const myRetainers = (context.retainers || []).filter(r => isItemVisible(r.assignedStaff));
  const currentMonthIdx = now.getMonth();
  const currentYear = now.getFullYear();
  
  const prevMonthIdx1 = (currentMonthIdx - 1 + 12) % 12;
  const prevMonthIdx2 = (currentMonthIdx - 2 + 12) % 12;
  const prevMonth1Year = currentMonthIdx - 1 < 0 ? currentYear - 1 : currentYear;
  const prevMonth2Year = currentMonthIdx - 2 < 0 ? currentYear - 1 : currentYear;

  const monthsToCheck = [
      { month: months[prevMonthIdx2], monthIdx: prevMonthIdx2, year: prevMonth2Year },
      { month: months[prevMonthIdx1], monthIdx: prevMonthIdx1, year: prevMonth1Year },
      { month: months[currentMonthIdx], monthIdx: currentMonthIdx, year: currentYear },
      { month: months[(currentMonthIdx + 1) % 12], monthIdx: (currentMonthIdx + 1) % 12, year: currentYear + (currentMonthIdx === 11 ? 1 : 0) }
  ];

  context.deadlines?.forEach(d => {
      const retainer = myRetainers.find(r => normalizeId(r.id) === normalizeId(d.retainerID));
      if (!retainer) return;
      const client = context.clients?.find(c => normalizeId(c.id) === normalizeId(retainer.clientId));
      if (!client || client.status === 'Inactive') return;

      const frequency = d.dueDate.startsWith('M') ? 'Monthly' :
          d.dueDate.startsWith('Q') ? 'Quarterly' :
              (d.dueDate.startsWith('Y') || d.dueDate.startsWith('A')) ? 'Annual' : 'Monthly';

      const calendarOnlyTaxIDs = ['0007', '0008', '0012', '0013', '0016', '0017', '0018', '0019', '0020', '0021', '0022'].map(id => normalizeId(id));
      const isCalendarOnly = calendarOnlyTaxIDs.includes(normalizeId(d.taxID));
      const normalizedTaxID = normalizeId(d.taxID);
      
      monthsToCheck.forEach(({ month, monthIdx, year }) => {
          const currentMonthNum = monthIdx + 1;
          let fyMonth = isCalendarOnly ? 12 : (client?.fiscalYearEnd ? parseInt(client.fiscalYearEnd.split('/')[0], 10) : 12);

          // Special Rule: 0619E (0001) and 0619F (0002) have no March, June, September, and December
          if (['1', '2'].includes(normalizedTaxID)) {
              if ([3, 6, 9, 12].includes(currentMonthNum)) return;
          }

          if (frequency === 'Quarterly') {
              const diff = (currentMonthNum - fyMonth + 12) % 3;
              if (diff !== 0) return;
              const no4thQtrTaxIDs = ['0009', '0010', '0014', '0015'].map(id => normalizeId(id));
              if (no4thQtrTaxIDs.includes(normalizedTaxID) && currentMonthNum === fyMonth) return;
          } else if (frequency === 'Annual') {
              if (currentMonthNum !== fyMonth) return;
          }

          const dueInfo = computeActualDueDate(month, String(year), d.dueDate, isCalendarOnly ? '12/31' : (client?.fiscalYearEnd || '12/31'));
          const periodKey = `${String(currentMonthNum).padStart(2, '0')}/${year}`;
          const match = context.retainerLogs?.find(l => normalizeId(l[0]) === normalizeId(d.deadlineID) && l[1] === periodKey);
          
          if (!match || !match[2]) { // Not filed yet
             const compareDue = dueInfo.raw;
             compareDue.setHours(12, 0, 0, 0);
             const diff = compareDue.getTime() - now.getTime();
             if (diff >= 0 && diff <= threeDaysMs) {
                 approachingRetainers++;
             } else if (diff < 0) {
                 overdueRetainers++;
             }
          }
      });
  });

  // 2.5 Check Transmittals
  let unuploadedTransmittals = 0;
  (context.transmittals || []).forEach(t => {
      if (!isManagerOrAbove && String(t.userID) !== String(user?.id)) return;
      if (t.receiptUrl) return; // receiptUrl exists means status is 'Delivered', empty means 'Released'

      const creationDate = parseDateStr(t.date);
      if (!creationDate) return;
      creationDate.setHours(12, 0, 0, 0);

      const diffMs = now.getTime() - creationDate.getTime();
      const threeDaysMsLimit = 3 * 24 * 60 * 60 * 1000;

      if (diffMs >= threeDaysMsLimit) {
          unuploadedTransmittals++;
      }
  });

  // 3. Inject Dynamic Notifications
  const dynamicNotifs = [];

  if (approachingRetainers > 0 || approachingSpecials > 0) {
      const summaryMsg = [];
      if (approachingRetainers > 0) summaryMsg.push(`${approachingRetainers} Retainer task(s) due in < 3 days`);
      if (approachingSpecials > 0) summaryMsg.push(`${approachingSpecials} Special project(s) due in < 5 days`);
      
      dynamicNotifs.push({
          id: 'approaching-deadlines',
          userId: String(user?.id),
          title: 'Approaching Deadlines!',
          message: summaryMsg.join(' • '),
          type: 'Engagement',
          link: '/engagements',
          isRead: false,
          createdAt: new Date().toISOString()
      });
  }

  if (overdueRetainers > 0 || overdueSpecials > 0) {
      const summaryMsg = [];
      if (overdueRetainers > 0) summaryMsg.push(`${overdueRetainers} Retainer task(s) overdue`);
      if (overdueSpecials > 0) summaryMsg.push(`${overdueSpecials} Special project(s) overdue`);
      
      dynamicNotifs.push({
          id: 'overdue-deadlines',
          userId: String(user?.id),
          title: 'Overdue Tasks!',
          message: summaryMsg.join(' • '),
          type: 'Overdue',
          link: '/engagements',
          isRead: false,
          createdAt: new Date(Date.now() - 1000).toISOString()
      });
  }

  if (unuploadedTransmittals > 0) {
      dynamicNotifs.push({
          id: 'transmittal-upload-warning',
          userId: String(user?.id),
          title: 'Pending Scan & Upload!',
          message: `${unuploadedTransmittals} transmittal(s) pending scan & upload for 3+ days`,
          type: 'TransmittalWarning',
          link: '/operations',
          isRead: false,
          createdAt: new Date(Date.now() - 2000).toISOString()
      });
  }

  userNotifications = [
      ...dynamicNotifs,
      ...userNotifications
  ];

  const unreadCount = userNotifications.filter(n => !n.isRead).length;

  const handleMarkRead = async (id: string, e?: React.MouseEvent) => {
      e?.preventDefault();
      e?.stopPropagation();
      if (AUTO_NOTIF_IDS.includes(id)) return;
      try {
          await markNotificationRead(id);
          await refreshData(true);
      } catch (err) {
      }
  };

  const handleMarkAllRead = async () => {
      if (!user) return;
      try {
          await markAllNotificationsRead(user.id);
          await refreshData(true);
      } catch (err) {
      }
  };

  const getNotificationIcon = (type: string) => {
      if (type === 'Engagement') return <Briefcase size={14} className="text-[#1a73e8]" />;
      if (type === 'Client') return <User size={14} className="text-emerald-500" />;
      if (type === 'Operation') return <Calendar size={14} className="text-amber-500" />;
      if (type === 'Overdue') return <AlertCircle size={14} className="text-red-500 animate-pulse" />;
      if (type === 'TransmittalWarning') return <AlertCircle size={14} className="text-amber-500 animate-pulse" />;
      return <Bell size={14} className="text-secondary" />;
  };

  return (
    <header className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-neutral-medium dark:border-gray-700">
      <div className="flex items-center justify-between p-4 h-16">
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="text-neutral-dark dark:text-neutral-light focus:outline-none"
        >
          <Menu size={24} />
        </button>
        
        <div className="flex items-center space-x-4">
          <button onClick={toggleTheme} className="text-neutral-dark dark:text-neutral-light">
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>
          
          <div className="relative" ref={notifRef}>
            <button 
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="text-neutral-dark dark:text-neutral-light relative p-1.5 hover:bg-neutral-light dark:hover:bg-gray-700 rounded-full transition-colors"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-error border-2 border-white dark:border-gray-800 text-[8px] font-bold text-white items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                </span>
              )}
            </button>
            {notificationsOpen && (
               <div className="absolute right-0 mt-3 w-80 bg-white dark:bg-gray-800 rounded-[1.5rem] shadow-2xl py-2 z-50 border border-neutral-medium dark:border-gray-700 overflow-hidden transform origin-top-right transition-all">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-medium/50 dark:border-gray-700/50">
                      <h3 className="text-xs font-black text-neutral-dark dark:text-white uppercase tracking-wider">Notifications</h3>
                      {unreadCount > 0 && (
                          <button onClick={handleMarkAllRead} className="text-[10px] font-bold text-[#1a73e8] hover:text-blue-800 transition-colors">
                              Mark all as read
                          </button>
                      )}
                  </div>
                  <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
                      {userNotifications.length === 0 ? (
                          <div className="p-8 text-center flex flex-col items-center">
                              <div className="w-12 h-12 rounded-full bg-neutral-light dark:bg-gray-700 flex items-center justify-center mb-3">
                                  <Check className="text-secondary/50" size={24} />
                              </div>
                              <p className="text-sm font-bold text-neutral-dark dark:text-white">You're all caught up!</p>
                              <p className="text-[10px] font-medium text-secondary mt-1">No new notifications right now.</p>
                          </div>
                      ) : (
                          userNotifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(n => (
                              <a 
                                key={n.id} 
                                href={'#' + n.link}
                                onClick={() => { if (!n.isRead && !AUTO_NOTIF_IDS.includes(n.id)) handleMarkRead(n.id); setNotificationsOpen(false); }}
                                className={`flex items-start gap-3 p-4 transition-colors border-b border-neutral-medium/30 dark:border-gray-700/30 hover:bg-neutral-light/50 dark:hover:bg-gray-700/50 ${!n.isRead ? 'bg-[#1a73e8]/5 dark:bg-[#1a73e8]/10' : ''}`}
                              >
                                  <div className={`mt-0.5 w-8 h-8 rounded-full border flex items-center justify-center shrink-0 shadow-sm ${!n.isRead ? 'bg-white dark:bg-gray-800 border-[#1a73e8]/30' : 'bg-neutral-light dark:bg-gray-900 border-neutral-medium dark:border-gray-700'}`}>
                                      {getNotificationIcon(n.type)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                      <p className={`text-xs ${!n.isRead ? 'font-black text-neutral-dark dark:text-white' : 'font-bold text-neutral-dark/80 dark:text-gray-300'} truncate`}>{n.title}</p>
                                      <p className={`text-[10px] font-medium mt-1 leading-relaxed ${!n.isRead ? 'text-secondary dark:text-gray-400' : 'text-secondary/70 dark:text-gray-500'} line-clamp-2`}>{n.message}</p>
                                      <p className="text-[9px] font-bold text-secondary/50 mt-1.5 uppercase tracking-wider">{new Date(n.createdAt).toLocaleDateString()} {new Date(n.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                                  </div>
                                  {!n.isRead && !AUTO_NOTIF_IDS.includes(n.id) && (
                                      <button onClick={(e) => handleMarkRead(n.id, e)} className="shrink-0 w-2 h-2 rounded-full bg-[#1a73e8] mt-1.5 group relative cursor-pointer" title="Mark as read">
                                          <div className="absolute inset-[-6px] rounded-full group-hover:bg-[#1a73e8]/20"></div>
                                      </button>
                                  )}
                              </a>
                          ))
                      )}
                  </div>
               </div>
            )}
          </div>
          
          <div className="relative" ref={dropdownRef}>
            <button onClick={() => setDropdownOpen(!dropdownOpen)} className="flex items-center space-x-2">
                {user?.avatarUrl && user.avatarUrl.trim() !== '' && !imgError ? (
                  <img
                    src={user.avatarUrl}
                    alt="User Avatar"
                    className="w-8 h-8 rounded-full border border-neutral-medium object-cover"
                    onError={() => setImgError(true)}
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full border border-neutral-medium bg-primary text-white flex items-center justify-center font-bold text-sm">
                    {user?.firstName?.charAt(0).toUpperCase() || 'G'}
                  </div>
                )}
                <div className="hidden md:block text-left">
                  <p className="font-semibold text-sm text-neutral-dark dark:text-neutral-light">{user?.firstName || 'Guest'}</p>
                  <p className="text-xs text-secondary dark:text-gray-400">{user?.role || 'User'}</p>
                </div>
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 mt-3 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg py-1 z-10 border border-neutral-medium dark:border-gray-700 overflow-hidden">
                <a href="#/settings" className="block px-4 py-2 text-sm text-neutral-dark dark:text-neutral-light hover:bg-neutral-light dark:hover:bg-gray-700">Profile Settings</a>
                <button 
                  onClick={() => context.logout()}
                  className="w-full text-left block px-4 py-2 text-sm text-error hover:bg-error/10"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
