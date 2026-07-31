import React, { useContext, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AppContext } from '../App';
import { searchSecCompany, verifyBirLoa, verifyBirTin } from '../services/googleSheetsService';
import {
    AlertCircle,
    Building2,
    ChevronRight,
    FileText,
    HelpCircle,
    Loader2,
    Search
} from 'lucide-react';

type SecSearchMode = 'registration' | 'name';

type SecCompany = {
    Company_Name?: string;
    PSIC_Code?: string;
    sec_no?: string;
    ADDRESS?: string;
};

type SecDocument = {
    id?: number;
    code?: string;
    status__name?: string;
    page_count?: number;
    submission_date?: string;
    submission_type?: string | null;
    period_covered?: string | null;
    doc_id?: string;
    category?: string;
};

type SecResult = {
    ok?: boolean;
    company?: SecCompany | null;
    companies?: SecCompany[];
    documents?: SecDocument[];
};

type BirResult = {
    ok?: boolean;
    agency?: string;
    source?: string;
    query?: Record<string, any>;
    result?: any;
};

type TinForm = {
    tin: string;
    firstName: string;
    middleName: string;
    lastName: string;
    gender: string;
    birthdate: string;
};

type LoaForm = {
    tin: string;
    registeredName: string;
    auditCase: string;
};

type BirService = 'tin' | 'loa';

const ITEMS_PER_PAGE = 10;

const birServices: Array<{ key: BirService; label: string }> = [
    { key: 'tin', label: 'TIN Search' },
    { key: 'loa', label: 'LOA Verifier' }
];

const documentTypeOrder: Record<string, number> = {
    AOI: 0,
    GIS: 1,
    AFS: 2
};

const categoryOrder: Record<string, number> = {
    Registration: 0,
    Report: 1
};

const formatDate = (value?: string | null) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });
};

const getDateValue = (value?: string | null) => {
    if (!value) return 0;
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
};

const getStatusClass = (status?: string) => {
    const normalized = String(status || '').toLowerCase();
    if (normalized.includes('accepted')) return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800';
    if (normalized.includes('migrated')) return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800';
    return 'bg-neutral-light text-secondary border-neutral-medium dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700';
};

const sortDocuments = (documents: SecDocument[]) => [...documents].sort((a, b) => {
    const aCategory = categoryOrder[String(a.category || '')] ?? 99;
    const bCategory = categoryOrder[String(b.category || '')] ?? 99;
    if (aCategory !== bCategory) return aCategory - bCategory;

    const aCode = documentTypeOrder[String(a.code || '').toUpperCase()] ?? 99;
    const bCode = documentTypeOrder[String(b.code || '').toUpperCase()] ?? 99;
    if (aCode !== bCode) return aCode - bCode;

    return getDateValue(b.submission_date) - getDateValue(a.submission_date);
});

const getDocumentGroup = (document: SecDocument) => {
    const category = String(document.category || '').trim();
    if (category === 'Report') {
        const code = String(document.code || 'Other').trim() || 'Other';
        return `Report:${code.toUpperCase()}`;
    }
    return category || 'Other Documents';
};

const getDocumentGroupLabel = (group: string) => {
    if (group.startsWith('Report:')) return group.replace('Report:', '');
    return group || 'Other Documents';
};

const getDocumentGroupOrder = (group: string) => {
    if (group === 'Registration') return 0;
    if (group.startsWith('Report:')) {
        const code = group.replace('Report:', '');
        return 10 + (documentTypeOrder[code] ?? 99);
    }
    return 999;
};

const getDocumentStats = (documents: SecDocument[]) => documents.reduce((acc, document) => {
    const status = String(document.status__name || '').toLowerCase();
    if (status.includes('accepted')) acc.accepted += 1;
    else if (status.includes('migrated')) acc.migrated += 1;
    else acc.other += 1;
    return acc;
}, { accepted: 0, migrated: 0, other: 0 });

const formatTinForDisplay = (value: string, maxDigits = 9) => {
    const digits = String(value || '').replace(/\D/g, '').slice(0, maxDigits);
    return digits.replace(/(\d{3})(?=\d)/g, '$1-');
};

const getTinDigits = (value: string, maxDigits = 9) => String(value || '').replace(/\D/g, '').slice(0, maxDigits);

