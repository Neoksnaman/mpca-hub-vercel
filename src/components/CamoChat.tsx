import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2, Send, X } from 'lucide-react';
import { AppContext } from '../App';
import { sendCamoMessage } from '../services/googleSheetsService';

type CamoMessage = {
  id: string;
  role: 'assistant' | 'user';
  content: string;
};

const CAMO_INTRO =
  "Hi, I'm Camo, your MPCA AI Assistant. I can help with MPCA workflows, government lookup questions, drafting, explanations, planning, and general work tasks. What would you like to do?";

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const MAX_CONTEXT_ITEMS = 40;
const CAMO_PEEK_SESSION_KEY = 'mpca_camo_peek_count';
const CAMO_PEEK_DELAYS = [10000, 180000, 480000];
const CAMO_PEEK_VISIBLE_MS = 7000;
const CAMO_PEEK_MESSAGES = [
  'Need help?',
  'Ask Camo',
  'Hoot hoot?',
  'Quick question?',
  'I can help',
  'Need a draft?',
  'Ask away',
  "Camo's here",
  'Wise move?',
  'Tiny hoot?',
  'Hoot for help?',
  'Need wisdom?',
  'Owl check?',
  'Draft time?',
  'Lost in tabs?',
  'Need a clue?',
  'Camo sees it',
  'Work buddy?',
  'One quick hoot?',
  'Need a nudge?',
  'Fresh eyes?',
  'Ask the owl',
  'Hoot if stuck',
  'Plan it out?',
  'Need a shortcut?',
  'Tiny assist?',
  'Let us solve it',
  'Camo can help'
];

const getRandomCamoPeek = () => CAMO_PEEK_MESSAGES[Math.floor(Math.random() * CAMO_PEEK_MESSAGES.length)];

const getCamoPeekCount = () => {
  try {
    const count = Number(sessionStorage.getItem(CAMO_PEEK_SESSION_KEY) || 0);
    return Number.isFinite(count) ? count : 0;
  } catch {
    return CAMO_PEEK_DELAYS.length;
  }
};

const setCamoPeekCount = (count: number) => {
  try {
    sessionStorage.setItem(CAMO_PEEK_SESSION_KEY, String(count));
  } catch {
    // Non-critical: the peek schedule simply resets on the next page load.
  }
};

const normalizeText = (value: any) => String(value || '').toLowerCase();

const includesPromptTerm = (record: any, prompt: string) => {
  const term = normalizeText(prompt);
  if (!term) return false;
  const recordText = normalizeText(JSON.stringify(record));
  return term
    .split(/\s+/)
    .filter(part => part.length >= 3)
    .some(part => recordText.includes(part));
};

const MPCA_DATA_PROMPT_PATTERN = /\b(client|clients|tin|rdo|retainer|retainers|special|project|projects|engagement|engagements|deadline|deadlines|due|overdue|pending|filed|filing|staff|assigned|service|services|tax|compliance|transmittal|transmittals|meeting|meetings|manual|library|task|tasks|operation|operations|status|who handles|who is|which client|show me|list|how many)\b/i;

const shouldIncludeDetailedMpcaContext = (prompt: string) => MPCA_DATA_PROMPT_PATTERN.test(prompt);

const compactUser = (user: any) => ({
  id: user?.id,
  name: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
  role: user?.role,
  team: user?.team,
  status: user?.status,
  email: user?.email,
});

