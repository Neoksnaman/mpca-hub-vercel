import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, MessageCircle, Plus, Search, Send, Settings, X } from 'lucide-react';
import { ChatMessage, ChatThread, User } from '../types';
import { fetchChatMessages, fetchChatThreads, markChatThreadRead, sendChatMessage, updateChatThreadSettings } from '../services/googleSheetsService';

interface ChatMessagesProps {
  currentUser: User;
  users: User[];
  pollingPaused?: boolean;
}

const formatTime = (value: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const fullName = (user?: User) => user ? `${user.firstName} ${user.lastName}`.trim() : 'Unknown User';

const ChatMessages: React.FC<ChatMessagesProps> = ({ currentUser, users, pollingPaused = false }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [composeMode, setComposeMode] = useState(false);
  const [composeType, setComposeType] = useState<'direct' | 'group'>('direct');
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeThread, setActiveThread] = useState<ChatThread | null>(null);
  const [selectedRecipient, setSelectedRecipient] = useState('');
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTitle, setSettingsTitle] = useState('');
  const [settingsMembers, setSettingsMembers] = useState<string[]>([]);
  const [settingsAdmins, setSettingsAdmins] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const scrollToLatestPendingRef = useRef(false);

  const userById = useMemo(() => {
    const lookup = new Map<string, User>();
    users.forEach(user => lookup.set(String(user.id), user));
    return lookup;
  }, [users]);

  const activeUsers = useMemo(() => (
    users
      .filter(user => user.status === 'Active' && String(user.id) !== String(currentUser.id))
      .sort((a, b) => fullName(a).localeCompare(fullName(b)))
  ), [currentUser.id, users]);

  const settingsUsers = useMemo(() => (
    users
      .filter(user => user.status === 'Active' || settingsMembers.includes(user.id))
      .sort((a, b) => fullName(a).localeCompare(fullName(b)))
  ), [settingsMembers, users]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return activeUsers;
    return activeUsers.filter(user => fullName(user).toLowerCase().includes(query));
  }, [activeUsers, search]);

  const unreadCount = useMemo(() => threads.reduce((total, thread) => total + (thread.unreadCount || 0), 0), [threads]);

  const isActiveGroupAdmin = useMemo(() => (
    !!activeThread &&
    activeThread.type === 'group' &&
    (activeThread.adminUserIDs || []).map(String).includes(String(currentUser.id))
  ), [activeThread, currentUser.id]);

  const readIndicatorsByMessageId = useMemo(() => {
    const indicators = new Map<string, User[]>();
    const otherParticipantIds = activeThread?.participantUserIDs.filter(id => String(id) !== String(currentUser.id)) || [];
    otherParticipantIds.forEach(participantId => {
      const participantUserId = String(participantId);
      const lastReadMessage = [...messages]
        .reverse()
        .find(message => {
          if (String(message.senderUserID) === participantUserId) return true;
          return (message.readBy || []).some(id => String(id) === participantUserId);
        });
      const user = userById.get(participantUserId);
      if (!lastReadMessage || !user) return;
      const existing = indicators.get(lastReadMessage.id) || [];
      indicators.set(lastReadMessage.id, [...existing, user]);
    });

    return indicators;
  }, [activeThread, currentUser.id, messages, userById]);

  const getThreadTitle = useCallback((thread: ChatThread) => {
    const otherIds = thread.participantUserIDs.filter(id => String(id) !== String(currentUser.id));
    if (thread.type === 'group' && thread.threadTitle) return thread.threadTitle;
    if (otherIds.length === 0) return 'Saved Message';
    return otherIds.map(id => fullName(userById.get(String(id)))).join(', ');
  }, [currentUser.id, userById]);

  const getThreadAvatar = useCallback((thread: ChatThread) => {
    if (thread.type === 'group') return null;
    const otherId = thread.participantUserIDs.find(id => String(id) !== String(currentUser.id));
    return userById.get(String(otherId || ''));
  }, [currentUser.id, userById]);

  const getThreadPreview = useCallback((thread: ChatThread) => {
    if (!thread.lastMessage) return 'No messages yet';
    if (String(thread.lastSenderUserID) === String(currentUser.id)) return `Me: ${thread.lastMessage}`;
    if (thread.type === 'group') {
      const sender = userById.get(String(thread.lastSenderUserID));
      return `${sender?.firstName || 'User'}: ${thread.lastMessage}`;
    }
    return thread.lastMessage;
  }, [currentUser.id, userById]);

  const loadThreads = useCallback(async (silent = false) => {
    if (pollingPaused) return;
    if (!silent) setLoadingThreads(true);
    try {
      const latest = await fetchChatThreads(currentUser.id);
      setThreads(latest);
    } finally {
      if (!silent) setLoadingThreads(false);
    }
  }, [currentUser.id, pollingPaused]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (pollingPaused) return;
      loadThreads(true);
    }, 30000);

    return () => window.clearInterval(interval);
  }, [loadThreads, pollingPaused]);

  useEffect(() => {
    if (pollingPaused || !chatOpen || !activeThread || composeMode) return;

    const interval = window.setInterval(async () => {
      if (document.hidden || loadingOlder) return;
      try {
        const list = messageListRef.current;
        const isNearLatest = list ? list.scrollHeight - list.scrollTop - list.clientHeight < 80 : true;
        const latest = await fetchChatMessages(activeThread.id, currentUser.id, 10);
        setMessages(prev => {
          const existingIds = new Set(prev.map(message => message.id));
          const newMessages = latest.filter(message => !existingIds.has(message.id));
          if (newMessages.length > 0 && isNearLatest) {
            scrollToLatestPendingRef.current = true;
          }
          const latestById = new Map(latest.map(message => [message.id, message]));
          let changed = newMessages.length > 0;
          const mergedMessages = prev.map(message => {
            const updatedMessage = latestById.get(message.id);
            if (!updatedMessage) return message;
            if (JSON.stringify(updatedMessage.readBy || []) !== JSON.stringify(message.readBy || [])) {
              changed = true;
            }
            return { ...message, ...updatedMessage };
          });
          return changed ? [...mergedMessages, ...newMessages] : prev;
        });
        await markChatThreadRead(activeThread.id, currentUser.id);
        loadThreads(true);
      } catch (err) {
        // Keep chat polling quiet so a transient API issue does not interrupt browsing.
      }
    }, 10000);

    return () => window.clearInterval(interval);
  }, [activeThread, chatOpen, composeMode, currentUser.id, loadThreads, loadingOlder, pollingPaused]);

  useEffect(() => {
    if (!scrollToLatestPendingRef.current || loadingMessages) return;
    scrollToLatestPendingRef.current = false;
    window.requestAnimationFrame(() => {
      const list = messageListRef.current;
      if (!list) return;
      list.scrollTop = list.scrollHeight;
      window.requestAnimationFrame(() => {
        list.scrollTop = list.scrollHeight;
      });
    });
  }, [loadingMessages, messages.length]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const openThread = async (thread: ChatThread) => {
    if (pollingPaused) return;
    setDropdownOpen(false);
    setComposeMode(false);
    setSettingsOpen(false);
    setChatOpen(true);
    setActiveThread(thread);
    setMessages([]);
    setHasOlder(true);
    setLoadingMessages(true);
    try {
      const latest = await fetchChatMessages(thread.id, currentUser.id, 10);
      scrollToLatestPendingRef.current = true;
      setMessages(latest);
      setHasOlder(latest.length === 10);
      await markChatThreadRead(thread.id, currentUser.id);
      setThreads(prev => prev.map(item => item.id === thread.id ? { ...item, unreadCount: 0 } : item));
    } finally {
      setLoadingMessages(false);
      loadThreads();
    }
  };

  const startNewMessage = () => {
    setDropdownOpen(false);
    setComposeMode(true);
    setSettingsOpen(false);
    setComposeType('direct');
    setChatOpen(true);
    setActiveThread(null);
    setMessages([]);
    setSelectedRecipient('');
    setSelectedRecipients([]);
    setGroupTitle('');
    setDraft('');
    setSearch('');
    setHasOlder(false);
  };

  const toggleSelectedRecipient = (userId: string) => {
    setSelectedRecipients(prev => (
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    ));
  };

  const openGroupSettings = () => {
    if (!activeThread || activeThread.type !== 'group') return;
    if (settingsOpen) {
      setSettingsOpen(false);
      return;
    }
    setSettingsTitle(activeThread.threadTitle || '');
    setSettingsMembers(activeThread.participantUserIDs || []);
    setSettingsAdmins(activeThread.adminUserIDs?.length ? activeThread.adminUserIDs : [currentUser.id]);
    setSettingsOpen(true);
  };

  const toggleSettingsMember = (userId: string) => {
    if (String(userId) === String(currentUser.id)) return;
    setSettingsMembers(prev => {
      const exists = prev.includes(userId);
      const next = exists ? prev.filter(id => id !== userId) : [...prev, userId];
      if (exists) setSettingsAdmins(admins => admins.filter(id => id !== userId));
      return Array.from(new Set([...next, currentUser.id]));
    });
  };

  const toggleSettingsAdmin = (userId: string) => {
    if (!settingsMembers.includes(userId)) return;
    setSettingsAdmins(prev => {
      const exists = prev.includes(userId);
      const next = exists ? prev.filter(id => id !== userId) : [...prev, userId];
      return next.length > 0 ? next : prev;
    });
  };

  const saveGroupSettings = async () => {
    if (!activeThread || activeThread.type !== 'group') return;
    const result = await updateChatThreadSettings({
      threadId: activeThread.id,
      userId: currentUser.id,
      threadTitle: settingsTitle.trim(),
      participantUserIDs: settingsMembers,
      adminUserIDs: settingsAdmins,
    });
    setActiveThread(result.thread);
    setThreads(prev => prev.map(thread => thread.id === result.thread.id ? result.thread : thread));
    setSettingsOpen(false);
    loadThreads(true);
  };

  const loadOlderMessages = async () => {
    if (pollingPaused || !activeThread || loadingOlder || !hasOlder || messages.length === 0) return;
    const list = messageListRef.current;
    const previousScrollHeight = list?.scrollHeight || 0;
    const firstMessage = messages[0];
    setLoadingOlder(true);
    try {
      const older = await fetchChatMessages(activeThread.id, currentUser.id, 10, firstMessage.createdAt);
      setMessages(prev => [...older, ...prev]);
      setHasOlder(older.length === 10);
      setTimeout(() => {
        if (!list) return;
        list.scrollTop = list.scrollHeight - previousScrollHeight;
      }, 50);
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleSend = async () => {
    if (pollingPaused) return;
    const text = draft.trim();
    if (!text) return;
    const recipientIds = activeThread
      ? activeThread.participantUserIDs.filter(id => String(id) !== String(currentUser.id))
      : composeType === 'group' ? selectedRecipients : selectedRecipient ? [selectedRecipient] : [];
    const threadTitle = groupTitle.trim();
    if (recipientIds.length === 0) return;
    if (!activeThread && composeType === 'group' && recipientIds.length < 2) return;

    setDraft('');
    const result = await sendChatMessage({
      threadId: activeThread?.id,
      senderUserID: currentUser.id,
      recipientUserIDs: recipientIds,
      message: text,
      type: activeThread?.type || composeType,
      threadTitle: activeThread?.threadTitle || threadTitle,
    });
    const threadId = activeThread?.id || result.threadId;
    scrollToLatestPendingRef.current = true;
    setMessages(prev => [...prev, result.message]);
    const latestThreads = await fetchChatThreads(currentUser.id);
    setThreads(latestThreads);
    const nextThread = latestThreads.find(thread => thread.id === threadId);
    if (nextThread) {
      setActiveThread(nextThread);
      setComposeMode(false);
    }
  };

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => {
            const nextOpen = !dropdownOpen;
            setDropdownOpen(nextOpen);
            if (nextOpen) loadThreads();
          }}
          className="w-8 h-8 flex items-center justify-center text-neutral-dark dark:text-neutral-light relative hover:bg-neutral-light dark:hover:bg-gray-700 rounded-full transition-colors"
          title="Messages"
        >
          <MessageCircle size={20} />
          {unreadCount > 0 && (
            <span className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-error border-2 border-white dark:border-gray-800 text-[8px] font-bold text-white items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            </span>
          )}
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 mt-3 w-80 bg-white dark:bg-gray-800 rounded-[1.5rem] shadow-2xl py-2 z-50 border border-neutral-medium dark:border-gray-700 overflow-hidden transform origin-top-right transition-all">
            <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-medium/50 dark:border-gray-700/50">
              <h3 className="text-xs font-black text-neutral-dark dark:text-white uppercase tracking-wider">Messages</h3>
              <button onClick={startNewMessage} className="text-[10px] font-black text-primary hover:text-primary-dark transition-colors flex items-center gap-1">
                <Plus size={12} /> Add New Message
              </button>
            </div>
            <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
              {loadingThreads ? (
                <div className="p-8 text-center text-xs font-bold text-secondary">Loading messages...</div>
              ) : threads.length === 0 ? (
                <div className="p-8 text-center flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-neutral-light dark:bg-gray-700 flex items-center justify-center mb-3">
                    <Check className="text-secondary/50" size={24} />
                  </div>
                  <p className="text-sm font-bold text-neutral-dark dark:text-white">No messages yet</p>
                  <p className="text-[10px] font-medium text-secondary mt-1">Start a conversation with the office team.</p>
                </div>
              ) : (
                threads.map(thread => {
                  const avatarUser = getThreadAvatar(thread);
                  const isUnread = thread.unreadCount > 0;
                  return (
                    <button
                      key={thread.id}
                      onClick={() => openThread(thread)}
                      className={`w-full flex items-start gap-3 p-4 text-left transition-colors border-b border-neutral-medium/30 dark:border-gray-700/30 hover:bg-neutral-light/50 dark:hover:bg-gray-700/50 ${isUnread ? 'bg-[#1a73e8]/5 dark:bg-[#1a73e8]/10' : ''}`}
                    >
                      {avatarUser?.avatarUrl ? (
                        <img src={avatarUser.avatarUrl} alt={fullName(avatarUser)} className="mt-0.5 w-8 h-8 rounded-full border border-neutral-medium object-cover shrink-0" />
                      ) : thread.type === 'group' ? (
                        <div className="mt-0.5 w-8 h-8 rounded-full border border-primary/20 bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <MessageCircle size={14} />
                        </div>
                      ) : (
                        <div className="mt-0.5 w-8 h-8 rounded-full border border-neutral-medium bg-primary/10 text-primary flex items-center justify-center shrink-0 text-[10px] font-black">
                          {getThreadTitle(thread).charAt(0)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-xs truncate ${isUnread ? 'font-black text-neutral-dark dark:text-white' : 'font-bold text-neutral-dark/80 dark:text-gray-300'}`}>{getThreadTitle(thread)}</p>
                          <p className="text-[9px] font-bold text-secondary/50 shrink-0">{formatTime(thread.lastMessageAt)}</p>
                        </div>
                        <p className={`text-[10px] mt-1 leading-relaxed line-clamp-2 ${isUnread ? 'font-bold text-secondary dark:text-gray-400' : 'font-medium text-secondary/70 dark:text-gray-500'}`}>{getThreadPreview(thread)}</p>
                      </div>
                      {isUnread && <span className="shrink-0 w-2 h-2 rounded-full bg-[#1a73e8] mt-2"></span>}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {chatOpen && (
        <div className="fixed bottom-5 right-5 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[540px] max-h-[calc(100vh-6rem)] bg-white dark:bg-gray-800 border border-neutral-medium dark:border-gray-700 rounded-[1.5rem] shadow-2xl overflow-hidden flex flex-col">
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-neutral-medium/60 dark:border-gray-700/60">
            <div className="flex items-center gap-3 min-w-0">
              {!composeMode && (
                <button onClick={() => { setChatOpen(false); setActiveThread(null); setSettingsOpen(false); }} className="text-secondary hover:text-neutral-dark">
                  <ChevronLeft size={18} />
                </button>
              )}
              <div className="min-w-0">
                <p className="text-sm font-black text-neutral-dark dark:text-white truncate">
                  {composeMode ? 'New Message' : activeThread ? getThreadTitle(activeThread) : 'Messages'}
                </p>
                <p className="text-[10px] font-bold text-secondary">
                  {activeThread?.type === 'group' ? `${activeThread.participantUserIDs.length} members` : 'Office chat'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {activeThread?.type === 'group' && (
                <button
                  onClick={openGroupSettings}
                  className={`rounded-full p-1.5 transition-colors ${settingsOpen ? 'bg-primary/10 text-primary' : 'text-secondary hover:bg-neutral-light hover:text-primary dark:hover:bg-gray-700'}`}
                  title="Group settings"
                >
                  <Settings size={16} />
                </button>
              )}
              <button onClick={() => { setChatOpen(false); setSettingsOpen(false); }} className="text-secondary hover:text-neutral-dark dark:hover:text-white">
                <X size={18} />
              </button>
            </div>
          </div>

          {activeThread?.type === 'group' && (
            <div className={`overflow-hidden border-b border-neutral-medium/60 bg-white transition-all duration-300 ease-out dark:border-gray-700/60 dark:bg-gray-800 ${settingsOpen ? 'max-h-[360px] opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className={`p-4 space-y-3 transition-transform duration-300 ease-out ${settingsOpen ? 'translate-y-0' : '-translate-y-2'}`}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-black text-neutral-dark dark:text-white">Group Settings</p>
                {!isActiveGroupAdmin && <p className="text-[10px] font-bold text-secondary">View only</p>}
              </div>
              <input
                value={settingsTitle}
                onChange={(e) => setSettingsTitle(e.target.value)}
                disabled={!isActiveGroupAdmin}
                placeholder="Group title (optional)"
                className="w-full px-3 py-2 rounded-xl border border-neutral-medium dark:border-gray-700 bg-white dark:bg-gray-900 text-xs font-bold outline-none focus:border-primary disabled:opacity-60"
              />
              <div className="max-h-36 overflow-y-auto custom-scrollbar border border-neutral-medium/70 dark:border-gray-700 rounded-xl">
                {settingsUsers.map(user => {
                  const isMember = settingsMembers.includes(user.id);
                  const isAdmin = settingsAdmins.includes(user.id);
                  const canToggleMember = isActiveGroupAdmin && String(user.id) !== String(currentUser.id);
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => canToggleMember && toggleSettingsMember(user.id)}
                      disabled={!canToggleMember}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left border-b border-neutral-medium/30 last:border-b-0 transition-colors ${canToggleMember ? 'hover:bg-neutral-light/70 dark:hover:bg-gray-700/50' : 'cursor-default'}`}
                    >
                      <span className={`text-xs font-bold ${isMember ? 'text-neutral-dark dark:text-white' : 'text-secondary'}`}>
                        {fullName(user)}
                        {String(user.id) === String(currentUser.id) && <span className="ml-1 text-[9px] text-primary">You</span>}
                      </span>
                      <div className="flex items-center gap-2">
                        {isMember && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              isActiveGroupAdmin && toggleSettingsAdmin(user.id);
                            }}
                            disabled={!isActiveGroupAdmin}
                            className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${isAdmin ? 'bg-primary/10 text-primary' : 'bg-neutral-light text-secondary dark:bg-gray-900'}`}
                          >
                            {isAdmin ? 'Admin' : 'Member'}
                          </button>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {isActiveGroupAdmin && (
                <div className="flex gap-2">
                  <button onClick={() => setSettingsOpen(false)} className="flex-1 rounded-xl border border-neutral-medium px-3 py-2 text-[10px] font-black uppercase tracking-wider text-secondary">
                    Cancel
                  </button>
                  <button
                    onClick={saveGroupSettings}
                    disabled={settingsMembers.length < 3 || settingsAdmins.length === 0}
                    className="flex-1 rounded-xl bg-primary px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white disabled:opacity-40"
                  >
                    Save
                  </button>
                </div>
              )}
              </div>
            </div>
          )}

          {composeMode && (
            <div className="p-4 border-b border-neutral-medium/60 dark:border-gray-700/60 space-y-3">
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-neutral-light/70 dark:bg-gray-900 p-1">
                {(['direct', 'group'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => {
                      setComposeType(type);
                      setSelectedRecipient('');
                      setSelectedRecipients([]);
                    }}
                    className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-colors ${composeType === type ? 'bg-white text-primary shadow-sm dark:bg-gray-800' : 'text-secondary hover:text-neutral-dark dark:hover:text-white'}`}
                  >
                    {type === 'direct' ? 'Direct' : 'Group'}
                  </button>
                ))}
              </div>
              {composeType === 'group' && (
                <input
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                  placeholder="Group name (optional)..."
                  className="w-full px-3 py-2 rounded-xl border border-neutral-medium dark:border-gray-700 bg-white dark:bg-gray-900 text-xs font-bold outline-none focus:border-primary"
                />
              )}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary/60" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={composeType === 'group' ? 'Search and add members...' : 'Search staff...'}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-neutral-medium dark:border-gray-700 bg-white dark:bg-gray-900 text-xs font-bold outline-none focus:border-primary"
                />
              </div>
              {composeType === 'group' && selectedRecipients.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedRecipients.map(userId => {
                    const user = userById.get(userId);
                    return (
                      <button
                        key={userId}
                        onClick={() => toggleSelectedRecipient(userId)}
                        className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-black text-primary"
                      >
                        {user?.firstName || 'User'} x
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="max-h-28 overflow-y-auto custom-scrollbar border border-neutral-medium/70 dark:border-gray-700 rounded-xl">
                {filteredUsers.map(user => (
                  <button
                    key={user.id}
                    onClick={() => composeType === 'group' ? toggleSelectedRecipient(user.id) : setSelectedRecipient(user.id)}
                    className={`w-full px-3 py-2 text-left text-xs font-bold hover:bg-neutral-light dark:hover:bg-gray-700 ${
                      (composeType === 'group' ? selectedRecipients.includes(user.id) : selectedRecipient === user.id)
                        ? 'bg-primary/10 text-primary'
                        : 'text-neutral-dark dark:text-white'
                    }`}
                  >
                    {fullName(user)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={messageListRef} className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 bg-neutral-light/30 dark:bg-gray-900/40">
            {loadingMessages ? (
              <div className="h-full flex items-center justify-center text-xs font-bold text-secondary">Loading conversation...</div>
            ) : composeMode ? (
              <div className="h-full flex items-center justify-center text-center px-6">
                <p className="text-xs font-bold text-secondary">Choose a recipient, then type your message below.</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center px-6">
                <p className="text-xs font-bold text-secondary">No messages in this conversation yet.</p>
              </div>
            ) : (
              <>
                {hasOlder && (
                  <div className="flex justify-center">
                    <button
                      onClick={loadOlderMessages}
                      disabled={loadingOlder}
                      className="rounded-full border border-neutral-medium bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wider text-secondary shadow-sm transition-colors hover:border-primary hover:text-primary disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800"
                    >
                      {loadingOlder ? 'Loading older messages...' : 'Load older messages'}
                    </button>
                  </div>
                )}
                {messages.map(message => {
                  const mine = String(message.senderUserID) === String(currentUser.id);
                  const readIndicatorUsers = readIndicatorsByMessageId.get(message.id) || [];
                  return (
                    <div key={message.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[78%] rounded-2xl px-4 py-2 shadow-sm ${mine ? 'bg-primary text-white rounded-br-md' : 'bg-white dark:bg-gray-800 text-neutral-dark dark:text-white border border-neutral-medium/70 dark:border-gray-700 rounded-bl-md'}`}>
                        {!mine && <p className="text-[9px] font-black text-secondary mb-1">{fullName(userById.get(String(message.senderUserID)))}</p>}
                        <p className="text-xs font-semibold leading-relaxed whitespace-pre-wrap">{message.message}</p>
                        <p className={`text-[9px] font-bold mt-1 ${mine ? 'text-right text-white/70' : 'text-secondary/60'}`}>{formatTime(message.createdAt)}</p>
                      </div>
                      {readIndicatorUsers.length > 0 && (
                        <div className="mt-1 w-full flex justify-end">
                          <div className="flex -space-x-1">
                            {readIndicatorUsers.slice(0, 5).map(user => (
                              user.avatarUrl ? (
                                <img
                                  key={user.id}
                                  src={user.avatarUrl}
                                  alt={`${fullName(user)} read this message`}
                                  title={`${fullName(user)} read this message`}
                                  className="h-4 w-4 rounded-full border border-white object-cover shadow-sm"
                                />
                              ) : (
                                <div
                                  key={user.id}
                                  title={`${fullName(user)} read this message`}
                                  className="h-4 w-4 rounded-full border border-white bg-primary/10 text-[7px] font-black text-primary flex items-center justify-center shadow-sm"
                                >
                                  {fullName(user).charAt(0)}
                                </div>
                              )
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>

          <div className="p-4 border-t border-neutral-medium/60 dark:border-gray-700/60 bg-white dark:bg-gray-800">
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Type a message..."
                rows={2}
                className="flex-1 resize-none rounded-2xl border border-neutral-medium dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-xs font-semibold outline-none focus:border-primary"
              />
              <button
                onClick={handleSend}
                disabled={!draft.trim() || (composeMode && (composeType === 'group' ? selectedRecipients.length < 2 : !selectedRecipient))}
                className="h-11 w-11 rounded-full bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatMessages;