const formatResultLabel = (key: string) => key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, char => char.toUpperCase());

const formatResultValue = (value: any) => {
    if (value === null || value === undefined || value === '') return 'N/A';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
};

const getTinDisplayResult = (result: Record<string, any>) => {
    if (result?.status === 'RECORD_NOT_MATCHED') {
        const { msg, ...withoutMessage } = result;
        return withoutMessage;
    }

    const { msg, ...withoutMessage } = result || {};
    return {
        ...withoutMessage,
        status: 'SUCCESS',
    };
};

const ResultGrid: React.FC<{ result: Record<string, any> }> = ({ result }) => (
    <div className="overflow-x-auto">
        <table className="w-full text-left table-fixed">
            <thead className="bg-neutral-light/60 dark:bg-gray-900/70">
                <tr>
                    <th className="w-[28%] px-4 py-2 text-[9px] font-black uppercase tracking-[0.16em] text-secondary dark:text-gray-400">Field</th>
                    <th className="px-4 py-2 text-[9px] font-black uppercase tracking-[0.16em] text-secondary dark:text-gray-400">Value</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-neutral-medium/40 dark:divide-gray-700">
                {Object.entries(result || {}).map(([key, value]) => (
                    <tr key={key} className="hover:bg-neutral-light/60 dark:hover:bg-gray-900/40">
                        <td className="px-4 py-2.5 text-[11px] font-black uppercase tracking-wider text-secondary dark:text-gray-400">
                            {formatResultLabel(key)}
                        </td>
                        <td className="px-4 py-2.5 text-[12px] font-bold text-neutral-dark dark:text-white break-words">
                            {formatResultValue(value)}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const LoaDataTable: React.FC<{ rows: any[] }> = ({ rows }) => (
    <div className="overflow-x-auto border-t border-neutral-medium/50 dark:border-gray-700">
        <table className="w-full text-left table-fixed">
            <thead className="bg-neutral-light/60 dark:bg-gray-900/70">
                <tr>
                    {['TIN', 'Registered Name', 'LOA Number'].map(header => (
                        <th key={header} className="px-4 py-2 text-[9px] font-black uppercase tracking-[0.16em] text-secondary dark:text-gray-400">
                            {header}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody className="divide-y divide-neutral-medium/40 dark:divide-gray-700">
                {rows.map((row, index) => (
                    <tr key={`${row?.loanumber || index}`} className="hover:bg-neutral-light/60 dark:hover:bg-gray-900/40">
                        <td className="px-4 py-2.5 text-[12px] font-bold text-primary break-words">{row?.tin || 'N/A'}</td>
                        <td className="px-4 py-2.5 text-[12px] font-black text-neutral-dark dark:text-white break-words">{row?.registeredName || 'N/A'}</td>
                        <td className="px-4 py-2.5 text-[12px] font-bold text-neutral-dark dark:text-white break-words">{row?.loanumber || 'N/A'}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const GovtHub: React.FC = () => {
    const context = useContext(AppContext);
    const location = useLocation();
    const activeAgency: 'sec' | 'bir' = location.pathname === '/govt-hub/bir' ? 'bir' : 'sec';
    const [mode, setMode] = useState<SecSearchMode>('registration');
    const [query, setQuery] = useState('');
    const [result, setResult] = useState<SecResult | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState('');
    const [documentSearch, setDocumentSearch] = useState('');
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
    const [categoryPages, setCategoryPages] = useState<Record<string, number>>({});
    const [activeBirService, setActiveBirService] = useState<BirService>('tin');
    const [tinForm, setTinForm] = useState<TinForm>({
        tin: '',
        firstName: '',
        middleName: '',
        lastName: '',
        gender: '',
        birthdate: ''
    });
    const [loaForm, setLoaForm] = useState<LoaForm>({
        tin: '',
        registeredName: '',
        auditCase: ''
    });
    const [tinResult, setTinResult] = useState<BirResult | null>(null);
    const [loaResult, setLoaResult] = useState<BirResult | null>(null);
    const [isTinVerifying, setIsTinVerifying] = useState(false);
    const [isLoaVerifying, setIsLoaVerifying] = useState(false);

    const companies = useMemo(() => {
        if (!result) return [];
        if (Array.isArray(result.companies) && result.companies.length > 0) return result.companies;
        return result.company ? [result.company] : [];
    }, [result]);

    const sortedDocuments = useMemo(() => sortDocuments(result?.documents || []), [result]);

    const filteredDocuments = useMemo(() => {
        const term = documentSearch.trim().toLowerCase();
        if (!term) return sortedDocuments;

        return sortedDocuments.filter((document) => [
            document.code,
            document.status__name,
            document.page_count,
            document.submission_date,
            document.submission_type,
            document.period_covered,
            document.doc_id
        ].some((value) => String(value ?? '').toLowerCase().includes(term)));
    }, [documentSearch, sortedDocuments]);

    const groupedDocuments = useMemo(() => {
        const groups = filteredDocuments.reduce((acc, document) => {
            const group = getDocumentGroup(document);
            if (!acc.has(group)) acc.set(group, []);
            acc.get(group)!.push(document);
            return acc;
        }, new Map<string, SecDocument[]>());

        return Array.from(groups.entries()).sort(([a], [b]) => {
            const aOrder = getDocumentGroupOrder(a);
            const bOrder = getDocumentGroupOrder(b);
            if (aOrder !== bOrder) return aOrder - bOrder;
            return a.localeCompare(b);
        });
    }, [filteredDocuments]);

    const toggleCategory = (category: string) => {
        setExpandedCategories((previous) => {
            const next = new Set(previous);
            if (next.has(category)) next.delete(category);
            else next.add(category);
            return next;
        });
    };

    const setCategoryPage = (category: string, page: number) => {
        setCategoryPages((previous) => ({ ...previous, [category]: page }));
    };

    const handleSearch = async (event?: React.FormEvent) => {
        event?.preventDefault();
        const trimmedQuery = query.trim();
        if (!trimmedQuery) {
            context?.showToast('Enter a registration number or company name.', 'error');
            return;
        }

        setIsSearching(true);
        setError('');
        setResult(null);
        setDocumentSearch('');
        setExpandedCategories(new Set());
        setCategoryPages({});

        try {
            const data = await searchSecCompany(mode, trimmedQuery);
            setResult(data);
            context?.showToast('SEC eSearch lookup completed.', 'success');
        } catch (err: any) {
            const message = err.message || 'Unable to search SEC eSearch.';
            setError(message);
            context?.showToast(message, 'error');
        } finally {
            setIsSearching(false);
        }
    };

    const handleTinVerify = async (event?: React.FormEvent) => {
        event?.preventDefault();
        if (!tinForm.firstName.trim() || !tinForm.lastName.trim() || !tinForm.gender.trim() || !tinForm.birthdate) {
            context?.showToast('First name, last name, gender, and birthdate are required.', 'error');
            return;
        }

        setIsTinVerifying(true);
        setTinResult(null);

        try {
            const data = await verifyBirTin({
                tin: '',
                firstName: tinForm.firstName.trim(),
                middleName: '',
                lastName: tinForm.lastName.trim(),
                gender: tinForm.gender.trim(),
                birthdate: tinForm.birthdate
            });
            setTinResult(data);
            context?.showToast('TIN search completed successfully.', 'success');
        } catch (err: any) {
            context?.showToast(err.message || 'Unable to search TIN record.', 'error');
        } finally {
            setIsTinVerifying(false);
        }
    };

    const handleLoaVerify = async (event?: React.FormEvent) => {
        event?.preventDefault();
        if (!loaForm.tin || !loaForm.auditCase.trim()) {
            context?.showToast('TIN and audit case are required.', 'error');
            return;
        }

        setIsLoaVerifying(true);
        setLoaResult(null);

        try {
            const data = await verifyBirLoa({
                tin: getTinDigits(loaForm.tin, 12),
                registeredName: loaForm.registeredName.trim(),
                auditCase: loaForm.auditCase.trim()
            });
            setLoaResult(data);
            context?.showToast('LOA record found successfully.', 'success');
        } catch (err: any) {
            context?.showToast(err.message || 'Unable to verify LOA record.', 'error');
        } finally {
            setIsLoaVerifying(false);
        }
    };

    return (
        <div className="w-full mx-auto p-2 space-y-2 animate-in fade-in duration-700">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 px-1">
                <div className="space-y-0.5">
                    <div className="flex items-center gap-2.5">
                        <div className="w-1.5 h-7 bg-primary rounded-full" />
                        <h1 className="text-3xl font-black text-neutral-dark dark:text-white tracking-tight">
                            {activeAgency === 'bir' ? 'BIR Services' : 'eSearch Services'}
                        </h1>
                    </div>
                    <p className="text-sm text-secondary dark:text-gray-300 font-medium pl-4 opacity-70 dark:opacity-100">
                        {activeAgency === 'bir'
                            ? 'Search TIN records and verify Letter of Authority details.'
                            : 'Search SEC company records by registration number or company name.'}
                    </p>
                </div>
            </div>

            {activeAgency === 'sec' && (
                <>
            <section className="rounded-2xl border border-neutral-medium bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
                <form onSubmit={handleSearch} className="p-4 space-y-3">
                    <div className="inline-flex rounded-xl border border-neutral-medium bg-neutral-light p-1 dark:border-gray-700 dark:bg-gray-900">
                        {[
                            { key: 'registration', label: 'Registration No.' },
                            { key: 'name', label: 'Company Name' }
                        ].map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                onClick={() => {
                                    setMode(item.key as SecSearchMode);
                                    setQuery('');
                                }}
                                className={`px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest transition-colors ${
                                    mode === item.key
                                        ? 'bg-primary text-white shadow-sm'
                                        : 'text-secondary hover:text-primary dark:text-gray-400'
                                }`}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-col md:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary dark:text-gray-500" size={18} />
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder={mode === 'registration' ? 'Enter SEC Registration No. e.g. A199611022' : 'Enter Company Name'}
                                className="w-full h-11 pl-11 pr-4 rounded-xl border border-neutral-medium bg-neutral-light/50 text-sm font-semibold outline-none transition-all focus:border-primary/40 focus:ring-4 focus:ring-primary/5 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={isSearching}
                            className="h-11 px-6 rounded-xl bg-primary text-white text-[11px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 transition-colors hover:bg-primary-dark disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isSearching ? <Loader2 size={17} className="animate-spin" /> : <Search size={17} />}
                            Search
                        </button>
                    </div>
                </form>
            </section>

            {error && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300 flex gap-3">
                    <AlertCircle size={20} className="shrink-0" />
                    <p className="text-sm font-bold">{error}</p>
                </div>
            )}

            {result && (
                <>
                    <section className="rounded-2xl border border-neutral-medium bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
                        <div className="border-b border-neutral-medium/70 px-4 py-3 dark:border-gray-700 flex items-center justify-between gap-3">
                            <div>
                                <h2 className="text-sm font-black text-neutral-dark dark:text-white">Company Result</h2>
                                <p className="text-[11px] font-semibold text-secondary dark:text-gray-400">{companies.length} matching record{companies.length === 1 ? '' : 's'}</p>
                            </div>
                            <Building2 size={18} className="text-primary" />
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left table-fixed">
                                <thead className="bg-neutral-light/60 dark:bg-gray-900/70">
                                    <tr>
                                        {['Company Name', 'SEC Registration No.', 'PSIC Code', 'Address'].map((header) => (
                                            <th key={header} className="px-4 py-2 text-[9px] font-black uppercase tracking-[0.16em] text-secondary dark:text-gray-400">
                                                {header}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-medium/40 dark:divide-gray-700">
                                    {companies.map((company, index) => (
                                        <tr key={`${company.sec_no || company.Company_Name || index}`} className="hover:bg-neutral-light/60 dark:hover:bg-gray-900/40">
                                            <td className="px-4 py-2.5 text-[12px] font-black text-neutral-dark dark:text-white leading-snug">{company.Company_Name || 'N/A'}</td>
                                            <td className="px-4 py-2.5 text-[12px] font-bold text-primary leading-snug">{company.sec_no || 'N/A'}</td>
                                            <td className="px-4 py-2.5 text-[12px] font-semibold text-neutral-dark dark:text-gray-200 leading-snug">{company.PSIC_Code || 'N/A'}</td>
                                            <td className="px-4 py-2.5 text-[12px] font-semibold text-secondary dark:text-gray-400 leading-snug">{company.ADDRESS || 'N/A'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="rounded-2xl border border-neutral-medium bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
                        <div className="border-b border-neutral-medium/70 px-5 py-4 dark:border-gray-700 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                            <div>
                                <h2 className="text-base font-black text-neutral-dark dark:text-white">Documents</h2>
                                <p className="text-xs font-semibold text-secondary dark:text-gray-400">
                                    Sorted by registration documents first, then AOI/GIS/AFS, newest submission date first.
                                </p>
                            </div>
                            <div className="relative w-full lg:w-80">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary dark:text-gray-500" size={16} />
                                <input
                                    value={documentSearch}
                                    onChange={(event) => {
                                        setDocumentSearch(event.target.value);
                                        setCategoryPages({});
                                    }}
                                    placeholder="Search documents..."
                                    className="w-full h-10 pl-10 pr-3 rounded-xl border border-neutral-medium bg-neutral-light/50 text-sm font-semibold outline-none transition-all focus:border-primary/40 focus:ring-4 focus:ring-primary/5 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                                />
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse table-fixed">
                                <thead>
                                    <tr className="bg-neutral-light/50 dark:bg-gray-900/50 border-b border-neutral-medium dark:border-gray-700">
                                        <th className="w-[8%] px-4 py-2.5 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.18em]">Code</th>
                                        <th className="w-[20%] px-4 py-2.5 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.18em]">Doc ID</th>
                                        <th className="w-[15%] px-4 py-2.5 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.18em]">Period Covered</th>
                                        <th className="w-[16%] px-4 py-2.5 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.18em]">Submission Date</th>
                                        <th className="w-[19%] px-4 py-2.5 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.18em]">Submission Type</th>
                                        <th className="w-[8%] px-4 py-2.5 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.18em]">Pages</th>
                                        <th className="w-[14%] px-4 py-2.5 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.18em]">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-medium/30 dark:divide-gray-800">
                                    {groupedDocuments.map(([group, documents]) => {
                                        const isExpanded = expandedCategories.has(group);
                                        const totalPages = Math.max(1, Math.ceil(documents.length / ITEMS_PER_PAGE));
                                        const page = Math.min(categoryPages[group] || 1, totalPages);
                                        const startIndex = (page - 1) * ITEMS_PER_PAGE;
                                        const paginatedDocuments = documents.slice(startIndex, startIndex + ITEMS_PER_PAGE);
                                        const stats = getDocumentStats(documents);

                                        return (
                                            <React.Fragment key={group}>
                                                <tr
                                                    onClick={() => toggleCategory(group)}
                                                    className="bg-neutral-light/40 dark:bg-gray-900/50 cursor-pointer hover:bg-primary/[0.04] dark:hover:bg-primary/[0.08] transition-colors"
                                                >
                                                    <td colSpan={7} className="px-5 py-2.5 border-b border-neutral-medium/50 dark:border-gray-800">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <ChevronRight
                                                                size={14}
                                                                className={`text-secondary/60 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                                            />
                                                            <span className="text-[11px] font-bold text-neutral-dark dark:text-white">
                                                                {getDocumentGroupLabel(group)}
                                                            </span>
                                                            <span className="px-1.5 py-0.5 rounded-md bg-white dark:bg-gray-800 text-[9px] font-black text-primary border border-neutral-medium dark:border-gray-700">
                                                                {documents.length} ITEMS
                                                            </span>
                                                            <div className="flex items-center gap-1 ml-auto">
                                                                {stats.accepted > 0 && (
                                                                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-[9px] font-black text-emerald-600 border border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                                                                        {stats.accepted} ACCEPTED
                                                                    </span>
                                                                )}
                                                                {stats.migrated > 0 && (
                                                                    <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-[9px] font-black text-amber-600 border border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
                                                                        {stats.migrated} MIGRATED
                                                                    </span>
                                                                )}
                                                                {stats.other > 0 && (
                                                                    <span className="px-1.5 py-0.5 rounded-md bg-neutral-light text-[9px] font-black text-secondary border border-neutral-medium dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700">
                                                                        {stats.other} OTHER
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>

                                                {isExpanded && paginatedDocuments.map((document, index) => (
                                                    <tr
                                                        key={`${document.doc_id || document.id || index}`}
                                                        className="group transition-all duration-300 hover:bg-primary/[0.02] dark:hover:bg-primary/[0.05] border-b border-neutral-medium/50 dark:border-gray-800 last:border-0"
                                                    >
                                                        <td className="px-4 py-2">
                                                            <div className="text-[12px] font-black text-primary tracking-tight">{document.code || 'N/A'}</div>
                                                        </td>
                                                        <td className="px-4 py-2">
                                                            <div className="text-[10.5px] font-black text-neutral-dark dark:text-white break-words" title={document.doc_id || ''}>
                                                                {document.doc_id || 'N/A'}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-2">
                                                            <span className="text-[11px] font-bold text-secondary dark:text-gray-400">{formatDate(document.period_covered)}</span>
                                                        </td>
                                                        <td className="px-4 py-2">
                                                            <span className="text-[11px] font-extrabold text-neutral-dark dark:text-white">{formatDate(document.submission_date)}</span>
                                                        </td>
                                                        <td className="px-4 py-2">
                                                            <div className="text-[11.5px] font-bold text-secondary dark:text-gray-400 leading-snug break-words" title={document.submission_type || ''}>
                                                                {document.submission_type || 'N/A'}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-2">
                                                            <span className="text-[11px] font-extrabold text-neutral-dark dark:text-white">{document.page_count ?? 'N/A'}</span>
                                                        </td>
                                                        <td className="px-4 py-2">
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider border shadow-sm whitespace-normal ${getStatusClass(document.status__name)}`}>
                                                                <div className={`w-1 h-1 rounded-full mr-1.5 shrink-0 ${String(document.status__name || '').toLowerCase().includes('accepted') ? 'bg-emerald-500' : String(document.status__name || '').toLowerCase().includes('migrated') ? 'bg-amber-500' : 'bg-neutral-400'}`} />
                                                                {document.status__name || 'N/A'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}

                                                {isExpanded && documents.length > ITEMS_PER_PAGE && (
                                                    <tr className="bg-white dark:bg-gray-800">
                                                        <td colSpan={7} className="px-5 py-3">
                                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                                <p className="text-[10px] font-black uppercase tracking-widest text-secondary dark:text-gray-400">
                                                                    Showing {startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, documents.length)} of {documents.length}
                                                                </p>
                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        onClick={() => setCategoryPage(group, Math.max(1, page - 1))}
                                                                        disabled={page === 1}
                                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-medium text-[10px] font-black uppercase tracking-wider text-neutral-dark transition-colors hover:bg-neutral-light disabled:opacity-40 disabled:cursor-not-allowed dark:border-gray-700 dark:text-white dark:hover:bg-gray-700"
                                                                    >
                                                                        <ChevronRight size={13} className="rotate-180" />
                                                                        Prev
                                                                    </button>
                                                                    <span className="px-3 py-1.5 rounded-lg bg-neutral-light text-[10px] font-black text-primary dark:bg-gray-900">
                                                                        {page} / {totalPages}
                                                                    </span>
                                                                    <button
                                                                        onClick={() => setCategoryPage(group, Math.min(totalPages, page + 1))}
                                                                        disabled={page === totalPages}
                                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-medium text-[10px] font-black uppercase tracking-wider text-neutral-dark transition-colors hover:bg-neutral-light disabled:opacity-40 disabled:cursor-not-allowed dark:border-gray-700 dark:text-white dark:hover:bg-gray-700"
                                                                    >
                                                                        Next
                                                                        <ChevronRight size={13} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {filteredDocuments.length === 0 && (
                            <div className="px-5 py-12 text-center">
                                <FileText size={32} className="mx-auto mb-3 text-secondary/50" />
                                <p className="text-sm font-bold text-secondary dark:text-gray-400">No documents found.</p>
                            </div>
                        )}
                    </section>
                </>
            )}
                </>
            )}

            {activeAgency === 'bir' && (
                <div className="space-y-2">
                    <section className="rounded-2xl border border-neutral-medium bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
                        <div className="p-4">
                            <div className="inline-flex rounded-xl border border-neutral-medium bg-neutral-light p-1 dark:border-gray-700 dark:bg-gray-900">
                                {birServices.map((service) => {
                                    const isActive = activeBirService === service.key;
                                    return (
                                        <button
                                            key={service.key}
                                            type="button"
                                            onClick={() => setActiveBirService(service.key)}
                                            className={`px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest transition-colors ${
                                                isActive
                                                    ? 'bg-primary text-white shadow-sm'
                                                    : 'text-secondary hover:text-primary dark:text-gray-400'
                                            }`}
                                        >
                                            {service.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </section>

                    {activeBirService === 'tin' && (
                        <section className="rounded-2xl border border-neutral-medium bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
                            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]">
                                <form onSubmit={handleTinVerify} className="p-3 space-y-2 border-b xl:border-b-0 xl:border-r border-neutral-medium/70 dark:border-gray-700">
                                    <div>
                                        <h2 className="text-xs font-black text-neutral-dark dark:text-white uppercase tracking-widest">TIN Search</h2>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        <label className="space-y-0.5">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-secondary dark:text-gray-400">First Name <span className="text-primary">*</span></span>
                                            <input
                                                value={tinForm.firstName}
                                                onChange={(event) => setTinForm(prev => ({ ...prev, firstName: event.target.value }))}
                                                required
                                                className="w-full h-9 px-3 rounded-lg border border-neutral-medium bg-neutral-light/50 text-sm font-semibold outline-none transition-all focus:border-primary/40 focus:ring-4 focus:ring-primary/5 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                                            />
                                        </label>
                                        <label className="space-y-0.5">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-secondary dark:text-gray-400">Last Name <span className="text-primary">*</span></span>
                                            <input
                                                value={tinForm.lastName}
                                                onChange={(event) => setTinForm(prev => ({ ...prev, lastName: event.target.value }))}
                                                required
                                                className="w-full h-9 px-3 rounded-lg border border-neutral-medium bg-neutral-light/50 text-sm font-semibold outline-none transition-all focus:border-primary/40 focus:ring-4 focus:ring-primary/5 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                                            />
                                        </label>
                                        <label className="space-y-0.5">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-secondary dark:text-gray-400">Birthdate <span className="text-primary">*</span></span>
                                            <input
                                                value={tinForm.birthdate}
                                                onChange={(event) => setTinForm(prev => ({ ...prev, birthdate: event.target.value }))}
                                                type="date"
                                                required
                                                className="w-full h-9 px-3 rounded-lg border border-neutral-medium bg-neutral-light/50 text-sm font-semibold outline-none transition-all focus:border-primary/40 focus:ring-4 focus:ring-primary/5 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                                            />
                                        </label>
                                        <label className="space-y-0.5">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-secondary dark:text-gray-400">Gender <span className="text-primary">*</span></span>
                                            <select
                                                value={tinForm.gender}
                                                onChange={(event) => setTinForm(prev => ({ ...prev, gender: event.target.value }))}
                                                required
                                                className="w-full h-9 px-3 rounded-lg border border-neutral-medium bg-neutral-light/50 text-sm font-semibold outline-none transition-all focus:border-primary/40 focus:ring-4 focus:ring-primary/5 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                                            >
                                                <option value="">Select Gender</option>
                                                <option value="MALE">Male</option>
                                                <option value="FEMALE">Female</option>
                                            </select>
                                        </label>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isTinVerifying}
                                        className="mt-4 h-9 px-5 rounded-lg bg-primary text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 transition-colors hover:bg-primary-dark disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {isTinVerifying ? <Loader2 size={17} className="animate-spin" /> : <Search size={17} />}
                                        Search TIN
                                    </button>
                                </form>

                                <div className="min-h-[260px] bg-white dark:bg-gray-800">
                                    {tinResult?.result ? (
                                        <>
                                            <div className="px-4 py-3">
                                                <h3 className="text-xs font-black uppercase tracking-widest text-secondary dark:text-gray-400">Result</h3>
                                            </div>
                                            <ResultGrid result={getTinDisplayResult(tinResult.result)} />
                                        </>
                                    ) : (
                                        <div className="h-full min-h-[260px] flex items-center justify-center px-6 py-10 text-center">
                                            <div>
                                                <Search size={28} className="mx-auto mb-3 text-secondary/40" />
                                                <p className="text-sm font-bold text-secondary dark:text-gray-400">TIN search result will appear here.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>
                    )}

                    {activeBirService === 'loa' && (
                        <section className="rounded-2xl border border-neutral-medium bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
                            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]">
                                <form onSubmit={handleLoaVerify} className="p-3 space-y-2 border-b xl:border-b-0 xl:border-r border-neutral-medium/70 dark:border-gray-700">
                                    <div>
                                        <h2 className="text-xs font-black text-neutral-dark dark:text-white uppercase tracking-widest">LOA Verifier</h2>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        <label className="space-y-0.5">
                                            <span className="inline-flex h-[14px] items-center text-[9px] font-black uppercase leading-none tracking-widest text-secondary dark:text-gray-400">TIN <span className="text-primary">*</span></span>
                                            <input
                                                value={loaForm.tin}
                                                onChange={(event) => setLoaForm(prev => ({ ...prev, tin: formatTinForDisplay(event.target.value, 12) }))}
                                                inputMode="numeric"
                                                required
                                                className="w-full h-9 px-3 rounded-lg border border-neutral-medium bg-neutral-light/50 text-sm font-semibold outline-none transition-all focus:border-primary/40 focus:ring-4 focus:ring-primary/5 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                                            />
                                        </label>
                                        <label className="space-y-0.5">
                                            <span className="inline-flex h-[14px] items-center gap-1.5 text-[9px] font-black uppercase leading-none tracking-widest text-secondary dark:text-gray-400">
                                                LOA Case No. <span className="text-primary">*</span>
                                                <span className="group relative inline-flex h-3 w-3 shrink-0 items-center justify-center">
                                                    <HelpCircle size={12} className="text-primary" />
                                                    <span className="pointer-events-none absolute left-1/2 top-5 z-50 hidden w-[min(560px,80vw)] -translate-x-1/2 rounded-xl border border-neutral-medium bg-white p-2 shadow-2xl group-hover:block dark:border-gray-700 dark:bg-gray-800">
                                                        <img
                                                            src="/loa-sample.png"
                                                            alt="LOA case number sample"
                                                            className="w-full max-h-[520px] rounded-lg object-contain"
                                                        />
                                                    </span>
                                                </span>
                                            </span>
                                            <input
                                                value={loaForm.auditCase}
                                                onChange={(event) => setLoaForm(prev => ({ ...prev, auditCase: event.target.value }))}
                                                required
                                                className="w-full h-9 px-3 rounded-lg border border-neutral-medium bg-neutral-light/50 text-sm font-semibold outline-none transition-all focus:border-primary/40 focus:ring-4 focus:ring-primary/5 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                                            />
                                        </label>
                                        <label className="md:col-span-2 space-y-0.5">
                                            <span className="inline-flex h-[14px] items-center text-[9px] font-black uppercase leading-none tracking-widest text-secondary dark:text-gray-400">Registered Name</span>
                                            <input
                                                value={loaForm.registeredName}
                                                onChange={(event) => setLoaForm(prev => ({ ...prev, registeredName: event.target.value }))}
                                                className="w-full h-9 px-3 rounded-lg border border-neutral-medium bg-neutral-light/50 text-sm font-semibold outline-none transition-all focus:border-primary/40 focus:ring-4 focus:ring-primary/5 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                                            />
                                        </label>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isLoaVerifying}
                                        className="mt-4 h-9 px-5 rounded-lg bg-primary text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 transition-colors hover:bg-primary-dark disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {isLoaVerifying ? <Loader2 size={17} className="animate-spin" /> : <Search size={17} />}
                                        Verify LOA
                                    </button>
                                </form>

                                <div className="min-h-[260px] bg-white dark:bg-gray-800">
                                    {loaResult?.result ? (
                                        <>
                                            <div className="px-4 py-3">
                                                <h3 className="text-xs font-black uppercase tracking-widest text-secondary dark:text-gray-400">Result</h3>
                                            </div>
                                            <ResultGrid result={{ description: loaResult.result.description }} />
                                            {Array.isArray(loaResult.result.data) && loaResult.result.data.length > 0 && (
                                                <LoaDataTable rows={loaResult.result.data} />
                                            )}
                                        </>
                                    ) : (
                                        <div className="h-full min-h-[260px] flex items-center justify-center px-6 py-10 text-center">
                                            <div>
                                                <Search size={28} className="mx-auto mb-3 text-secondary/40" />
                                                <p className="text-sm font-bold text-secondary dark:text-gray-400">LOA verification result will appear here.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>
                    )}
                </div>
            )}
        </div>
    );
};

export default GovtHub;