const buildCamoContext = (context: any, pathname: string, prompt: string) => {
  const clients = context?.clients || [];
  const users = context?.users || [];
  const services = context?.services || [];
  const retainers = context?.retainers || [];
  const specials = context?.specials || [];
  const deadlines = context?.deadlines || [];
  const deliverables = context?.deliverables || [];
  const transmittals = context?.transmittals || [];
  const meetings = context?.meetings || [];
  const serviceManuals = context?.serviceManuals || [];
  const taskLog = context?.taskLog || [];
  const activityLog = context?.activityLog || [];

  const clientById = new Map(clients.map((client: any) => [String(client.id), client]));
  const serviceById = new Map(services.map((service: any) => [String(service.id), service]));
  const userById = new Map(users.map((user: any) => [String(user.id), user]));
  const retainerById = new Map(retainers.map((retainer: any) => [String(retainer.id), retainer]));

  const compactClient = (client: any) => ({
    id: client.id,
    name: client.name,
    tin: client.tin,
    entityType: client.entityType,
    contactPerson: client.contactPerson,
    email: client.email,
    status: client.status,
    fiscalYearEnd: client.fiscalYearEnd,
  });

  const compactRetainer = (retainer: any) => {
    const client = clientById.get(String(retainer.clientId)) as any;
    return {
      id: retainer.id,
      clientId: retainer.clientId,
      clientName: client?.name,
      serviceType: retainer.serviceType,
      serviceName: retainer.serviceName || (serviceById.get(String(retainer.serviceType)) as any)?.name,
      startDate: retainer.startDate,
      assignedStaff: retainer.assignedStaff,
      status: retainer.engagementStatus,
    };
  };

  const compactSpecial = (special: any) => {
    const client = clientById.get(String(special.clientId)) as any;
    return {
      id: special.id,
      clientId: special.clientId,
      clientName: client?.name,
      projectTitle: special.projectTitle,
      serviceType: special.serviceType,
      serviceName: special.serviceName || (serviceById.get(String(special.serviceType)) as any)?.name,
      assignedStaff: special.assignedStaff,
      startDate: special.startDate,
      endDate: special.endDate,
      status: special.status,
      description: special.description,
    };
  };

  const compactDeadline = (deadline: any) => {
    const retainer = retainerById.get(String(deadline.retainerID)) as any;
    const client = retainer ? clientById.get(String(retainer.clientId)) as any : null;
    return {
      deadlineID: deadline.deadlineID,
      retainerID: deadline.retainerID,
      clientName: client?.name,
      serviceName: (serviceById.get(String(deadline.serviceID)) as any)?.name || deadline.serviceID,
      taxID: deadline.taxID,
      dueDate: deadline.dueDate,
    };
  };

  const compactTransmittal = (transmittal: any) => ({
    transmittalID: transmittal.transmittalID,
    clientName: (clientById.get(String(transmittal.clientID)) as any)?.name,
    preparedBy: (userById.get(String(transmittal.userID)) as any) ? compactUser(userById.get(String(transmittal.userID))) : transmittal.userID,
    items: transmittal.items,
    date: transmittal.date,
    receiverName: transmittal.receiverName,
    hasReceipt: Boolean(transmittal.receiptUrl),
  });

  const compactMeeting = (meeting: any) => ({
    meetingID: meeting.meetingID,
    date: meeting.date,
    subject: meeting.subject,
    users: String(meeting.userIDs || '')
      .split(',')
      .map(id => compactUser(userById.get(String(id).trim())))
      .filter(user => user.name || user.id),
    hasMinutes: Boolean(meeting.momUrl),
  });

  const wantsDetails = shouldIncludeDetailedMpcaContext(prompt);
  const matchingClients = wantsDetails ? clients.filter((client: any) => includesPromptTerm(client, prompt)).slice(0, 20).map(compactClient) : [];
  const matchingRetainers = wantsDetails ? retainers.filter((retainer: any) => includesPromptTerm(compactRetainer(retainer), prompt)).slice(0, 20).map(compactRetainer) : [];
  const matchingSpecials = wantsDetails ? specials.filter((special: any) => includesPromptTerm(compactSpecial(special), prompt)).slice(0, 20).map(compactSpecial) : [];

  const baseContext: any = {
    generatedAt: new Date().toISOString(),
    currentPath: pathname,
    currentUser: compactUser(context?.user),
    instructions: [
      'This is a lightweight snapshot of the currently loaded MPCA Hub data.',
      'Use detailed records only when they are included in this payload.',
      'If the requested record is not present in this snapshot, say that it is not available in the current loaded context.',
      'Do not invent client records, statuses, deadlines, staff assignments, or filing details.',
      'Credentials and passwords are intentionally excluded.'
    ],
    counts: {
      clients: clients.length,
      activeClients: clients.filter((client: any) => normalizeText(client.status) === 'active').length,
      users: users.length,
      retainers: retainers.length,
      specials: specials.length,
      deadlines: deadlines.length,
      deliverables: deliverables.length,
      transmittals: transmittals.length,
      meetings: meetings.length,
      serviceManuals: serviceManuals.length,
    },
    availableModules: [
      'Dashboard',
      'Clients',
      'Engagements: Retainers and Special Projects',
      'Operations: Transmittals and Meetings',
      "Gov't Hub: SEC and BIR",
      'Library',
      'Reports',
      'Settings'
    ],
    contextMode: wantsDetails ? 'targeted-mpca-records' : 'lightweight-app-awareness',
  };

  if (!wantsDetails) {
    return baseContext;
  }

  return {
    ...baseContext,
    users: users.map(compactUser).slice(0, MAX_CONTEXT_ITEMS),
    services: services.slice(0, MAX_CONTEXT_ITEMS),
    taxCompliances: (context?.taxCompliances || []).slice(0, 30),
    govtContributions: (context?.govtContributions || []).slice(0, 30),
    serviceSubItems: (context?.serviceSubItems || []).slice(0, 30),
    clients: matchingClients.length > 0 ? matchingClients : clients.slice(0, 25).map(compactClient),
    activeRetainers: (matchingRetainers.length > 0
      ? matchingRetainers
      : retainers
        .filter((retainer: any) => normalizeText(retainer.engagementStatus || retainer.status).includes('active'))
        .slice(0, 25)
        .map(compactRetainer)),
    activeSpecials: (matchingSpecials.length > 0
      ? matchingSpecials
      : specials
        .filter((special: any) => !['completed', 'closed', 'cancelled'].includes(normalizeText(special.status)))
        .slice(0, 25)
        .map(compactSpecial)),
    deadlines: deadlines.slice(0, 40).map(compactDeadline),
    deliverables: deliverables.slice(0, 30),
    recentTransmittals: transmittals.slice(-50).reverse().map(compactTransmittal),
    recentMeetings: meetings.slice(-50).reverse().map(compactMeeting),
    taskLog: taskLog.slice(0, 40),
    recentActivityLog: activityLog.slice(-40).reverse(),
    relevantMatches: {
      clients: matchingClients,
      retainers: matchingRetainers,
      specials: matchingSpecials,
    },
    truncated: {
      maxItemsPerSection: MAX_CONTEXT_ITEMS,
      note: 'Large sections are truncated. relevantMatches contains records that matched the latest user prompt.',
    },
  };
};

const renderInlineMarkdown = (text: string, keyPrefix = 'inline') => {
  const nodes: React.ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+?\*\*|\*[^*\n]+?\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));

    const token = match[0];
    if (token.startsWith('`')) {
      nodes.push(
        <code key={`${keyPrefix}-${match.index}-code`} className="break-words rounded-md bg-neutral-light px-1.5 py-0.5 text-[12px] font-bold text-primary dark:bg-gray-900">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('**')) {
      nodes.push(
        <strong key={`${keyPrefix}-${match.index}-bold`} className="font-black text-neutral-dark dark:text-white">
          {renderInlineMarkdown(token.slice(2, -2), `${keyPrefix}-${match.index}-bold-inner`)}
        </strong>
      );
    } else if (token.startsWith('*')) {
      nodes.push(
        <em key={`${keyPrefix}-${match.index}-italic`} className="italic text-neutral-dark/90 dark:text-gray-100">
          {renderInlineMarkdown(token.slice(1, -1), `${keyPrefix}-${match.index}-italic-inner`)}
        </em>
      );
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
};

const renderCamoMarkdown = (content: string) => {
  const lines = String(content || '').split('\n');
  const blocks: React.ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push(
        <div
          key={`heading-${index}`}
          className={`${level <= 2 ? 'text-[15px]' : 'text-[13px]'} mt-2 mb-1 break-words font-black leading-snug text-neutral-dark dark:text-white`}
        >
          {renderInlineMarkdown(headingMatch[2], `heading-${index}`)}
        </div>
      );
      index += 1;
      continue;
    }

    if (line.trim().startsWith('```')) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(
        <pre key={`code-${index}`} className="my-2 max-w-full overflow-x-auto rounded-xl bg-gray-950 p-3 text-[12px] leading-relaxed text-gray-100">
          <code className="whitespace-pre-wrap break-words">{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    const listMatch = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      const items: string[] = [];
      const ordered = /^\s*\d+\.\s+/.test(line);
      while (index < lines.length) {
        const current = lines[index];
        const currentMatch = current.match(/^\s*(?:[-*•]|\d+\.)\s+(.+)$/);
        if (!currentMatch || /^\s*\d+\.\s+/.test(current) !== ordered) break;
        items.push(currentMatch[1]);
        index += 1;
      }

      const ListTag = ordered ? 'ol' : 'ul';
      blocks.push(
        <ListTag key={`list-${index}`} className={`my-2 max-w-full space-y-1 pl-5 ${ordered ? 'list-decimal' : 'list-disc'}`}>
          {items.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`} className="break-words pl-1">
              {renderInlineMarkdown(item, `list-${index}-${itemIndex}`)}
            </li>
          ))}
        </ListTag>
      );
      continue;
    }

    const paragraphLines = [line.trim()];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].trim().startsWith('```') &&
      !lines[index].match(/^(#{1,4})\s+/) &&
      !lines[index].match(/^\s*(?:[-*•]|\d+\.)\s+/)
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }

    blocks.push(
      <p key={`paragraph-${index}`} className="my-1.5 break-words">
        {renderInlineMarkdown(paragraphLines.join(' '), `paragraph-${index}`)}
      </p>
    );
  }

  return blocks;
};

const CamoChat: React.FC = () => {
  const context = useContext(AppContext);
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [officeChatOpen, setOfficeChatOpen] = useState(false);
  const [isHoveringLauncher, setIsHoveringLauncher] = useState(false);
  const [isWiggling, setIsWiggling] = useState(false);
  const [showPeek, setShowPeek] = useState(false);
  const [peekMessage, setPeekMessage] = useState(getRandomCamoPeek);
  const [peekCount, setPeekCount] = useState(getCamoPeekCount);
  const [draft, setDraft] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [messages, setMessages] = useState<CamoMessage[]>([
    { id: 'intro', role: 'assistant', content: CAMO_INTRO }
  ]);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const resizeDraftInput = useCallback((element = inputRef.current) => {
    if (!element) return;
    element.style.height = 'auto';
    const maxHeight = 116;
    element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`;
    element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    const handleOfficeChatToggle = (event: Event) => {
      const isOfficeOpen = Boolean((event as CustomEvent<{ open?: boolean }>).detail?.open);
      setOfficeChatOpen(isOfficeOpen);
      if (isOfficeOpen) setIsOpen(false);
    };

    window.addEventListener('mpca-office-chat-toggle', handleOfficeChatToggle);
    return () => window.removeEventListener('mpca-office-chat-toggle', handleOfficeChatToggle);
  }, []);

  useEffect(() => {
    if (isOpen || officeChatOpen) return;

    const interval = window.setInterval(() => {
      if (isHoveringLauncher) return;
      setIsWiggling(true);
      window.setTimeout(() => setIsWiggling(false), 1200);
    }, 26000);

    return () => window.clearInterval(interval);
  }, [isHoveringLauncher, isOpen, officeChatOpen]);

  useEffect(() => {
    if (isOpen || officeChatOpen || isHoveringLauncher || peekCount >= CAMO_PEEK_DELAYS.length) return;

    const showTimer = window.setTimeout(() => {
      setPeekMessage(getRandomCamoPeek());
      setShowPeek(true);
      const nextCount = peekCount + 1;
      setPeekCount(nextCount);
      setCamoPeekCount(nextCount);
    }, CAMO_PEEK_DELAYS[peekCount]);

    return () => window.clearTimeout(showTimer);
  }, [isHoveringLauncher, isOpen, officeChatOpen, peekCount]);

  useEffect(() => {
    if (!showPeek) return;

    const hideTimer = window.setTimeout(() => setShowPeek(false), CAMO_PEEK_VISIBLE_MS);
    return () => window.clearTimeout(hideTimer);
  }, [showPeek]);

  const openCamo = () => {
    setShowPeek(false);
    setIsWiggling(false);
    setIsOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 120);
  };

  const sendMessage = async (content = draft) => {
    const trimmed = content.trim();
    if (!trimmed || isThinking) return;

    setDraft('');
    window.setTimeout(() => resizeDraftInput(), 0);
    const nextMessages: CamoMessage[] = [...messages, { id: createId(), role: 'user', content: trimmed }];
    setMessages(nextMessages);
    setIsThinking(true);

    try {
      const mpcaContext = buildCamoContext(context, location.pathname, trimmed);
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.debug('[Camo] MPCA context mode/bytes:', mpcaContext.contextMode, JSON.stringify(mpcaContext).length);
      }
      const data = await sendCamoMessage(
        nextMessages.map(({ role, content }) => ({ role, content })),
        mpcaContext
      );
      setMessages(previous => [
        ...previous,
        {
          id: createId(),
          role: 'assistant',
          content: data.reply
        }
      ]);
    } catch (error: any) {
      setMessages(previous => [
        ...previous,
        {
          id: createId(),
          role: 'assistant',
          content: error.message || "I couldn't reach Camo's AI service right now. Please check the API key and server logs."
        }
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <>
      {isOpen && (
        <div className="fixed bottom-5 right-5 z-[12000] flex h-[540px] max-h-[calc(100vh-3rem)] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[1.5rem] border border-neutral-medium bg-white shadow-2xl animate-in fade-in zoom-in-95 slide-in-from-bottom-3 duration-300 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between gap-3 border-b border-neutral-medium/60 px-5 py-4 dark:border-gray-700/60">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center">
                <img src="/camo.png" alt="Camo" className="h-full w-full object-contain drop-shadow-sm" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-neutral-dark dark:text-white">Camo</p>
                <p className="text-[10px] font-bold text-secondary dark:text-gray-400">MPCA AI Assistant</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-full p-1.5 text-secondary transition-colors hover:bg-neutral-light hover:text-neutral-dark dark:hover:bg-gray-700 dark:hover:text-white"
              aria-label="Close Camo"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-neutral-light/30 p-4 custom-scrollbar dark:bg-gray-900/40">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`min-w-0 max-w-[82%] overflow-hidden rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                    message.role === 'user'
                      ? 'break-words bg-primary text-white'
                      : 'break-words border border-neutral-medium/70 bg-white text-neutral-dark dark:border-gray-700 dark:bg-gray-800 dark:text-white'
                  }`}
                >
                  {message.role === 'assistant' ? renderCamoMarkdown(message.content) : message.content}
                </div>
              </div>
            ))}

            {isThinking && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl border border-neutral-medium/70 bg-white px-4 py-3 text-sm font-bold text-secondary shadow-sm dark:border-gray-700 dark:bg-gray-800">
                  <Loader2 size={15} className="animate-spin text-primary" />
                  Camo is thinking...
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-neutral-medium/60 bg-white p-4 dark:border-gray-700/60 dark:bg-gray-800">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                sendMessage();
              }}
              className="flex items-end gap-2"
            >
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  resizeDraftInput(event.target);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Ask Camo anything..."
                rows={1}
                className="min-h-[44px] max-h-[116px] min-w-0 flex-1 resize-none rounded-[22px] border border-neutral-medium bg-white px-4 py-[12px] text-xs font-semibold leading-[18px] outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-900 dark:text-white [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-secondary/50 [&::-webkit-scrollbar-track]:bg-transparent"
              />
              <button
                type="submit"
                disabled={!draft.trim() || isThinking}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/20 transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Send message"
              >
                {isThinking ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </form>
          </div>
        </div>
      )}

      {!isOpen && !officeChatOpen && (
        <div className="fixed bottom-5 right-5 z-[12000]">
          {showPeek && !isHoveringLauncher && (
            <div className="absolute bottom-16 right-2 mb-2 whitespace-nowrap rounded-2xl border border-neutral-medium bg-white px-3.5 py-2 text-sm font-bold text-neutral-dark shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white">
              <p>{peekMessage}</p>
            </div>
          )}
          <button
            type="button"
            onClick={openCamo}
            onMouseEnter={() => {
              setIsHoveringLauncher(true);
              setIsWiggling(false);
              setShowPeek(false);
            }}
            onMouseLeave={() => setIsHoveringLauncher(false)}
            className={`group relative flex h-16 w-16 items-center justify-center rounded-full bg-transparent p-0 transition-transform duration-200 hover:-translate-y-0.5 hover:rotate-[-4deg] hover:scale-110 ${
              isWiggling ? 'animate-[camo-wiggle_1.1s_ease-in-out]' : ''
            }`}
            aria-label="Open Camo"
          >
            <span className="pointer-events-none absolute bottom-full right-0 mb-2 whitespace-nowrap rounded-lg bg-neutral-dark px-2.5 py-1.5 text-[11px] font-bold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:bg-white dark:text-neutral-dark">
              Ask Camo
            </span>
            <img src="/camo.png" alt="" className="h-full w-full object-contain drop-shadow-xl" />
          </button>
          <style>{`
            @keyframes camo-wiggle {
              0%, 100% { transform: rotate(0deg) scale(1); }
              18% { transform: rotate(-5deg) scale(1.04); }
              36% { transform: rotate(5deg) scale(1.04); }
              54% { transform: rotate(-3deg) scale(1.02); }
              72% { transform: rotate(3deg) scale(1.02); }
            }
          `}</style>
        </div>
      )}
    </>
  );
};

export default CamoChat;
