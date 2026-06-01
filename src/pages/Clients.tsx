import React, { useContext, useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { AppContext } from '../App';
import UserHoverCard from '../components/UserHoverCard';
import { Search, User as UserIcon, Building2, ChevronRight, ChevronLeft, ChevronDown, FileText, Briefcase, Plus, X, Loader2, CheckCircle2, AlertCircle, Eye, Calendar, UserPlus, Shield, Edit2, Trash2, Layers, ArrowUpRight, Copy } from 'lucide-react';
import { UserRole } from '../types';
import { canViewClient } from '../utils/rbac';
import { addClient, addRetainer, updateClient, updateRetainer, deleteRetainer, addSpecial, updateSpecial, deleteSpecial, addCredential, updateCredential, deleteCredential, addNotification } from '../services/googleSheetsService';

const normalizeId = (id: any) => String(id || '').replace(/^0+(?!$)/, '').trim() || '0';
const getUserFullName = (user: any) => `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
const sortUsersByName = (users: any[]) => [...users].sort((a, b) => getUserFullName(a).localeCompare(getUserFullName(b)));

// --- Sub-components to reduce duplication ---

const TaxComplianceRows = ({
    assignment,
    updateAssignment,
    context,
    targetClientId,
    retainers
}: {
    key?: React.Key,
    assignment: any,
    updateAssignment: (id: string, updates: any) => void,
    context: any,
    targetClientId: string,
    retainers: any[]
}) => {
    return (
        <div className="mt-3 p-4 bg-neutral-light/45 dark:bg-gray-900/50 border border-neutral-medium/60 dark:border-gray-700 rounded-xl space-y-3">
            <div className="flex items-center gap-2 mb-2">
                <Shield size={14} className="text-primary" />
                <span className="text-[10px] font-black text-neutral-dark dark:text-white">Required Compliances</span>
            </div>

            {/* Table Header */}
            {(assignment.selectedTaxes || []).length > 0 && (
                <div className="flex items-center gap-2 px-1 text-[9px] font-bold text-secondary uppercase tracking-wider">
                    <div className="flex-1">Tax Code</div>
                    <div className="w-16">Type</div>
                    <div className="w-[85px]">Frequency</div>
                    <div className="w-2"></div>
                    <div className="w-10">Val</div>
                    <div className="w-16">Unit</div>
                    <div className="w-6"></div>
                </div>
            )}

            <div className="space-y-2">
                {(assignment.selectedTaxes || []).length === 0 && (
                    <div className="py-4 text-center border border-dashed border-neutral-medium dark:border-gray-700 rounded-lg">
                        <p className="text-[10px] text-secondary italic font-medium">No compliances added yet.</p>
                    </div>
                )}
                {(assignment.selectedTaxes || []).map((selectedTax: any, taxIndex: number) => {
                    const availableTaxesMaster = (context?.taxCompliances || []);
                    const masterTax = availableTaxesMaster.find((tc: any) => tc.taxID === selectedTax.taxID);
                    const pickedTaxIds = (assignment.selectedTaxes || []).map((st: any) => st.taxID).filter((id: any) => id && id !== selectedTax.taxID);

                    const existingTaxIds = (context?.deadlines || [])
                        .filter((d: any) => {
                            const parentRetainer = retainers.find(r => normalizeId(r.id) === normalizeId(d.retainerID));
                            return parentRetainer && normalizeId(parentRetainer.clientId) === targetClientId && d.serviceID === '0001';
                        })
                        .map((d: any) => d.taxID);

                    const availableTaxes = availableTaxesMaster.filter((tc: any) =>
                        !pickedTaxIds.includes(tc.taxID) &&
                        (!existingTaxIds.includes(tc.taxID) || tc.taxID === selectedTax.taxID)
                    );

                    const parts = selectedTax.dueDateCode.split('+');
                    const freqPrefix = parts[0] || 'M';
                    const valueWithUnit = parts[1] || '10D';
                    const val = valueWithUnit.replace(/[^\d]/g, '');
                    const unit = valueWithUnit.replace(/[\d]/g, '') || 'D';
                    const isManual = selectedTax.isManual;

                    return (
                        <div key={taxIndex} className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-200">
                            <div className="flex-1">
                                <select
                                    required
                                    value={selectedTax.taxID}
                                    onChange={(e) => {
                                        const tc = context?.taxCompliances?.find((t: any) => t.taxID === e.target.value);
                                        const prefix = tc?.frequency === 'Monthly' ? 'M' : tc?.frequency === 'Quarterly' ? 'Q' : 'A';
                                        const days = tc?.frequency === 'Monthly' ? '10' : '25';
                                        const paddedDays = String(days).padStart(2, '0');

                                        const newTaxes = [...assignment.selectedTaxes];
                                        newTaxes[taxIndex] = { taxID: e.target.value, dueDateCode: `${prefix}+${paddedDays}D`, isManual: false };
                                        updateAssignment(assignment.id, { selectedTaxes: newTaxes });
                                    }}
                                    className="w-full px-2 py-1.5 bg-white dark:bg-gray-800 border border-neutral-medium dark:border-gray-700 rounded-lg text-xs font-bold focus:ring-1 focus:ring-primary outline-none"
                                >
                                    <option value="">Select Code...</option>
                                    {availableTaxes.map((tc: any) => <option key={tc.taxID} value={tc.taxID}>{tc.complianceCode}</option>)}
                                </select>
                            </div>

                            <div className="w-16">
                                <select
                                    value={isManual ? 'Manual' : 'Fixed'}
                                    onChange={(e) => {
                                        const manual = e.target.value === 'Manual';
                                        const newTaxes = [...assignment.selectedTaxes];
                                        newTaxes[taxIndex] = { ...selectedTax, isManual: manual };
                                        updateAssignment(assignment.id, { selectedTaxes: newTaxes });
                                    }}
                                    className="w-full px-1.5 py-1.5 bg-white dark:bg-gray-800 border border-neutral-medium dark:border-gray-700 rounded-lg text-[9px] font-bold focus:ring-1 focus:ring-primary outline-none"
                                >
                                    <option value="Fixed">Fixed</option>
                                    <option value="Manual">Manual</option>
                                </select>
                            </div>

                            <div className="w-[85px]">
                                {!isManual ? (
                                    <span className="text-[10px] font-bold text-secondary/70 bg-gray-50 dark:bg-gray-900/30 px-2 py-1.5 rounded-lg border border-neutral-medium dark:border-gray-700 block text-center truncate">
                                        {masterTax?.frequency || '---'}
                                    </span>
                                ) : (
                                    <select
                                        value={freqPrefix}
                                        onChange={(e) => {
                                            const newTaxes = [...assignment.selectedTaxes];
                                            const paddedVal = String(val).padStart(2, '0');
                                            newTaxes[taxIndex] = { ...selectedTax, dueDateCode: `${e.target.value}+${paddedVal}${unit}` };
                                            updateAssignment(assignment.id, { selectedTaxes: newTaxes });
                                        }}
                                        className="w-full px-1.5 py-1.5 bg-white dark:bg-gray-800 border border-neutral-medium dark:border-gray-700 rounded-lg text-[9px] font-bold focus:ring-1 focus:ring-primary outline-none"
                                    >
                                        <option value="M">Monthly</option>
                                        <option value="Q">Quarterly</option>
                                        <option value="A">Annual</option>
                                    </select>
                                )}
                            </div>

                            <span className="text-secondary font-bold text-xs">+</span>

                            <div className="w-10 bg-white dark:bg-gray-800 px-1 py-1 rounded-lg border border-neutral-medium dark:border-gray-700">
                                <input
                                    type="number"
                                    min="0"
                                    max="99"
                                    className="w-full bg-transparent text-xs font-bold text-primary outline-none text-center [appearance:textfield]"
                                    value={val}
                                    onChange={(e) => {
                                        let inputVal = e.target.value.replace(/[^\d]/g, '');
                                        const newTaxes = [...assignment.selectedTaxes];
                                        let rawNum = inputVal.replace(/^0+/, '');
                                        let finalVal = '';
                                        if (!rawNum) {
                                            finalVal = inputVal === '0' || inputVal === '00' ? '00' : '';
                                        } else if (rawNum.length === 1) {
                                            finalVal = '0' + rawNum;
                                        } else {
                                            finalVal = rawNum.slice(-2);
                                        }
                                        newTaxes[taxIndex] = { ...selectedTax, dueDateCode: `${freqPrefix}+${finalVal || '00'}${unit}` };
                                        updateAssignment(assignment.id, { selectedTaxes: newTaxes });
                                    }}
                                />
                            </div>

                            <div className="w-16">
                                <select
                                    value={unit}
                                    onChange={(e) => {
                                        const newTaxes = [...assignment.selectedTaxes];
                                        const paddedVal = String(val).padStart(2, '0');
                                        newTaxes[taxIndex] = { ...selectedTax, dueDateCode: `${freqPrefix}+${paddedVal}${e.target.value}` };
                                        updateAssignment(assignment.id, { selectedTaxes: newTaxes });
                                    }}
                                    className="w-full px-1.5 py-1.5 bg-white dark:bg-gray-800 border border-neutral-medium dark:border-gray-700 rounded-lg text-[9px] font-bold focus:ring-1 focus:ring-primary outline-none"
                                >
                                    <option value="D">Days</option>
                                    <option value="M">Months</option>
                                </select>
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    const newTaxes = assignment.selectedTaxes.filter((_: any, i: number) => i !== taxIndex);
                                    updateAssignment(assignment.id, { selectedTaxes: newTaxes });
                                }}
                                className="p-1.5 text-secondary hover:text-error rounded-lg transition-colors"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    );
                })}
                <button
                    type="button"
                    onClick={() => updateAssignment(assignment.id, { selectedTaxes: [...(assignment.selectedTaxes || []), { taxID: '', dueDateCode: 'M+10D' }] })}
                    className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-primary px-2 py-1 hover:bg-primary/5 rounded-md"
                >
                    <Plus size={12} /> Add Compliance
                </button>
            </div>
        </div>
    );
};

const ServiceAssignmentBox = ({
    assignment,
    updateAssignment,
    removeAssignmentBox,
    canModifyAssignment,
    availableStaff,
    context,
    targetClientId,
    retainers,
    editingRetainerId,
    assignments
}: {
    key?: React.Key,
    assignment: any,
    updateAssignment: (id: string, updates: any) => void,
    removeAssignmentBox: (id: string) => void,
    canModifyAssignment: boolean,
    availableStaff: any[],
    context: any,
    targetClientId: string,
    retainers: any[],
    editingRetainerId: string | null,
    assignments: any[]
}) => {
    const existingServiceIdentifiers = retainers
        .filter(r => {
            const rClientId = normalizeId(r.clientId);
            const isActive = String(r.engagementStatus || '').toUpperCase() === 'ACTIVE';
            return rClientId === targetClientId && isActive;
        })
        .map(r => String(r.serviceType || '').trim());

    const selectedIds = assignments.map(a => a.serviceId).filter(id => id && id !== assignment.serviceId);

    const availableServices = (context?.services || [])
        .filter((s: any) => {
            const sId = normalizeId(s.id);
            const sName = String(s.name || '').trim();
            const isRetainerType = String(s.type || '').trim().toLowerCase() === 'retainer';
            if (!isRetainerType) return false;

            const isThisServiceBeingEdited = editingRetainerId && (
                normalizeId(assignment.serviceId) === sId ||
                String(assignment.serviceId).trim() === sName
            );

            const isAlreadyAssigned = existingServiceIdentifiers.some(idOrName =>
                normalizeId(idOrName) === sId || idOrName === sName
            );

            return (isThisServiceBeingEdited || !isAlreadyAssigned) && !selectedIds.includes(s.id);
        });

    return (
        <div className="bg-white/85 dark:bg-gray-800/60 border border-neutral-medium/60 dark:border-gray-700 rounded-2xl p-4 space-y-4 relative group shadow-sm shadow-neutral-dark/5">
            {assignments.length > 1 && (
                <button
                    type="button"
                    onClick={() => removeAssignmentBox(assignment.id)}
                    className="absolute top-3 right-3 p-2 text-secondary hover:text-error hover:bg-error/10 rounded-xl transition-all z-10"
                    title="Remove Service"
                >
                    <X size={16} />
                </button>
            )}

            <div className="flex items-center gap-2 pr-10">
                <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <FileText size={15} />
                </div>
                <div>
                    <h4 className="text-[11px] font-black text-neutral-dark dark:text-white">Retainer Service Assignment</h4>
                    <p className="text-[9px] font-bold text-secondary/70 dark:text-gray-400">Select service, staff owner, and deadline logic</p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                    <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest ml-1 opacity-60 dark:opacity-100">Service</label>
                    <select
                        required
                        value={assignment.serviceId}
                        onChange={(e) => updateAssignment(assignment.id, { serviceId: e.target.value, selectedTaxes: [], dueDateCode: '' })}
                        className="w-full px-3 py-2 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-[11px] font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all"
                    >
                        <option value="">Select...</option>
                        {availableServices.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>

                <div className="space-y-1">
                    <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest ml-1 opacity-60 dark:opacity-100">Assignee</label>
                    <select
                        required
                        disabled={!canModifyAssignment}
                        value={assignment.assignedStaffId}
                        onChange={(e) => updateAssignment(assignment.id, { assignedStaffId: e.target.value })}
                        className={`w-full px-3 py-2 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-[11px] font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all ${!canModifyAssignment ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                        <option value="">Select...</option>
                        {availableStaff.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
                    </select>
                </div>

                <div className="space-y-1">
                    <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest ml-1 opacity-60 dark:opacity-100">Start Date</label>
                    <input
                        required
                        type="date"
                        value={assignment.startDate}
                        onChange={(e) => updateAssignment(assignment.id, { startDate: e.target.value })}
                        className="w-full px-3 py-2 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-[11px] font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all"
                    />
                </div>

                {assignment.serviceId && assignment.serviceId !== '0001' && (
                    <div className="col-span-full mt-1 p-4 bg-neutral-light/45 dark:bg-gray-900/50 border border-neutral-medium/60 dark:border-gray-700 rounded-xl space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                            <Calendar size={12} className="text-primary" />
                            <span className="text-[10px] font-black text-neutral-dark dark:text-white">Deadline Logic</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <select
                                value={assignment.dueDateCode.split('+')[0] || 'M'}
                                onChange={(e) => {
                                    const parts = assignment.dueDateCode.split('+');
                                    updateAssignment(assignment.id, { dueDateCode: `${e.target.value}+${parts[1] || '10D'}` });
                                }}
                                className="flex-1 px-2 py-1.5 bg-white dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-lg text-[11px] font-bold outline-none"
                            >
                                <option value="SM">Semi-monthly</option>
                                <option value="M">Monthly</option>
                                <option value="Q">Quarterly</option>
                                <option value="A">Annual</option>
                            </select>
                            <div className="text-secondary font-black text-xs">+</div>
                            <input
                                type="number"
                                className="w-12 px-1 py-1.5 bg-white dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-lg text-[11px] font-bold text-primary text-center outline-none"
                                value={assignment.dueDateCode.split('+')[1]?.replace(/[^\d]/g, '') || '00'}
                                onChange={(e) => {
                                    const parts = assignment.dueDateCode.split('+');
                                    const unit = parts[1]?.replace(/[\d]/g, '') || 'D';
                                    updateAssignment(assignment.id, { dueDateCode: `${parts[0] || 'M'}+${e.target.value.replace(/[^\d]/g, '').slice(-2).padStart(2, '0')}${unit}` });
                                }}
                            />
                            <select
                                value={assignment.dueDateCode.split('+')[1]?.replace(/[\d]/g, '') || 'D'}
                                onChange={(e) => {
                                    const parts = assignment.dueDateCode.split('+');
                                    updateAssignment(assignment.id, { dueDateCode: `${parts[0] || 'M'}+${parts[1]?.replace(/[^\d]/g, '') || '10'}${e.target.value}` });
                                }}
                                className="w-20 px-2 py-1.5 bg-white dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-lg text-[11px] font-bold outline-none"
                            >
                                <option value="D">Days</option>
                                <option value="M">Months</option>
                            </select>
                        </div>
                    </div>
                )}
            </div>

            {assignment.serviceId === '0001' && (
                <TaxComplianceRows
                    assignment={assignment}
                    updateAssignment={updateAssignment}
                    context={context}
                    targetClientId={targetClientId}
                    retainers={retainers}
                />
            )}
        </div>
    );
};

const SpecialEngagementBox = ({
    task,
    updateSpecialAssignment,
    removeSpecialBox,
    availableStaff,
    context,
    specialAssignments
}: {
    key?: React.Key,
    task: any,
    updateSpecialAssignment: (id: string, updates: any) => void,
    removeSpecialBox: (id: string) => void,
    availableStaff: any[],
    context: any,
    specialAssignments: any[]
}) => {
    return (
        <div className="bg-white/85 dark:bg-gray-800/60 border border-neutral-medium/60 dark:border-gray-700 rounded-2xl p-4 space-y-4 relative group shadow-sm shadow-neutral-dark/5">
            {specialAssignments.length > 1 && (
                <button
                    type="button"
                    onClick={() => removeSpecialBox(task.id)}
                    className="absolute top-3 right-3 p-2 text-secondary hover:text-error hover:bg-error/10 rounded-xl transition-all z-10"
                    title="Remove Project"
                >
                    <X size={16} />
                </button>
            )}

            <div className="flex items-center gap-2 pr-10">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                    <Briefcase size={15} />
                </div>
                <div>
                    <h4 className="text-[11px] font-black text-neutral-dark dark:text-white">Special Project Assignment</h4>
                    <p className="text-[9px] font-bold text-secondary/70 dark:text-gray-400">Set project details, owner, timeline, and status</p>
                </div>
            </div>

            <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest ml-1 opacity-60 dark:opacity-100">Project Type</label>
                        <select
                            required
                            value={task.serviceId}
                            onChange={(e) => updateSpecialAssignment(task.id, { serviceId: e.target.value })}
                            className="w-full px-3 py-2 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-[11px] font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all"
                        >
                            <option value="">Select...</option>
                            {context?.services?.filter((s: any) => String(s.type || '').trim().toLowerCase() === 'special').map((s: any) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest ml-1 opacity-60 dark:opacity-100">Project Title</label>
                        <input
                            required
                            type="text"
                            value={task.projectTitle}
                            onChange={(e) => updateSpecialAssignment(task.id, { projectTitle: e.target.value })}
                            className="w-full px-3 py-2 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-[11px] font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all"
                            placeholder="Audit Support..."
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest ml-1 opacity-60 dark:opacity-100">Assignee</label>
                        <select
                            required
                            value={task.assignedStaffId}
                            onChange={(e) => updateSpecialAssignment(task.id, { assignedStaffId: e.target.value })}
                            className="w-full px-3 py-2 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-[11px] font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all"
                        >
                            <option value="">Select...</option>
                            {availableStaff.map(u => (
                                <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest ml-1 opacity-60 dark:opacity-100">Status</label>
                        <select
                            value={task.status}
                            onChange={(e) => updateSpecialAssignment(task.id, { status: e.target.value })}
                            className="w-full px-3 py-2 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-[11px] font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all"
                        >
                            <option value="Planning">Planning</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Completed">Completed</option>
                            <option value="Blocked">Blocked</option>
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest ml-1 opacity-60 dark:opacity-100">Start Date</label>
                        <input
                            required
                            type="date"
                            value={task.startDate}
                            onChange={(e) => updateSpecialAssignment(task.id, { startDate: e.target.value })}
                            className="w-full px-3 py-2 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-[11px] font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest ml-1 opacity-60 dark:opacity-100">Estimated Done</label>
                        <input
                            type="date"
                            value={task.endDate}
                            onChange={(e) => updateSpecialAssignment(task.id, { endDate: e.target.value })}
                            className="w-full px-3 py-2 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-[11px] font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all"
                        />
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest ml-1 opacity-60 dark:opacity-100">Description</label>
                    <textarea
                        value={task.description}
                        onChange={(e) => updateSpecialAssignment(task.id, { description: e.target.value })}
                        rows={2}
                        className="w-full px-3 py-2 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-[11px] font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none resize-none transition-all"
                        placeholder="Project brief..."
                    />
                </div>
            </div>
        </div>
    );
};

const CredentialBox = ({
    credential,
    onEdit,
    onDelete,
    isEditing,
    onCancel,
    onSave,
    isSubmitting
}: {
    key?: React.Key,
    credential: any,
    onEdit?: (c: any) => void,
    onDelete?: (id: string) => void,
    isEditing?: boolean,
    onCancel?: () => void,
    onSave?: (data: any) => void,
    isSubmitting?: boolean
}) => {
    const [showPassword, setShowPassword] = useState(false);
    const [formData, setFormData] = useState(credential);

    useEffect(() => {
        setFormData(credential);
    }, [credential]);

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    if (isEditing) {
        const isExistingCredential = Boolean(credential.credentialID);

        return (
            <div className={`bg-white/85 dark:bg-gray-800/60 rounded-2xl border shadow-sm shadow-neutral-dark/5 p-5 space-y-4 animate-in zoom-in-95 duration-200 ${isExistingCredential ? 'border-primary/30 dark:border-primary/20' : 'border-emerald-500/30 dark:border-emerald-500/20'}`}>
                <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isExistingCredential ? 'bg-primary/10 text-primary' : 'bg-emerald-500/10 text-emerald-600'}`}>
                        <Shield size={15} />
                    </div>
                    <div>
                        <h4 className={`text-[10px] font-black uppercase tracking-widest ${isExistingCredential ? 'text-primary' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {isExistingCredential ? 'Editing Credential' : 'New Credential'}
                        </h4>
                        <p className="text-[9px] font-bold text-secondary/70 dark:text-gray-400">Store system access details for this client</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest ml-1 opacity-60 dark:opacity-100">System Name</label>
                        <input
                            type="text"
                            value={formData.systemName}
                            onChange={(e) => setFormData({ ...formData, systemName: e.target.value })}
                            className="w-full px-3 py-2 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all disabled:opacity-50"
                            placeholder="e.g. BIR, SSS..."
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest ml-1 opacity-60 dark:opacity-100">Username</label>
                        <input
                            type="text"
                            value={formData.username}
                            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                            className="w-full px-3 py-2 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all disabled:opacity-50"
                        />
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest ml-1 opacity-60 dark:opacity-100">Password</label>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                className="w-full px-3 py-2 pr-10 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all disabled:opacity-50"
                            />
                            <button 
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-primary transition-colors"
                            >
                                <Eye size={14} className={showPassword ? "text-primary" : ""} />
                            </button>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest ml-1 opacity-60 dark:opacity-100">Security Answer</label>
                        <input
                            type="text"
                            value={formData.securityAnswer}
                            onChange={(e) => setFormData({ ...formData, securityAnswer: e.target.value })}
                            className="w-full px-3 py-2 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all disabled:opacity-50"
                        />
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest ml-1 opacity-60 dark:opacity-100">Remarks</label>
                    <textarea
                        value={formData.remarks}
                        onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                        className="w-full px-3 py-2 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all disabled:opacity-50 min-h-[64px] resize-none"
                        placeholder="Additional notes..."
                    />
                </div>
                <div className="flex gap-2 pt-2">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-secondary hover:bg-neutral-light dark:hover:bg-gray-700 transition-all border border-neutral-medium dark:border-gray-700"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onSave?.(formData)}
                        disabled={isSubmitting}
                        className={`flex-1 py-2 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${isExistingCredential ? 'bg-primary hover:bg-primary-dark shadow-primary/20' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'}`}
                    >
                        {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        Save Credential
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="group bg-white/85 dark:bg-gray-800/60 rounded-2xl border border-neutral-medium/60 dark:border-gray-700 shadow-sm shadow-neutral-dark/5 p-4 relative overflow-hidden hover:border-primary/20 hover:shadow-md transition-all duration-300">
            <div className="flex items-start justify-between gap-3 relative z-10">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center text-primary group-hover:scale-105 transition-transform shrink-0">
                        <Shield size={16} />
                    </div>
                    <div className="min-w-0">
                        <h4 className="text-[13px] font-black text-neutral-dark dark:text-white leading-tight truncate">{credential.systemName || 'Untitled Credential'}</h4>
                        <p className="text-[10px] text-secondary font-bold opacity-70 truncate">
                            Username: {credential.username || '---'} · Password stored
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-1 opacity-45 group-hover:opacity-100 transition-all relative z-10 shrink-0">
                    <button onClick={() => onEdit?.(credential)} className="p-2 text-secondary hover:text-primary hover:bg-primary/10 rounded-xl transition-all" title="Edit Credential">
                        <Edit2 size={14} />
                    </button>
                    <button onClick={() => onDelete?.(credential.credentialID)} className="p-2 text-secondary hover:text-error hover:bg-error/10 rounded-xl transition-all" title="Delete Credential">
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 relative z-10 pl-12 mt-3">
                <div className="space-y-1">
                    <label className="text-[8px] font-black text-secondary/50 uppercase tracking-widest">Username</label>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-neutral-dark dark:text-white truncate">{credential.username || '---'}</span>
                        <button onClick={() => handleCopy(credential.username || '')} className="text-secondary hover:text-primary transition-colors" title="Copy Username">
                            <Copy size={10} />
                        </button>
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-[8px] font-black text-secondary/50 uppercase tracking-widest">Password</label>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-neutral-dark dark:text-white">
                            {showPassword ? credential.password : '••••••••'}
                        </span>
                        <button onClick={() => setShowPassword(!showPassword)} className="text-secondary hover:text-primary transition-colors">
                            {showPassword ? <Eye size={10} className="text-primary" /> : <Eye size={10} />}
                        </button>
                        <button onClick={() => handleCopy(credential.password || '')} className="text-secondary hover:text-primary transition-colors" title="Copy Password">
                            <Copy size={10} />
                        </button>
                    </div>
                </div>
            </div>

            {(credential.remarks || credential.securityAnswer) && (
                <div className="mt-3 pt-3 border-t border-neutral-medium/30 dark:border-gray-700/30 pl-11 space-y-2">
                    {credential.securityAnswer && (
                        <p className="text-[9px] text-secondary font-bold">
                            <span className="opacity-50 uppercase tracking-widest">Answer:</span> {credential.securityAnswer}
                        </p>
                    )}
                    {credential.remarks && (
                        <p className="text-[9px] text-secondary leading-relaxed italic">"{credential.remarks}"</p>
                    )}
                </div>
            )}
        </div>
    );
};

const CredentialRow = ({
    credential,
    onEdit,
    onDelete
}: {
    key?: React.Key,
    credential: any,
    onEdit?: (c: any) => void,
    onDelete?: (id: string) => void
}) => {
    const [showPassword, setShowPassword] = useState(false);

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text || '');
    };

    return (
        <div className="group grid grid-cols-1 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto] gap-3 sm:gap-4 px-4 py-3.5 hover:bg-primary/[0.02] dark:hover:bg-primary/[0.05] transition-colors">
            <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center text-primary shrink-0">
                    <Shield size={16} />
                </div>
                <div className="min-w-0">
                    <h4 className="text-[13px] font-black text-neutral-dark dark:text-white leading-tight truncate">
                        {credential.systemName || 'Untitled Credential'}
                    </h4>
                    {credential.remarks && (
                        <p className="text-[10px] text-secondary dark:text-gray-400 font-medium truncate mt-0.5" title={credential.remarks}>
                            {credential.remarks}
                        </p>
                    )}
                </div>
            </div>

            <div className="sm:self-center min-w-0 pl-12 sm:pl-0">
                <p className="sm:hidden text-[9px] font-black text-secondary/50 mb-1">Username</p>
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-bold text-neutral-dark dark:text-white truncate">{credential.username || '---'}</span>
                    <button type="button" onClick={() => handleCopy(credential.username)} className="text-secondary hover:text-primary transition-colors shrink-0" title="Copy Username">
                        <Copy size={12} />
                    </button>
                </div>
            </div>

            <div className="sm:self-center min-w-0 pl-12 sm:pl-0">
                <p className="sm:hidden text-[9px] font-black text-secondary/50 mb-1">Password</p>
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-bold text-neutral-dark dark:text-white truncate">
                        {showPassword ? credential.password : '••••••••'}
                    </span>
                    <button type="button" onClick={() => setShowPassword(prev => !prev)} className="text-secondary hover:text-primary transition-colors shrink-0" title={showPassword ? 'Hide Password' : 'Show Password'}>
                        <Eye size={12} className={showPassword ? 'text-primary' : ''} />
                    </button>
                    <button type="button" onClick={() => handleCopy(credential.password)} className="text-secondary hover:text-primary transition-colors shrink-0" title="Copy Password">
                        <Copy size={12} />
                    </button>
                </div>
            </div>

            <div className="flex items-center gap-1 sm:justify-end pl-12 sm:pl-0 opacity-70 group-hover:opacity-100 transition-opacity">
                <button type="button" onClick={() => onEdit?.(credential)} className="p-2 text-secondary hover:text-primary hover:bg-primary/10 rounded-xl transition-all" title="Edit Credential">
                    <Edit2 size={14} />
                </button>
                <button type="button" onClick={() => onDelete?.(credential.credentialID)} className="p-2 text-secondary hover:text-error hover:bg-error/10 rounded-xl transition-all" title="Delete Credential">
                    <Trash2 size={14} />
                </button>
            </div>
        </div>
    );
};

const ClientTable = ({ clients, title, activeTab, onViewDetails, defaultExpanded = false }: { key?: React.Key, clients: any[], title?: string, activeTab: string, onViewDetails?: (client: any) => void, defaultExpanded?: boolean }) => {
    const context = useContext(AppContext);
    const allUsers = context?.allUsers || [];
    const [isExpanded, setIsExpanded] = useState(defaultExpanded || !title);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const userByKey = useMemo(() => {
        const lookup = new Map<string, any>();
        allUsers.forEach(u => {
            lookup.set(String(u.id), u);
            lookup.set(u.username || '', u);
            lookup.set(u.firstName, u);
            lookup.set(`${u.firstName} ${u.lastName}`, u);
        });
        return lookup;
    }, [allUsers]);

    useEffect(() => {
        setCurrentPage(1);
    }, [clients]);

    if (clients.length === 0) return null;

    const totalPages = Math.ceil(clients.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedClients = clients.slice(startIndex, startIndex + itemsPerPage);

    const getStaffInfo = (staffName: string) => {
        return userByKey.get(staffName);
    };

    const renderStaffAvatar = (staffName: string) => {
        const staff = getStaffInfo(staffName);

        return (
            <UserHoverCard user={staff} fallbackName={staffName} size="md" showName />
        );
    };

    return (
        <div className="mb-2">
            {title && (
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-3 mb-2 pl-1 transition-colors group"
                >
                    <ChevronRight
                        size={16}
                        className={`transition-transform duration-300 ${isExpanded ? 'rotate-90 text-primary' : 'text-secondary/50 group-hover:text-secondary'}`}
                    />
                    <h2 className={`text-[13px] font-black uppercase tracking-[0.1em] transition-colors ${isExpanded ? 'text-neutral-dark dark:text-white' : 'text-secondary group-hover:text-neutral-dark dark:group-hover:text-white'}`}>
                        {title}
                    </h2>
                    <span className="ml-1 px-2 py-0.5 rounded-lg bg-primary/10 text-[10px] font-black text-primary shadow-sm shadow-primary/5">
                        {clients.length}
                    </span>
                </button>
            )}
            {isExpanded && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm shadow-neutral-dark/5">
                    <div className="">
                        <table className="w-full text-left border-collapse table-fixed">
                            <thead>
                                <tr className="bg-neutral-light/50 dark:bg-gray-900/50 border-b border-neutral-medium dark:border-gray-700">
                                    <th className="px-4 py-3 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.2em] w-[40%]">Client Entity</th>
                                    <th className="px-4 py-3 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.2em] w-[15%]">Status</th>
                                    <th className="px-4 py-3 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.2em] w-[20%]">Active Services</th>
                                    <th className="px-4 py-3 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.2em] w-[20%]">Assigned To</th>
                                    <th className="px-4 py-3 w-[5%]"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-medium/50 dark:divide-gray-800">
                                {paginatedClients.map((client: any, index: number) => (
                                    <tr
                                        key={client.id || client.name}
                                        onClick={() => onViewDetails?.(client)}
                                        className="group cursor-pointer transition-all duration-300 hover:bg-primary/[0.02] dark:hover:bg-primary/[0.05] relative hover:z-[60] last:border-0"
                                    >
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-3">
                                                <div className="p-1.5 bg-primary/5 rounded-lg text-primary border border-primary/10 transition-colors group-hover:bg-primary/10">
                                                    <Building2 size={14} />
                                                </div>
                                                <span className="text-[13px] font-black text-neutral-dark dark:text-white tracking-tight group-hover:text-primary transition-colors truncate" title={client.name}>{client.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            {(() => {
                                                const displayStatus = activeTab === 'Retainer' ? client.retainerStatus :
                                                    activeTab === 'Special' ? client.specialStatus :
                                                        client.status;

                                                if (activeTab === 'Special') {
                                                    const projects = client.specialProjects || [];
                                                    if (projects.length === 0) return <span className="text-[10px] text-secondary/40 dark:text-gray-400/40 font-bold italic uppercase tracking-wider">No Projects</span>;

                                                    const statuses = Array.from(new Set(projects.map((p: any) => p.status || 'Planning')));
                                                    const isMixed = statuses.length > 1;
                                                    const status = isMixed ? 'Multiple' : statuses[0];

                                                    return (
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border shadow-sm ${status === 'Completed' ? 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' :
                                                                status === 'In Progress' ? 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20' :
                                                                    status === 'Blocked' ? 'bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20' :
                                                                        'bg-neutral-50 text-neutral-600 border-neutral-100 dark:bg-gray-500/10 dark:text-gray-400 dark:border-gray-500/20'
                                                            }`}>
                                                            <div className={`w-1 h-1 rounded-full mr-1.5 ${status === 'Completed' ? 'bg-emerald-500' :
                                                                    status === 'In Progress' ? 'bg-blue-500' :
                                                                        status === 'Blocked' ? 'bg-rose-500' :
                                                                            'bg-neutral-400'
                                                                }`} />
                                                            {status} {projects.length > 1 && `(${projects.length})`}
                                                        </span>
                                                    );
                                                }

                                                const isInactive = displayStatus?.toLowerCase().includes('inactive') || (!displayStatus && activeTab === 'All' && !client.isActive);

                                                return (
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border shadow-sm ${isInactive
                                                            ? 'bg-neutral-50 text-secondary border-neutral-200 dark:bg-gray-700/50 dark:text-gray-400 dark:border-gray-700'
                                                            : 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                                                        }`}>
                                                        <div className={`w-1 h-1 rounded-full mr-1.5 ${isInactive ? 'bg-secondary/40' : 'bg-emerald-500'}`} />
                                                        {displayStatus || (client.isActive ? 'Active' : 'Inactive')}
                                                    </span>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            {(() => {
                                                const services = activeTab === 'Retainer' ? Array.from(client.retainerServices || []) :
                                                    activeTab === 'Special' ? Array.from(client.specialServices || []) :
                                                        Array.from(new Set([...Array.from(client.retainerServices || []), ...Array.from(client.specialServices || [])]));

                                                if (services.length === 0) return <span className="text-[10px] text-secondary/30 dark:text-gray-400/30">-</span>;

                                                return (
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[11px] font-bold text-secondary dark:text-gray-400 truncate max-w-[140px] leading-none">{services[0]}</span>
                                                        {services.length > 1 && (
                                                            <div className="relative group/tooltip flex-shrink-0">
                                                                <div className="w-5 h-5 rounded-full bg-primary/5 border border-primary/10 flex items-center justify-center cursor-help hover:bg-primary/10 transition-colors shadow-sm shadow-primary/5">
                                                                    <span className="text-[8px] font-black text-primary">+{services.length - 1}</span>
                                                                </div>
                                                                <div className={`absolute ${index === 0 ? 'top-full mt-2' : 'bottom-full mb-2'} left-1/2 -translate-x-1/2 hidden group-hover/tooltip:block z-[100] animate-in fade-in zoom-in-95 duration-200`}>
                                                                    <div className="bg-neutral-dark/95 backdrop-blur-md text-white text-[10px] py-2.5 px-3.5 rounded-xl shadow-2xl border border-white/10 min-w-[120px]">
                                                                        <ul className="space-y-1.5">
                                                                            {services.slice(1).map((s: any, i: number) => (
                                                                                <li key={i} className="flex items-center gap-2 whitespace-nowrap">
                                                                                    <div className="w-1 h-1 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.6)]" />
                                                                                    <span className="opacity-90">{s}</span>
                                                                                </li>
                                                                            ))}
                                                                        </ul>
                                                                        <div className={`absolute ${index === 0 ? 'bottom-full -mb-1 rotate-180' : 'top-full -mt-1'} left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-dark/95`} />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            {(() => {
                                                const staffArr = Array.from<string>(activeTab === 'Retainer' ? client.retainerStaff :
                                                    activeTab === 'Special' ? client.specialStaff :
                                                        client.staff || []);

                                                if (staffArr.length === 0) return <span className="text-[10px] text-secondary/30 font-bold italic uppercase tracking-tighter">Unassigned</span>;

                                                return (
                                                    <div className="flex items-center gap-1.5">
                                                        {renderStaffAvatar(staffArr[0])}
                                                        {staffArr.length > 1 && (
                                                            <div className="relative group/tooltip">
                                                                <div className="w-5 h-5 rounded-full bg-primary/5 border border-primary/10 flex items-center justify-center cursor-help hover:bg-primary/10 transition-colors shadow-sm shadow-primary/5">
                                                                    <span className="text-[8px] font-black text-primary">+{staffArr.length - 1}</span>
                                                                </div>
                                                                <div className={`absolute ${index === 0 ? 'top-full mt-2' : 'bottom-full mb-2'} left-1/2 -translate-x-1/2 hidden group-hover/tooltip:block z-[100] animate-in fade-in zoom-in-95 duration-200`}>
                                                                    <div className="bg-neutral-dark/95 backdrop-blur-md text-white text-[10px] py-2.5 px-3.5 rounded-xl shadow-2xl border border-white/10 min-w-[120px]">
                                                                        <ul className="space-y-1.5">
                                                                            {staffArr.slice(1).map((s: any, i: number) => (
                                                                                <li key={i} className="flex items-center gap-2 whitespace-nowrap">
                                                                                    <div className="w-1 h-1 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.6)]" />
                                                                                    <span className="opacity-90">{s}</span>
                                                                                </li>
                                                                            ))}
                                                                        </ul>
                                                                        <div className={`absolute ${index === 0 ? 'bottom-full -mb-1 rotate-180' : 'top-full -mt-1'} left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-dark/95`} />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-4 py-2.5 text-right">
                                            <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-all transform translate-x-1 group-hover:translate-x-0">
                                                <div className="p-1.5 bg-primary text-white rounded-lg shadow-lg shadow-primary/20 scale-90 group-hover:scale-100 transition-transform">
                                                    <ArrowUpRight size={12} strokeWidth={3} />
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="px-4 py-3 bg-white dark:bg-gray-800 border-t border-neutral-medium/50 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <p className="text-[11px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest">
                                Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, clients.length)} of {clients.length}
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setCurrentPage(p => Math.max(1, p - 1)); }}
                                    disabled={currentPage === 1}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-medium dark:border-gray-700 text-[11px] font-black uppercase tracking-wider text-neutral-dark dark:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-light dark:hover:bg-gray-700 transition-colors"
                                >
                                    <ChevronRight size={14} className="rotate-180" />
                                    Prev
                                </button>
                                <span className="px-3 py-1.5 rounded-lg bg-neutral-light dark:bg-gray-900 text-[11px] font-black text-primary">
                                    {currentPage} / {totalPages}
                                </span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setCurrentPage(p => Math.min(totalPages, p + 1)); }}
                                    disabled={currentPage === totalPages}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-medium dark:border-gray-700 text-[11px] font-black uppercase tracking-wider text-neutral-dark dark:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-light dark:hover:bg-gray-700 transition-colors"
                                >
                                    Next
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const ClientGroupedTable: React.FC<{
    sections: { title: string; clients: any[] }[];
    activeTab: string;
    groupBy: string;
    onViewDetails?: (client: any) => void;
}> = ({ sections, activeTab, groupBy, onViewDetails }) => {
    const context = useContext(AppContext);
    const allUsers = context?.allUsers || [];
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    const userByKey = useMemo(() => {
        const lookup = new Map<string, any>();
        allUsers.forEach(u => {
            lookup.set(String(u.id), u);
            lookup.set(u.username || '', u);
            lookup.set(u.firstName, u);
            lookup.set(`${u.firstName} ${u.lastName}`, u);
        });
        return lookup;
    }, [allUsers]);

    const toggleGroup = (group: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(group)) next.delete(group);
            else next.add(group);
            return next;
        });
    };

    const getStaffInfo = (staffName: string) => userByKey.get(staffName);

    const renderStaffAvatar = (staffName: string) => {
        const staff = getStaffInfo(staffName);

        return (
            <UserHoverCard user={staff} fallbackName={staffName} size="md" showName />
        );
    };

    const getServices = (client: any) => activeTab === 'Retainer'
        ? Array.from(client.retainerServices || [])
        : activeTab === 'Special'
            ? Array.from(client.specialServices || [])
            : Array.from(new Set([...Array.from(client.retainerServices || []), ...Array.from(client.specialServices || [])]));

    const getStaff = (client: any) => Array.from<string>(activeTab === 'Retainer'
        ? client.retainerStaff
        : activeTab === 'Special'
            ? client.specialStaff
            : client.staff || []);

    const getGroupStats = (items: any[]) => items.reduce((acc, client) => {
        if (client.isActive) acc.active += 1;
        else acc.inactive += 1;
        if (client.types?.has?.('Retainer')) acc.retainer += 1;
        if (client.types?.has?.('Special')) acc.special += 1;
        return acc;
    }, { active: 0, inactive: 0, retainer: 0, special: 0 });

    const renderGroupTitle = (title: string) => {
        if (groupBy === 'Staff') {
            return renderStaffAvatar(title);
        }

        return (
            <span className="text-[11px] font-bold text-neutral-dark dark:text-white">
                {title}
            </span>
        );
    };

    const renderStatus = (client: any) => {
        const isInactive = !client.isActive || String(client.status || '').toLowerCase().includes('inactive');
        return (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border shadow-sm ${isInactive
                    ? 'bg-neutral-50 text-secondary border-neutral-200 dark:bg-gray-700/50 dark:text-gray-400 dark:border-gray-700'
                    : 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                }`}>
                <div className={`w-1 h-1 rounded-full mr-1.5 ${isInactive ? 'bg-secondary/40' : 'bg-emerald-500'}`} />
                {client.status || (client.isActive ? 'Active' : 'Inactive')}
            </span>
        );
    };

    const renderRow = (client: any) => {
        const services = getServices(client);
        const staffArr = getStaff(client);

        return (
            <tr
                key={client.id || client.name}
                onClick={() => onViewDetails?.(client)}
                className="group cursor-pointer transition-all duration-300 hover:bg-primary/[0.02] dark:hover:bg-primary/[0.05] border-b border-neutral-medium/50 dark:border-gray-800 last:border-0"
            >
                <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-primary/5 rounded-lg text-primary border border-primary/10 transition-colors group-hover:bg-primary/10">
                            <Building2 size={14} />
                        </div>
                        <span className="text-[13px] font-black text-neutral-dark dark:text-white tracking-tight group-hover:text-primary transition-colors truncate" title={client.name}>
                            {client.name}
                        </span>
                    </div>
                </td>
                <td className="px-4 py-2">{renderStatus(client)}</td>
                <td className="px-4 py-2">
                    {services.length === 0 ? (
                        <span className="text-[10px] text-secondary/30 dark:text-gray-400/30">-</span>
                    ) : (
                        <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-bold text-secondary dark:text-gray-400 truncate max-w-[160px] leading-none">{String(services[0])}</span>
                            {services.length > 1 && (
                                <span className="px-1.5 py-0.5 rounded-md bg-primary/5 text-[8px] font-black text-primary border border-primary/10">
                                    +{services.length - 1}
                                </span>
                            )}
                        </div>
                    )}
                </td>
                <td className="px-4 py-2">
                    {staffArr.length === 0 ? (
                        <span className="text-[10px] text-secondary/30 font-bold italic uppercase tracking-tighter">Unassigned</span>
                    ) : (
                        <div className="flex items-center gap-1.5">
                            {renderStaffAvatar(staffArr[0])}
                            {staffArr.length > 1 && (
                                <span className="px-1.5 py-0.5 rounded-md bg-primary/5 text-[8px] font-black text-primary border border-primary/10">
                                    +{staffArr.length - 1}
                                </span>
                            )}
                        </div>
                    )}
                </td>
                <td className="px-4 py-2 text-right">
                    <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-all transform translate-x-1 group-hover:translate-x-0">
                        <div className="p-1.5 bg-primary text-white rounded-lg shadow-lg shadow-primary/20 scale-90 group-hover:scale-100 transition-transform">
                            <ArrowUpRight size={12} strokeWidth={3} />
                        </div>
                    </div>
                </td>
            </tr>
        );
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm shadow-neutral-dark/5 overflow-hidden">
            <table className="w-full text-left border-collapse table-fixed">
                <thead>
                    <tr className="bg-neutral-light/50 dark:bg-gray-900/50 border-b border-neutral-medium dark:border-gray-700">
                        <th className="px-4 py-2.5 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.18em] w-[40%]">Client Entity</th>
                        <th className="px-4 py-2.5 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.18em] w-[15%]">Status</th>
                        <th className="px-4 py-2.5 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.18em] w-[20%]">Active Services</th>
                        <th className="px-4 py-2.5 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.18em] w-[20%]">Assigned To</th>
                        <th className="px-4 py-2.5 w-[5%]"></th>
                    </tr>
                </thead>
                <tbody>
                    {sections.map(section => {
                        const isExpanded = expandedGroups.has(section.title);
                        const stats = getGroupStats(section.clients);

                        return (
                            <React.Fragment key={section.title}>
                                <tr
                                    onClick={() => toggleGroup(section.title)}
                                    className="bg-neutral-light/40 dark:bg-gray-900/50 cursor-pointer hover:bg-primary/[0.04] dark:hover:bg-primary/[0.08] transition-colors"
                                >
                                    <td colSpan={5} className="px-5 py-2.5 border-b border-neutral-medium/50 dark:border-gray-800">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <ChevronRight
                                                size={14}
                                                className={`text-secondary/60 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                            />
                                            {renderGroupTitle(section.title)}
                                            <span className="px-1.5 py-0.5 rounded-md bg-white dark:bg-gray-800 text-[9px] font-black text-primary border border-neutral-medium dark:border-gray-700">
                                                {section.clients.length} ITEMS
                                            </span>
                                            <div className="flex items-center gap-1 ml-auto">
                                                {stats.active > 0 && (
                                                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-[9px] font-black text-emerald-600 border border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                                                        {stats.active} ACTIVE
                                                    </span>
                                                )}
                                                {stats.inactive > 0 && (
                                                    <span className="px-1.5 py-0.5 rounded-md bg-neutral-50 text-[9px] font-black text-secondary border border-neutral-200 dark:bg-gray-700/50 dark:text-gray-400 dark:border-gray-700">
                                                        {stats.inactive} INACTIVE
                                                    </span>
                                                )}
                                                {activeTab === 'All' && stats.retainer > 0 && (
                                                    <span className="px-1.5 py-0.5 rounded-md bg-blue-50 text-[9px] font-black text-blue-600 border border-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20">
                                                        {stats.retainer} RETAINER
                                                    </span>
                                                )}
                                                {activeTab === 'All' && stats.special > 0 && (
                                                    <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-[9px] font-black text-amber-600 border border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
                                                        {stats.special} SPECIAL
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                                {isExpanded && section.clients.map(renderRow)}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

const ClientSummaryStrip: React.FC<{
    summary: { total: number; active: number; inactive: number; retainer: number; special: number; both: number };
}> = ({ summary }) => {
    const items = [
        { label: 'Total', value: summary.total, tone: 'text-primary bg-primary/10 border-primary/15' },
        { label: 'Active', value: summary.active, tone: 'text-emerald-600 bg-emerald-50 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' },
        { label: 'Inactive', value: summary.inactive, tone: 'text-secondary bg-neutral-light border-neutral-medium dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700' },
        { label: 'Retainers', value: summary.retainer, tone: 'text-blue-600 bg-blue-50 border-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20' },
        { label: 'Special Projects', value: summary.special, tone: 'text-amber-600 bg-amber-50 border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20' },
        { label: 'Both', value: summary.both, tone: 'text-violet-600 bg-violet-50 border-violet-100 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20' }
    ];

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
            {items.map(item => (
                <div key={item.label} className={`rounded-xl border px-3 py-2 ${item.tone}`}>
                    <div className="text-[11px] font-bold opacity-70">{item.label}</div>
                    <div className="text-xl font-black leading-tight">{item.value}</div>
                </div>
            ))}
        </div>
    );
};

const ClientDrawerSection: React.FC<{
    id: string;
    title: string;
    count?: number;
    defaultOpen?: boolean;
    action?: React.ReactNode;
    children: React.ReactNode;
}> = ({ id, title, count, action, children }) => {
    return (
        <section id={id} className="scroll-mt-24">
            <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="w-1 h-4 bg-primary rounded-full" />
                        <h3 className="text-sm font-black text-neutral-dark dark:text-white truncate">{title}</h3>
                        {typeof count === 'number' && (
                            <span className="px-1.5 py-0.5 rounded-md bg-primary/10 text-[9px] font-black text-primary border border-primary/10">
                                {count}
                            </span>
                        )}
                    </div>
                    {action}
                </div>
                <div>
                    {children}
                </div>
            </div>
        </section>
    );
};

const Clients: React.FC = () => {
    const context = useContext(AppContext);
    const user = context?.user || null;
    const allUsers = context?.allUsers || [];
    const retainers = context?.retainers || [];
    const specials = context?.specials || [];
    const deadlines = context?.deadlines || [];
    const contextClients = context?.clients || [];
    const [searchQuery, setSearchQuery] = useState('');

    const isManagerOrAbove = user?.role === UserRole.MANAGER || user?.role === UserRole.SUPERVISOR || user?.role === UserRole.ADMIN;
    const activeTab: 'All' = 'All';
    const [clientFilters, setClientFilters] = useState({
        status: 'All',
        engagement: 'All',
        retainerService: 'All',
        specialService: 'All',
        staff: 'All'
    });
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [selectedClient, setSelectedClient] = useState<any | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [showAssignmentForm, setShowAssignmentForm] = useState(false);
    const [groupBy, setGroupBy] = useState<'None' | 'Team' | 'Staff' | 'Service' | 'RetainerService' | 'SpecialService'>('None');
    const [isAddingClient, setIsAddingClient] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    const location = useLocation();

    const handleEngagementFilterChange = (engagement: string) => {
        setClientFilters(prev => ({
            ...prev,
            engagement,
            retainerService: engagement === 'Retainer' ? prev.retainerService : 'All',
            specialService: engagement === 'Special Project' ? prev.specialService : 'All'
        }));
    };

    const [formData, setFormData] = useState({
        name: '',
        tin: '',
        entityType: 'Corporation',
        email: '',
        contactPerson: '',
        status: 'Active',
        fiscalYearEnd: '12/31'
    });

    const [editFormData, setEditFormData] = useState({
        name: '',
        tin: '',
        entityType: '',
        email: '',
        contactPerson: '',
        status: '',
        fiscalYearEnd: '12/31'
    });

    const monthsList = [
        { value: '01', label: 'January' },
        { value: '02', label: 'February' },
        { value: '03', label: 'March' },
        { value: '04', label: 'April' },
        { value: '05', label: 'May' },
        { value: '06', label: 'June' },
        { value: '07', label: 'July' },
        { value: '08', label: 'August' },
        { value: '09', label: 'September' },
        { value: '10', label: 'October' },
        { value: '11', label: 'November' },
        { value: '12', label: 'December' },
    ];

    // Permission Helpers
    const canModifyAssignment = user?.role === UserRole.ADMIN ||
        user?.role === UserRole.MANAGER ||
        user?.role === UserRole.SUPERVISOR ||
        user?.role === UserRole.SENIOR;

    const clientLookups = useMemo(() => {
        const userByKey = new Map<string, any>();
        allUsers.forEach(u => {
            userByKey.set(String(u.id), u);
            userByKey.set(u.username || '', u);
            userByKey.set(u.firstName, u);
            userByKey.set(`${u.firstName} ${u.lastName}`, u);
        });

        const retainersByClient = new Map<string, any[]>();
        retainers.forEach(r => {
            const key = normalizeId(r.clientId);
            if (!retainersByClient.has(key)) retainersByClient.set(key, []);
            retainersByClient.get(key)!.push(r);
        });

        const specialsByClient = new Map<string, any[]>();
        specials.forEach(s => {
            const key = normalizeId(s.clientId);
            if (!specialsByClient.has(key)) specialsByClient.set(key, []);
            specialsByClient.get(key)!.push(s);
        });

        return { userByKey, retainersByClient, specialsByClient };
    }, [allUsers, retainers, specials]);

    const availableStaff = useMemo(() => {
        if (!user) return [];

        // Filter active users based on role-based assignment rules
        return sortUsersByName(allUsers.filter(u => {
            if (u.status !== 'Active') return false;

            // 1. Staff and Seniors are always assignable
            if (u.role === UserRole.STAFF || u.role === UserRole.SENIOR) {
                // Seniors can only see their own team members
                if (user.role === UserRole.SENIOR) {
                    return u.team === user.team;
                }
                return true;
            }

            // 2. Managers and Supervisors can only be assigned by themselves or Admins
            if (u.role === UserRole.MANAGER || u.role === UserRole.SUPERVISOR) {
                if (user.role === UserRole.ADMIN) return true;
                return u.id === user.id;
            }

            // 3. Admins can assign themselves or be assigned by other Admins
            if (u.role === UserRole.ADMIN) {
                return user.role === UserRole.ADMIN;
            }

            return false;
        }));
    }, [allUsers, user]);

    const canViewService = (assignedStaffStr: string) => {
        if (!user) return false;
        if (user.role === UserRole.ADMIN || user.role === UserRole.MANAGER || user.role === UserRole.SUPERVISOR) return true;
        if (!assignedStaffStr) return false;

        const staffNames = assignedStaffStr.split(',').map(s => s.trim());
        
        return staffNames.some(staffName => {
            const staffUser = clientLookups.userByKey.get(staffName);
            if (!staffUser) return false;

            if (user.role === UserRole.SENIOR) {
                return staffUser.team === user.team;
            }

            return staffUser.id === user.id;
        });
    };

    const [assignments, setAssignments] = useState([
        {
            id: Math.random().toString(36).substr(2, 9),
            serviceId: '',
            assignedStaffId: '',
            startDate: new Date().toISOString().split('T')[0],
            dueDateCode: '',
            selectedTaxes: [] as { taxID: string, dueDateCode: string, isManual?: boolean }[]
        }
    ]);
    const [editingRetainerId, setEditingRetainerId] = useState<string | null>(null);
    const [editingSpecialId, setEditingSpecialId] = useState<string | null>(null);
    const [itemToDelete, setItemToDelete] = useState<{ data: any, type: 'Retainer' | 'Special' | 'Credential' } | null>(null);
    const [showSpecialForm, setShowSpecialForm] = useState(false);
    const [specialAssignments, setSpecialAssignments] = useState([
        {
            id: Math.random().toString(36).substr(2, 9),
            projectTitle: '',
            serviceId: '',
            assignedStaffId: '',
            startDate: new Date().toISOString().split('T')[0],
            endDate: '',
            status: 'Planning',
            description: ''
        }
    ]);

    const [showCredentialForm, setShowCredentialForm] = useState(false);
    const [editingCredentialId, setEditingCredentialId] = useState<string | null>(null);
    const [credentialFormData, setCredentialFormData] = useState({
        systemName: '',
        username: '',
        password: '',
        securityAnswer: '',
        remarks: ''
    });

    useEffect(() => {
        if (!isDetailModalOpen) {
            resetAssignmentForm();
            resetSpecialForm();
            setIsEditing(false);
        }
    }, [isDetailModalOpen]);

    const handleEditRetainer = (r: any) => {
        const normalizeId = (id: any) => String(id || '').trim().replace(/^0+/, '') || '0';

        // Find the staff ID based on the name stored in the retainer
        const staffUser = allUsers.find(u =>
            normalizeId(u.id) === normalizeId(r.assignedStaff) ||
            `${u.firstName} ${u.lastName}` === r.assignedStaff ||
            u.firstName === r.assignedStaff
        );

        // Find associated deadlines for this retainer
        const associatedDeadlines = (context?.deadlines || []).filter((d: any) => {
            return normalizeId(d.retainerID) === normalizeId(r.id) && normalizeId(d.retainerID) !== '0';
        });

        // Check if service is Tax Compliances (ID: 0001)
        const serviceId = normalizeId(r.serviceType);
        const isTaxService = serviceId === '1' || serviceId === '0001';

        setEditingRetainerId(r.id);

        // Safely parse start date
        let formattedDate = new Date().toISOString().split('T')[0];
        if (r.startDate) {
            const d = new Date(r.startDate);
            if (!isNaN(d.getTime())) {
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                formattedDate = `${year}-${month}-${day}`;
            }
        }

        const defaultDueDate = !isTaxService ? (associatedDeadlines[0]?.dueDate || 'M+10D') : '';

        setAssignments([{
            id: r.id,
            serviceId: r.serviceType,
            assignedStaffId: staffUser?.id || r.assignedStaff,
            startDate: formattedDate,
            dueDateCode: defaultDueDate,
            selectedTaxes: isTaxService ? associatedDeadlines.map((d: any) => ({
                taxID: d.taxID,
                dueDateCode: d.dueDate || '',
                isManual: d.isManual === 'TRUE' || d.isManual === true
            })) : []
        }]);
        setShowAssignmentForm(false);
    };

    const handleDeleteRetainer = (r: any) => {
        setItemToDelete({ data: r, type: 'Retainer' });
    };

    const handleDeleteSpecial = (project: any) => {
        setItemToDelete({ data: project, type: 'Special' });
    };

    const handleConfirmDelete = async () => {
        if (!itemToDelete) return;

        setIsSubmitting(true);
        try {
            if (itemToDelete.type === 'Retainer') {
                await deleteRetainer(itemToDelete.data.id);
                context?.showToast('Service deleted successfully!', 'success');
              } else if (itemToDelete.type === 'Special') {
                await deleteSpecial(itemToDelete.data.id);
                context?.showToast('Special engagement deleted successfully!', 'success');
            } else if (itemToDelete.type === 'Credential') {
                await deleteCredential(itemToDelete.data.id);
                context?.showToast('Credential deleted successfully!', 'success');
            }
            setItemToDelete(null);
            if (context?.refreshData) await context.refreshData();
        } catch (error: any) {
            context?.showToast(`Failed to delete ${itemToDelete.type.toLowerCase()}: ` + error.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const addAssignmentBox = () => {
        setAssignments([...assignments, {
            id: Math.random().toString(36).substr(2, 9),
            serviceId: '',
            assignedStaffId: '',
            startDate: new Date().toISOString().split('T')[0],
            dueDateCode: '',
            selectedTaxes: [] as { taxID: string, dueDateCode: string }[]
        }]);
    };

    const removeAssignmentBox = (id: string) => {
        if (assignments.length > 1) {
            setAssignments(assignments.filter(a => a.id !== id));
        }
    };

    const updateAssignment = (id: string, updates: any) => {
        setAssignments(assignments.map(a => a.id === id ? { ...a, ...updates } : a));
    };

    const resetAssignmentForm = () => {
        setEditingRetainerId(null);
        setShowAssignmentForm(false);
        setAssignments([{
            id: Math.random().toString(36).substr(2, 9),
            serviceId: '',
            assignedStaffId: '',
            startDate: new Date().toISOString().split('T')[0],
            dueDateCode: '',
            selectedTaxes: [] as { taxID: string, dueDateCode: string, isManual?: boolean }[]
        }]);
    };

    const resetCredentialForm = () => {
        setShowCredentialForm(false);
        setEditingCredentialId(null);
        setCredentialFormData({ systemName: '', username: '', password: '', securityAnswer: '', remarks: '' });
    };

    const resetSpecialForm = () => {
        setEditingSpecialId(null);
        setShowSpecialForm(false);
        setSpecialAssignments([{
            id: Math.random().toString(36).substr(2, 9),
            projectTitle: '',
            serviceId: '',
            assignedStaffId: '',
            startDate: new Date().toISOString().split('T')[0],
            endDate: '',
            status: 'Planning',
            description: ''
        }]);
    };

    const clients = useMemo(() => {
        if (!user) return [];

        // Use a Map to prevent duplicate clients based on ID AND Name
        const uniqueClientsMap = new Map();
        contextClients.forEach(c => {
            const targetId = normalizeId(c.id);
            const clientName = (c.name || '').trim().toLowerCase();

            // If we already have this ID or this specific name, skip it
            if (!uniqueClientsMap.has(targetId) && !Array.from(uniqueClientsMap.values()).some((existing: any) => (existing.name || '').trim().toLowerCase() === clientName)) {
                uniqueClientsMap.set(targetId, c);
            }
        });

        const clientList = Array.from(uniqueClientsMap.values()).map(c => {
            const targetId = normalizeId(c.id);

            // Helper to check if a service is visible to the current user
            const isVisible = (assignedStaffStr: string | undefined) => {
                if (!user) return false;
                if (user.role === UserRole.ADMIN || user.role === UserRole.MANAGER || user.role === UserRole.SUPERVISOR) return true;
                if (!assignedStaffStr) return false;
                const staffUser = clientLookups.userByKey.get(assignedStaffStr);
                if (!staffUser) return false;
                if (user.role === UserRole.SENIOR) return staffUser.team === user.team;
                return staffUser.id === user.id;
            };

            const clientRetainers = (clientLookups.retainersByClient.get(targetId) || []).filter(r => isVisible(r.assignedStaff));
            const clientSpecials = (clientLookups.specialsByClient.get(targetId) || []).filter(s => isVisible(s.assignedStaff));

            const types = new Set<string>();
            if (clientRetainers.length > 0) types.add('Retainer');
            if (clientSpecials.length > 0) types.add('Special');

            const allStaff = new Set<string>();
            const retainerStaff = new Set<string>();
            const specialStaff = new Set<string>();

            const parseStaff = (assignedStaffStr: string | undefined, targetSet: Set<string>) => {
                if (!assignedStaffStr) return;
                assignedStaffStr.split(',').forEach(s => {
                    const trimmed = s.trim();
                    // Double check visibility for each staff in the list
                    if (isVisible(trimmed)) {
                        targetSet.add(trimmed);
                        allStaff.add(trimmed);
                    }
                });
            };

            clientRetainers.forEach(r => parseStaff(r.assignedStaff, retainerStaff));
            clientSpecials.forEach(s => parseStaff(s.assignedStaff, specialStaff));

            return {
                ...c,
                types,
                retainerServices: new Set<string>(clientRetainers.map(r => r.serviceName || r.serviceType || '').filter(Boolean)),
                specialServices: new Set<string>(clientSpecials.map(s => s.serviceName || s.serviceType || '').filter(Boolean)),
                retainerStaff,
                specialStaff,
                staff: allStaff,
                specialProjects: clientSpecials,
                retainerStatus: clientRetainers[0]?.engagementStatus || '',
                specialStatus: clientSpecials[0]?.status || '',
                isActive: c.status?.toLowerCase().includes('active') && !c.status?.toLowerCase().includes('inactive')
            };
        });

        return clientList.filter(c => canViewClient(user, c.staff, allUsers));
    }, [contextClients, user, allUsers, clientLookups]);

    const clientsById = useMemo(() => {
        const lookup = new Map<string, any>();
        clients.forEach(c => lookup.set(normalizeId(c.id), c));
        return lookup;
    }, [clients]);

    const clientFilterOptions = useMemo(() => {
        const retainerServices = new Set<string>();
        const specialServices = new Set<string>();
        const staff = new Set<string>();
        const activeStaffKeys = new Set<string>();

        allUsers.filter(u => u.status === 'Active').forEach(u => {
            activeStaffKeys.add(u.id);
            activeStaffKeys.add(u.username);
            activeStaffKeys.add(u.firstName);
            activeStaffKeys.add(`${u.firstName} ${u.lastName}`);
        });

        clients.forEach(c => {
            Array.from<string>(c.retainerServices || []).forEach(s => retainerServices.add(s));
            Array.from<string>(c.specialServices || []).forEach(s => specialServices.add(s));
            Array.from<string>(c.staff || []).forEach(s => {
                if (activeStaffKeys.has(s)) staff.add(s);
            });
        });

        return {
            retainerServices: Array.from(retainerServices).sort(),
            specialServices: Array.from(specialServices).sort(),
            staff: Array.from(staff).sort()
        };
    }, [clients, allUsers]);

    const clientSummary = useMemo(() => {
        return clients.reduce((acc, c) => {
            acc.total += 1;
            if (c.isActive) acc.active += 1;
            else acc.inactive += 1;
            if (c.types.has('Retainer')) acc.retainer += 1;
            if (c.types.has('Special')) acc.special += 1;
            if (c.types.has('Retainer') && c.types.has('Special')) acc.both += 1;
            return acc;
        }, { total: 0, active: 0, inactive: 0, retainer: 0, special: 0, both: 0 });
    }, [clients]);

    // Auto-open client detail modal if open=clientId is in URL query parameters
    useEffect(() => {
        const searchString = location.search || (window.location.hash.includes('?') ? '?' + window.location.hash.split('?')[1] : '');
        const params = new URLSearchParams(searchString);
        const openClientId = params.get('open');
        const openTab = params.get('tab');
        if (openClientId && clients.length > 0) {
            const targetClient = clientsById.get(normalizeId(openClientId));
            if (targetClient) {
                setSelectedClient(targetClient);
                setIsDetailModalOpen(true);
                
                if (openTab && ['Retainer', 'Special'].includes(openTab)) {
                    setClientFilters(prev => ({
                        ...prev,
                        engagement: openTab === 'Special' ? 'Special Project' : openTab
                    }));
                }
                
                // Clear search parameter from URL to prevent sticky modal on refresh
                const newParams = new URLSearchParams(searchString);
                newParams.delete('open');
                newParams.delete('tab');
                const cleanSearch = newParams.toString();
                const hashPath = window.location.hash.split('?')[0];
                window.history.replaceState(
                    {},
                    document.title,
                    window.location.pathname + hashPath + (cleanSearch ? '?' + cleanSearch : '')
                );
            }
        }
    }, [location.search, clients, clientsById]);

    const displayedClients = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return clients.filter(c => {
            if (clientFilters.status === 'Active' && !c.isActive) return false;
            if (clientFilters.status === 'Inactive' && c.isActive) return false;

            if (clientFilters.engagement === 'Retainer' && !c.types.has('Retainer')) return false;
            if (clientFilters.engagement === 'Special Project' && !c.types.has('Special')) return false;
            if (clientFilters.engagement === 'Both' && !(c.types.has('Retainer') && c.types.has('Special'))) return false;
            if (clientFilters.engagement === 'No Engagement' && c.types.size > 0) return false;

            if (clientFilters.retainerService !== 'All' && !c.retainerServices.has(clientFilters.retainerService)) return false;
            if (clientFilters.specialService !== 'All' && !c.specialServices.has(clientFilters.specialService)) return false;
            if (clientFilters.staff !== 'All' && !c.staff.has(clientFilters.staff)) return false;

            if (!query) return true;
            return (c.name || '').toLowerCase().includes(query) ||
                (c.tin || '').toLowerCase().includes(query) ||
                Array.from<string>(c.types).some(t => t.toLowerCase().includes(query)) ||
                Array.from<string>(c.staff).some(s => s.toLowerCase().includes(query)) ||
                Array.from<string>(c.retainerServices).some(s => s.toLowerCase().includes(query)) ||
                Array.from<string>(c.specialServices).some(s => s.toLowerCase().includes(query)) ||
                (c.specialProjects || []).some((p: any) => String(p.projectTitle || '').toLowerCase().includes(query));
        }).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
    }, [clients, clientFilters, searchQuery]);

    const handleAddClient = async (e: React.FormEvent) => {
        e.preventDefault();

        // TIN Validation: If not empty, must be exactly 12 digits
        const tinDigits = formData.tin.replace(/\D/g, '');
        if (tinDigits.length > 0 && tinDigits.length < 12) {
            context?.showToast('Invalid TIN: Please enter exactly 12 digits.', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            await addClient(formData);
            
            // Notify Admins
            const admins = context?.allUsers.filter(u => u.role === 'Admin') || [];
            for (const admin of admins) {
                await addNotification({
                    userId: admin.id,
                    title: 'New Client Onboarded',
                    message: `Client ${formData.name} has been successfully onboarded and is Active.`,
                    type: 'Client',
                    link: '/clients'
                }).catch(() => {});
            }

            context?.showToast('Client successfully added to the directory!', 'success');
            setIsAddModalOpen(false);
            setFormData({
                name: '',
                tin: '',
                entityType: 'Corporation',
                email: '',
                contactPerson: '',
                status: 'Active',
                fiscalYearEnd: ''
            });
            if (context?.refreshData) {
                await context.refreshData();
            }
        } catch (error: any) {
            context?.showToast('Failed to add client: ' + error.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAddRetainer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedClient || assignments.some(a => !a.serviceId || !a.assignedStaffId)) {
            context?.showToast('Please fill in all assignment details.', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            if (editingRetainerId) {
                // Single service update
                const assignment = assignments[0];
                const oldRetainer = retainers.find(r => r.id === editingRetainerId);
                const oldStaffName = oldRetainer?.assignedStaff;
                const oldStaffUser = allUsers.find(u => u.firstName === oldStaffName || `${u.firstName} ${u.lastName}` === oldStaffName);
                
                await updateRetainer(editingRetainerId, {
                    clientId: selectedClient.id,
                    serviceId: assignment.serviceId,
                    assignedStaffId: assignment.assignedStaffId,
                    startDate: assignment.startDate,
                    dueDateCode: assignment.dueDateCode,
                    selectedTaxes: assignment.selectedTaxes
                });
                
                // Notify the new staff if assignment changed
                if (oldStaffUser?.id !== assignment.assignedStaffId && assignment.assignedStaffId && assignment.assignedStaffId !== user?.id) {
                    await addNotification({
                        userId: assignment.assignedStaffId,
                        title: 'Retainer Assignment Updated',
                        message: `You have been newly assigned to ${selectedClient.name} for a retainer engagement.`,
                        type: 'Engagement',
                        link: `/clients?open=${selectedClient.id}&tab=Retainer`
                    }).catch(() => {});
                }
                
                context?.showToast('Service updated successfully!', 'success');
            } else {
                // New assignment (multiple boxes supported)
                await addRetainer({
                    clientId: selectedClient.id,
                    assignments: assignments
                });
                
                // Notify assigned staff (only if it's not the current user)
                for (const assignment of assignments) {
                    if (assignment.assignedStaffId && assignment.assignedStaffId !== user?.id) {
                        await addNotification({
                            userId: assignment.assignedStaffId,
                            title: 'New Retainer Assignment',
                            message: `You have been assigned to ${selectedClient.name} for a retainer engagement.`,
                            type: 'Engagement',
                            link: `/clients?open=${selectedClient.id}&tab=Retainer`
                        }).catch(() => {});
                    }
                }
                
                context?.showToast('All services assigned successfully!', 'success');
            }

            setAssignments([{
                id: Math.random().toString(36).substr(2, 9),
                serviceId: '',
                assignedStaffId: '',
                startDate: new Date().toISOString().split('T')[0],
                dueDateCode: '',
                selectedTaxes: []
            }]);
            setEditingRetainerId(null);
            setShowAssignmentForm(false);
            if (context?.refreshData) await context.refreshData();
        } catch (error: any) {
            context?.showToast(`Failed to ${editingRetainerId ? 'update' : 'assign'} service: ` + error.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdateClient = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedClient) return;

        setIsSubmitting(true);
        try {
            await updateClient(selectedClient.id, editFormData);
            context?.showToast('Client updated successfully!', 'success');
            setIsEditing(false);
            // Update selected client locally so UI reflects change immediately
            setSelectedClient({ ...selectedClient, ...editFormData });
            if (context?.refreshData) await context.refreshData();
        } catch (error: any) {
            context?.showToast('Failed to update client: ' + error.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAddSpecial = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedClient) return;

        setIsSubmitting(true);
        try {
            if (editingSpecialId) {
                // Update mode
                const task = specialAssignments[0];
                const oldSpecial = specials.find(s => s.id === editingSpecialId);
                const oldStaffName = oldSpecial?.assignedStaff;
                const oldStaffUser = allUsers.find(u => u.firstName === oldStaffName || `${u.firstName} ${u.lastName}` === oldStaffName);
                
                await updateSpecial(editingSpecialId, {
                    assignedStaffId: task.assignedStaffId,
                    serviceId: task.serviceId,
                    projectTitle: task.projectTitle,
                    startDate: task.startDate,
                    endDate: task.endDate,
                    status: task.status,
                    description: task.description
                });
                
                // Notify the new staff if assignment changed
                if (oldStaffUser?.id !== task.assignedStaffId && task.assignedStaffId && task.assignedStaffId !== user?.id) {
                    await addNotification({
                        userId: task.assignedStaffId,
                        title: 'Special Project Assignment Updated',
                        message: `You have been newly assigned to project "${task.projectTitle}" for ${selectedClient.name}.`,
                        type: 'Engagement',
                        link: `/clients?open=${selectedClient.id}&tab=Special`
                    }).catch(() => {});
                }
                
                context?.showToast('Special project updated successfully!', 'success');
            } else {
                // Create mode
                await addSpecial({
                    clientId: selectedClient.id,
                    assignments: specialAssignments
                });
                
                // Notify assigned staff (only if it's not the current user)
                for (const task of specialAssignments) {
                    if (task.assignedStaffId && task.assignedStaffId !== user?.id) {
                        await addNotification({
                            userId: task.assignedStaffId,
                            title: 'New Special Project',
                            message: `You have been assigned to project "${task.projectTitle}" for ${selectedClient.name}.`,
                            type: 'Engagement',
                            link: `/clients?open=${selectedClient.id}&tab=Special`
                        }).catch(() => {});
                    }
                }
                
                context?.showToast('Special projects assigned successfully!', 'success');
            }

            resetSpecialForm();
            if (context?.refreshData) await context.refreshData();
        } catch (err: any) {
            context?.showToast(err.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEditSpecial = (project: any) => {
        // Find staff and service IDs
        const staff = allUsers.find(u => `${u.firstName} ${u.lastName}` === project.assignedStaff || u.id === project.assignedStaff);
        const service = context?.services?.find(s => s.name === project.serviceName || s.id === project.serviceType);

        // Helper to ensure date is in YYYY-MM-DD format for HTML date inputs without UTC shift
        const formatDateForInput = (dateStr: string) => {
            if (!dateStr) return '';

            // If it's already YYYY-MM-DD, return as is
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

            // Handle MM/DD/YYYY or similar by attempting to extract parts
            try {
                // Try splitting by slash or dash
                const parts = dateStr.split(/[/-]/);
                if (parts.length === 3) {
                    // Check if first part is year (YYYY-MM-DD) or month (MM/DD/YYYY)
                    if (parts[0].length === 4) {
                        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                    } else if (parts[2].length === 4) {
                        return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
                    }
                }

                const date = new Date(dateStr);
                if (isNaN(date.getTime())) return dateStr;

                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            } catch (e) {
                return dateStr;
            }
        };

        const desc = project.description || project.Description || '';

        setSpecialAssignments([{
            id: project.id,
            projectTitle: project.projectTitle || '',
            serviceId: service?.id || project.serviceType || '',
            assignedStaffId: staff?.id || project.assignedStaff || '',
            startDate: formatDateForInput(project.startDate),
            endDate: formatDateForInput(project.endDate),
            status: project.status || 'Planning',
            description: desc
        }]);
        setShowSpecialForm(false);
        setEditingSpecialId(project.id);
    };

    const handleAddCredential = async (data: any) => {
        setIsSubmitting(true);
        try {
            await addCredential({
                clientID: normalizeId(selectedClient.id),
                ...data
            });
            
            context?.showToast('Credential added successfully!', 'success');
            setShowCredentialForm(false);
            setCredentialFormData({ systemName: '', username: '', password: '', securityAnswer: '', remarks: '' });
            if (context?.refreshData) await context.refreshData();
        } catch (error: any) {
            context?.showToast('Failed to add credential: ' + error.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdateCredential = async (data: any) => {
        if (!editingCredentialId) return;
        setIsSubmitting(true);
        try {
            await updateCredential(editingCredentialId, data);
            
            context?.showToast('Credential updated successfully!', 'success');
            setEditingCredentialId(null);
            if (context?.refreshData) await context.refreshData();
        } catch (error: any) {
            context?.showToast('Failed to update credential: ' + error.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteCredential = async (id: string) => {
        const cred = (context?.credentials || []).find(c => c.credentialID === id);
        setItemToDelete({ data: { id, name: cred?.systemName || 'this credential' }, type: 'Credential' });
    };

    const addSpecialBox = () => {
        setSpecialAssignments([...specialAssignments, {
            id: Math.random().toString(36).substr(2, 9),
            projectTitle: '',
            serviceId: '',
            assignedStaffId: '',
            startDate: new Date().toISOString().split('T')[0],
            endDate: '',
            status: 'Planning',
            description: ''
        }]);
    };

    const removeSpecialBox = (id: string) => {
        if (specialAssignments.length > 1) {
            setSpecialAssignments(specialAssignments.filter(a => a.id !== id));
        }
    };

    const updateSpecialAssignment = (id: string, updates: any) => {
        setSpecialAssignments(specialAssignments.map(a => a.id === id ? { ...a, ...updates } : a));
    };

    const formatTIN = (value: string) => {
        const digits = value.replace(/\D/g, '').slice(0, 12);
        const parts = [];
        if (digits.length > 0) parts.push(digits.slice(0, 3));
        if (digits.length > 3) parts.push(digits.slice(3, 6));
        if (digits.length > 6) parts.push(digits.slice(6, 9));
        if (digits.length > 9) parts.push(digits.slice(9, 12));
        return parts.join('-');
    };

    const getFormattedStaff = (client: typeof displayedClients[0]) => {
        const relevantStaff = client.staff;

        const staffList = Array.from(relevantStaff)
            .map(staffId => {
                const u = allUsers.find(u => u.id === staffId || u.username === staffId || u.firstName === staffId || `${u.firstName} ${u.lastName}` === staffId);
                return u ? u : { firstName: staffId, role: 'Unknown' };
            });

        const baseStaff = staffList.filter(u =>
            u.role !== UserRole.SENIOR &&
            u.role !== UserRole.MANAGER &&
            u.role !== UserRole.SUPERVISOR &&
            u.role !== UserRole.ADMIN
        );

        const displayList = baseStaff.length > 0 ? baseStaff : staffList;
        return displayList.map(u => u.firstName).join(', ') || 'N/A';
    };

    const renderContent = () => {
        if (displayedClients.length === 0) {
            return (
                <div className="p-16 text-center bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-neutral-medium dark:border-gray-700 animate-in fade-in zoom-in-95 slide-in-from-top-4 duration-700">
                    <div className="relative w-20 h-20 mx-auto mb-6">
                        <Building2 className="absolute inset-0 m-auto text-primary/10" size={64} />
                        <Search className="absolute bottom-0 right-0 text-primary/30" size={24} />
                    </div>
                    <h3 className="text-xl font-black text-neutral-dark dark:text-white tracking-tight">No clients found</h3>
                    <p className="text-sm text-secondary/60 font-medium">
                        {searchQuery ? 'No clients match your search query.' :
                            "You don't have any clients assigned yet."}
                    </p>
                </div>
            );
        }

        const handleViewDetails = (c: any) => {
            setSelectedClient(c);
            setEditFormData({
                name: c.name,
                tin: c.tin,
                entityType: c.entityType,
                email: c.email,
                contactPerson: c.contactPerson,
                status: c.status,
                fiscalYearEnd: c.fiscalYearEnd
            });
            setIsDetailModalOpen(true);
            setIsEditing(false);
            resetAssignmentForm();
        };



        const getAssignedUsers = (client: any) => {
            const relevantStaff = client.staff;
            return Array.from(relevantStaff).map(staffStr => {
                return allUsers.find(u => u.id === staffStr || u.username === staffStr || u.firstName === staffStr || `${u.firstName} ${u.lastName}` === staffStr);
            }).filter(Boolean);
        };

        // Grouping View
        if (groupBy !== 'None' && !searchQuery.trim()) {
            let sections: { title: string; clients: any[] }[] = [];

            if (groupBy === 'Staff') {
                const staffMap = new Map<string, any[]>();
                displayedClients.forEach(c => {
                    const users = getAssignedUsers(c);
                    if (users.length === 0) {
                        const list = staffMap.get('Unassigned') || [];
                        list.push(c);
                        staffMap.set('Unassigned', list);
                    } else {
                        users.forEach(u => {
                            const name = `${u.firstName} ${u.lastName}`;
                            const list = staffMap.get(name) || [];
                            list.push(c);
                            staffMap.set(name, list);
                        });
                    }
                });
                sections = Array.from(staffMap.entries())
                    .sort((a, b) => a[0] === 'Unassigned' ? 1 : b[0] === 'Unassigned' ? -1 : a[0].localeCompare(b[0]))
                    .map(([name, clients]) => ({ title: name, clients }));
            } else if (groupBy === 'Team') {
                const teamMap = new Map<string, any[]>();
                displayedClients.forEach(c => {
                    const users = getAssignedUsers(c);
                    const teams = new Set(users.map(u => u.team).filter(Boolean));
                    if (teams.size === 0) {
                        const list = teamMap.get('No Team') || [];
                        list.push(c);
                        teamMap.set('No Team', list);
                    } else {
                        teams.forEach(t => {
                            const list = teamMap.get(t as string) || [];
                            list.push(c);
                            teamMap.set(t as string, list);
                        });
                    }
                });
                sections = Array.from(teamMap.entries())
                    .sort((a, b) => a[0] === 'No Team' ? 1 : b[0] === 'No Team' ? -1 : a[0].localeCompare(b[0]))
                    .map(([team, clients]) => ({ title: `Team: ${team}`, clients }));
            } else if (groupBy === 'Service' || groupBy === 'RetainerService' || groupBy === 'SpecialService') {
                const serviceMap = new Map<string, any[]>();
                displayedClients.forEach(c => {
                    const services = new Set([
                        ...(groupBy === 'Service' || groupBy === 'RetainerService' ? Array.from(c.retainerServices) : []),
                        ...(groupBy === 'Service' || groupBy === 'SpecialService' ? Array.from(c.specialServices) : [])
                    ]);
                    if (services.size === 0) {
                        const list = serviceMap.get('No Active Services') || [];
                        list.push(c);
                        serviceMap.set('No Active Services', list);
                    } else {
                        services.forEach(s => {
                            const list = serviceMap.get(s as string) || [];
                            list.push(c);
                            serviceMap.set(s as string, list);
                        });
                    }
                });
                sections = Array.from(serviceMap.entries())
                    .sort((a, b) => a[0] === 'No Active Services' ? 1 : b[0] === 'No Active Services' ? -1 : a[0].localeCompare(b[0]))
                    .map(([service, clients]) => ({ title: service as string, clients }));
            }

            return (
                <div className="p-0.5">
                    <ClientGroupedTable
                        sections={sections}
                        activeTab={activeTab}
                        groupBy={groupBy}
                        onViewDetails={handleViewDetails}
                    />
                </div>
            );
        }

        // Senior Default View
        if (user?.role === UserRole.SENIOR && !searchQuery.trim() && groupBy === 'None') {
            const teamMembers = allUsers.filter(u =>
                u.team === user.team &&
                u.role !== UserRole.SENIOR && u.role !== UserRole.MANAGER && u.role !== UserRole.SUPERVISOR && u.role !== UserRole.ADMIN
            );

            const myClients = displayedClients.filter(c => {
                const assignedUsers = getAssignedUsers(c);
                const isDirect = assignedUsers.some(u => u?.id === user.id);
                const isTeamAssigned = assignedUsers.some(u => teamMembers.some(tm => tm.id === u?.id));
                return isDirect && !isTeamAssigned;
            });

            const teamTables = teamMembers.map(member => {
                const memberClients = displayedClients.filter(c => {
                    const assignedUsers = getAssignedUsers(c);
                    return assignedUsers.some(u => u?.id === member.id);
                });
                return { member, memberClients };
            }).filter(t => t.memberClients.length > 0);

            return (
                <div className="space-y-2 p-1">
                    <ClientTable
                        clients={myClients}
                        title="My Clients"
                        activeTab={activeTab}
                        onViewDetails={handleViewDetails}
                        defaultExpanded={true}
                    />
                    {teamTables.sort((a, b) => a.member.firstName.localeCompare(b.member.firstName)).map(({ member, memberClients }) => (
                        <ClientTable
                            key={member.id}
                            clients={memberClients}
                            title={`${member.firstName}'s Clients`}
                            activeTab={activeTab}
                            onViewDetails={handleViewDetails}
                        />
                    ))}
                </div>
            );
        }

        return (
            <div className="p-0.5">
                <ClientTable
                    clients={displayedClients}
                    activeTab={activeTab}
                    onViewDetails={handleViewDetails}
                />
            </div>
        );
    };

    return (
        <div className="w-full mx-auto p-2 space-y-2 animate-in fade-in duration-700">
            {/* Premium Header Section */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 px-1">
                <div className="space-y-0.5">
                    <div className="flex items-center gap-2.5">
                        <div className="w-1.5 h-7 bg-primary rounded-full" />
                        <h1 className="text-3xl font-black text-neutral-dark dark:text-white tracking-tight">Client Directory</h1>
                    </div>
                    <p className="text-sm text-secondary dark:text-gray-300 font-medium pl-4 opacity-70 dark:opacity-100">Centralized management of clients and service assignments</p>
                </div>

                {isManagerOrAbove && (
                    <button
                        onClick={() => { setIsAddingClient(true); setIsAddModalOpen(true); }}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-primary-dark shadow-lg shadow-primary/20 transition-all active:scale-95 self-start lg:self-center"
                    >
                        <Plus size={16} />
                        Add Client
                    </button>
                )}
            </div>

            <div className="-mt-1">
                <ClientSummaryStrip summary={clientSummary} />
            </div>

            {/* Premium Integrated Toolbar */}
            <div className="bg-white dark:bg-gray-800 p-1 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm shadow-neutral-dark/5">
                <div className="flex flex-col gap-1">
                    {/* Integrated Search */}
                    <div className="relative group w-full">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary/40 dark:text-gray-400/60 group-focus-within:text-primary transition-colors" size={16} />
                        <input
                            type="text"
                            placeholder="Search client, TIN, staff, service, or project..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-1.5 bg-neutral-light/50 dark:bg-gray-900/50 border border-transparent focus:border-primary/20 rounded-xl text-[13px] font-medium text-neutral-dark dark:text-white outline-none focus:ring-4 focus:ring-primary/5 transition-all placeholder:text-secondary/30 dark:placeholder:text-gray-500"
                        />
                    </div>

                    {/* Integrated Actions & Filters */}
                    <div className="flex flex-wrap items-center gap-2 px-1">
                        <select
                            value={clientFilters.status}
                            onChange={(e) => setClientFilters(prev => ({ ...prev, status: e.target.value }))}
                            className="pl-3 pr-8 py-2 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/40 dark:border-gray-700/70 rounded-xl text-[11px] font-bold text-neutral-dark dark:text-white outline-none focus:ring-4 focus:ring-primary/5 transition-all appearance-none cursor-pointer"
                            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236b7280\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1rem' }}
                        >
                            <option value="All">All Status</option>
                            <option value="Active">Active</option>
                            <option value="Inactive">Inactive</option>
                        </select>

                        <select
                            value={clientFilters.engagement}
                            onChange={(e) => handleEngagementFilterChange(e.target.value)}
                            className="pl-3 pr-8 py-2 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/40 dark:border-gray-700/70 rounded-xl text-[11px] font-bold text-neutral-dark dark:text-white outline-none focus:ring-4 focus:ring-primary/5 transition-all appearance-none cursor-pointer"
                            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236b7280\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1rem' }}
                        >
                            <option value="All">All Engagements</option>
                            <option value="Retainer">Retainer</option>
                            <option value="Special Project">Special Project</option>
                            <option value="Both">Both</option>
                            <option value="No Engagement">No Engagement</option>
                        </select>

                        {clientFilters.engagement === 'Retainer' && (
                            <select
                                value={clientFilters.retainerService}
                                onChange={(e) => setClientFilters(prev => ({ ...prev, retainerService: e.target.value }))}
                                className="pl-3 pr-8 py-2 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/40 dark:border-gray-700/70 rounded-xl text-[11px] font-bold text-neutral-dark dark:text-white outline-none focus:ring-4 focus:ring-primary/5 transition-all appearance-none cursor-pointer max-w-[220px]"
                                style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236b7280\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1rem' }}
                            >
                                <option value="All">All Retainer Services</option>
                                {clientFilterOptions.retainerServices.map(service => <option key={service} value={service}>{service}</option>)}
                            </select>
                        )}

                        {clientFilters.engagement === 'Special Project' && (
                            <select
                                value={clientFilters.specialService}
                                onChange={(e) => setClientFilters(prev => ({ ...prev, specialService: e.target.value }))}
                                className="pl-3 pr-8 py-2 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/40 dark:border-gray-700/70 rounded-xl text-[11px] font-bold text-neutral-dark dark:text-white outline-none focus:ring-4 focus:ring-primary/5 transition-all appearance-none cursor-pointer max-w-[220px]"
                                style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236b7280\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1rem' }}
                            >
                                <option value="All">All Special Project Types</option>
                                {clientFilterOptions.specialServices.map(service => <option key={service} value={service}>{service}</option>)}
                            </select>
                        )}

                        <select
                            value={clientFilters.staff}
                            onChange={(e) => setClientFilters(prev => ({ ...prev, staff: e.target.value }))}
                            className="pl-3 pr-8 py-2 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/40 dark:border-gray-700/70 rounded-xl text-[11px] font-bold text-neutral-dark dark:text-white outline-none focus:ring-4 focus:ring-primary/5 transition-all appearance-none cursor-pointer max-w-[180px]"
                            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236b7280\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1rem' }}
                        >
                            <option value="All">All Staff</option>
                            {clientFilterOptions.staff.map(staff => <option key={staff} value={staff}>{staff}</option>)}
                        </select>

                        <div className="flex items-center gap-2 ml-auto">
                            <span className="text-[11px] font-bold text-secondary dark:text-gray-400 hidden sm:block">Group by</span>
                            <select
                                value={groupBy}
                                onChange={(e) => setGroupBy(e.target.value as any)}
                                className="pl-3 pr-8 py-2 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/40 dark:border-gray-700/70 rounded-xl text-[11px] font-bold text-neutral-dark dark:text-white outline-none focus:ring-4 focus:ring-primary/5 transition-all appearance-none cursor-pointer min-w-[150px]"
                                style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236b7280\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1rem' }}
                            >
                                <option value="None">No Grouping</option>
                                {user?.role !== UserRole.SENIOR && <option value="Team">By Team</option>}
                                <option value="Staff">By Staff</option>
                                <option value="Service">By Any Service</option>
                                <option value="RetainerService">By Retainer Service</option>
                                <option value="SpecialService">By Special Project Type</option>
                            </select>
                        </div>

                    </div>
                </div>
            </div>

            {/* Ultra-Compact Content Area with Transition Animation */}
            <div
                key={activeTab + groupBy}
                className="transition-all duration-500 min-h-[500px] animate-in fade-in zoom-in-95 duration-500 ease-out"
            >
                {renderContent()}
            </div>

            {/* Modern Add Client Modal */}
            {isAddModalOpen && createPortal(
                <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-neutral-dark/40 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-md rounded-3xl shadow-2xl border border-white dark:border-gray-700 w-full max-w-2xl max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-medium/70 dark:border-gray-700 bg-neutral-light/30 dark:bg-gray-900/30 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-primary/10 rounded-2xl flex items-center justify-center text-primary border border-primary/20">
                                    <Building2 size={19} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-neutral-dark dark:text-white tracking-tight leading-tight">Create Client Profile</h2>
                                    <p className="text-[10px] font-bold text-secondary dark:text-gray-400 mt-1">Add the basic identity and contact details for this client.</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsAddModalOpen(false)}
                                disabled={isSubmitting}
                                className="p-2 hover:bg-neutral-medium/50 dark:hover:bg-gray-700 rounded-xl transition-all text-secondary disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleAddClient} className="p-5 space-y-4 overflow-y-auto">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                                <div className="space-y-1.5 sm:col-span-2">
                                    <label className="text-[10px] font-black text-secondary dark:text-gray-400">Company Legal Name</label>
                                    <input
                                        required
                                        type="text"
                                        disabled={isSubmitting}
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full px-3.5 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all placeholder:text-secondary/30 dark:placeholder:text-gray-500 disabled:opacity-50"
                                        placeholder="Enter registered business name..."
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-secondary dark:text-gray-400">TIN</label>
                                    <input
                                        required
                                        type="text"
                                        disabled={isSubmitting}
                                        value={formData.tin}
                                        onChange={(e) => setFormData({ ...formData, tin: formatTIN(e.target.value) })}
                                        className="w-full px-3.5 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-xs font-mono font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all disabled:opacity-50"
                                        placeholder="000-000-000-000"
                                    />
                                    <p className="text-[9px] font-medium text-secondary/60 dark:text-gray-500">12 digits required.</p>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-secondary dark:text-gray-400">Entity Type</label>
                                    <select
                                        value={formData.entityType}
                                        disabled={isSubmitting}
                                        onChange={(e) => setFormData({ ...formData, entityType: e.target.value })}
                                        className="w-full px-3.5 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all disabled:opacity-50"
                                    >
                                        <option value="Corporation">Corporation</option>
                                        <option value="Partnership">Partnership</option>
                                        <option value="Individual">Individual</option>
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-secondary dark:text-gray-400">Official Email</label>
                                    <input
                                        required
                                        type="email"
                                        disabled={isSubmitting}
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className="w-full px-3.5 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all disabled:opacity-50"
                                        placeholder="admin@client.com"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-secondary dark:text-gray-400">Primary Contact</label>
                                    <input
                                        required
                                        type="text"
                                        disabled={isSubmitting}
                                        value={formData.contactPerson}
                                        onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                                        className="w-full px-3.5 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all disabled:opacity-50"
                                        placeholder="Full name..."
                                    />
                                </div>

                                <div className="space-y-1.5 sm:col-span-2">
                                    <label className="text-[10px] font-black text-secondary dark:text-gray-400">Fiscal Year End</label>
                                    <div className="grid grid-cols-[1fr_88px] gap-3">
                                        <select
                                            value={formData.fiscalYearEnd.split('/')[0] || '12'}
                                            disabled={isSubmitting}
                                            onChange={(e) => {
                                                const day = formData.fiscalYearEnd.split('/')[1] || '31';
                                                setFormData({ ...formData, fiscalYearEnd: `${e.target.value}/${day}` });
                                            }}
                                            className="w-full px-3.5 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all disabled:opacity-50"
                                        >
                                            {monthsList.map(m => (
                                                <option key={m.value} value={m.value}>{m.label}</option>
                                            ))}
                                        </select>

                                        <input
                                            type="number"
                                            min="1"
                                            max="31"
                                            placeholder="31"
                                            disabled={isSubmitting}
                                            value={formData.fiscalYearEnd.split('/')[1] || ''}
                                            onChange={(e) => {
                                                const month = formData.fiscalYearEnd.split('/')[0] || '12';
                                                let val = e.target.value.replace(/\D/g, '');
                                                if (val) {
                                                    let num = parseInt(val);
                                                    if (num > 31) num = 31;
                                                    val = num.toString().padStart(2, '0');
                                                }
                                                setFormData({ ...formData, fiscalYearEnd: `${month}/${val}` });
                                            }}
                                            className="w-full px-3.5 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all placeholder:text-secondary/30 disabled:opacity-50 text-center"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="sticky bottom-0 -mx-5 -mb-5 px-5 py-4 bg-white/95 dark:bg-gray-800/95 border-t border-neutral-medium/70 dark:border-gray-700">
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full py-3 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-dark shadow-xl shadow-primary/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                    Create Profile
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* Modern Side Drawer for Client Details */}
            {isDetailModalOpen && selectedClient && createPortal(
                <div className="fixed inset-0 z-[10000] overflow-hidden animate-in fade-in duration-300">
                    <div
                        className="absolute inset-0 bg-neutral-dark/40 backdrop-blur-sm transition-opacity"
                        onClick={() => {
                            setIsDetailModalOpen(false);
                            setIsEditing(false);
                            resetAssignmentForm();
                            resetCredentialForm();
                        }}
                    />

                    <div className="absolute inset-y-0 right-0 max-w-2xl w-full bg-white dark:bg-gray-900 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                        {/* Drawer Header */}
                        <div className="p-5 border-b border-neutral-medium dark:border-gray-800 bg-neutral-light/30 dark:bg-gray-800/30 space-y-4">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                        <span className="bg-rose-50 text-rose-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
                                            Client Profile
                                        </span>
                                        {(() => {
                                            const isActive = selectedClient.status?.toLowerCase().includes('active') && !selectedClient.status?.toLowerCase().includes('inactive');
                                            return (
                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${isActive
                                                        ? 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                                                        : 'bg-neutral-50 text-secondary border-neutral-200 dark:bg-gray-700/50 dark:text-gray-400 dark:border-gray-700'
                                                    }`}>
                                                    {selectedClient.status || 'Active'}
                                                </span>
                                            );
                                        })()}
                                    </div>
                                    <h2 className="text-xl font-black text-neutral-dark dark:text-white leading-tight">
                                        {selectedClient.name}
                                    </h2>
                                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold text-secondary dark:text-gray-400">
                                        <span>TIN {selectedClient.tin || 'Unregistered'}</span>
                                        <span className="hidden sm:inline text-secondary/30">|</span>
                                        <span>{selectedClient.entityType || 'Unclassified'}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {!isEditing && (
                                        <button
                                            onClick={() => setIsEditing(true)}
                                            className="p-2 hover:bg-neutral-medium/20 dark:hover:bg-gray-800 rounded-full transition-colors text-secondary"
                                            title="Edit Profile"
                                        >
                                            <Edit2 size={18} />
                                        </button>
                                    )}
                                    <button
                                        disabled={isSubmitting}
                                        onClick={() => {
                                            setIsDetailModalOpen(false);
                                            setIsEditing(false);
                                            resetAssignmentForm();
                                            resetCredentialForm();
                                        }}
                                        className="p-2 hover:bg-neutral-medium/20 dark:hover:bg-gray-800 rounded-full transition-colors text-secondary disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                                {[
                                    { id: 'client-overview', label: 'Overview' },
                                    { id: 'client-retainers', label: 'Retainers' },
                                    { id: 'client-specials', label: 'Special Projects' },
                                    { id: 'client-credentials', label: 'Credentials' }
                                ].map(item => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                                        className="shrink-0 px-3 py-1.5 rounded-xl bg-white/80 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 text-[10px] font-black text-secondary dark:text-gray-300 hover:text-primary hover:border-primary/20 transition-colors"
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Drawer Content */}
                        <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-gradient-to-br from-neutral-light/50 via-white to-primary/5 dark:from-gray-900 dark:via-gray-900 dark:to-primary/10 custom-scrollbar">
                            {/* Profile Information */}
                            <ClientDrawerSection id="client-overview" title="Account Details" defaultOpen>

                                {isEditing ? (
                                    <form id="editClientForm" onSubmit={handleUpdateClient} className="grid grid-cols-2 gap-3 animate-in fade-in duration-300 bg-white/85 dark:bg-gray-800/60 rounded-2xl border border-neutral-medium/60 dark:border-gray-700 shadow-sm shadow-neutral-dark/5 p-5">
                                        <div className="space-y-1.5 col-span-2">
                                            <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest ml-1 opacity-50 dark:opacity-100">Company Legal Name</label>
                                            <input
                                                required
                                                type="text"
                                                disabled={isSubmitting}
                                                value={editFormData.name}
                                                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                                                className="w-full px-4 py-2 bg-white/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 outline-none transition-all disabled:opacity-50"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest ml-1 opacity-50 dark:opacity-100">TIN</label>
                                            <input
                                                type="text"
                                                disabled={isSubmitting}
                                                value={editFormData.tin}
                                                onChange={(e) => setEditFormData({ ...editFormData, tin: formatTIN(e.target.value) })}
                                                className="w-full px-4 py-2 bg-white/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 outline-none transition-all disabled:opacity-50"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest ml-1 opacity-50 dark:opacity-100">Classification</label>
                                            <select
                                                value={editFormData.entityType}
                                                disabled={isSubmitting}
                                                onChange={(e) => setEditFormData({ ...editFormData, entityType: e.target.value })}
                                                className="w-full px-4 py-2 bg-white/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 outline-none transition-all disabled:opacity-50"
                                            >
                                                <option value="Corporation">Corporation</option>
                                                <option value="Partnership">Partnership</option>
                                                <option value="Individual">Individual</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest ml-1 opacity-50 dark:opacity-100">Official Email</label>
                                            <input
                                                type="email"
                                                disabled={isSubmitting}
                                                value={editFormData.email}
                                                onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                                                className="w-full px-4 py-2 bg-white/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 outline-none transition-all disabled:opacity-50"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest ml-1 opacity-50 dark:opacity-100">Primary Contact</label>
                                            <input
                                                type="text"
                                                disabled={isSubmitting}
                                                value={editFormData.contactPerson}
                                                onChange={(e) => setEditFormData({ ...editFormData, contactPerson: e.target.value })}
                                                className="w-full px-4 py-2 bg-white/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 outline-none transition-all disabled:opacity-50"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-secondary uppercase tracking-widest ml-1 opacity-50">Fiscal Year End</label>
                                            <div className="flex gap-2">
                                                <select
                                                    value={editFormData.fiscalYearEnd.split('/')[0] || '12'}
                                                    disabled={isSubmitting}
                                                    onChange={(e) => {
                                                        const day = editFormData.fiscalYearEnd.split('/')[1] || '31';
                                                        setEditFormData({ ...editFormData, fiscalYearEnd: `${e.target.value}/${day}` });
                                                    }}
                                                    className="flex-[2] px-2 py-2 bg-white/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 outline-none transition-all disabled:opacity-50"
                                                >
                                                    {monthsList.map(m => (
                                                        <option key={m.value} value={m.value}>{m.label}</option>
                                                    ))}
                                                </select>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="31"
                                                    disabled={isSubmitting}
                                                    value={editFormData.fiscalYearEnd.split('/')[1] || ''}
                                                    onChange={(e) => {
                                                        const month = editFormData.fiscalYearEnd.split('/')[0] || '12';
                                                        let val = e.target.value.replace(/\D/g, '');
                                                        if (val) {
                                                            let num = parseInt(val);
                                                            if (num > 31) num = 31;
                                                            val = num.toString().padStart(2, '0');
                                                        }
                                                        setEditFormData({ ...editFormData, fiscalYearEnd: `${month}/${val}` });
                                                    }}
                                                    className="flex-1 px-2 py-2 bg-white/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 outline-none transition-all text-center disabled:opacity-50"
                                                    placeholder="D"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-secondary uppercase tracking-widest ml-1 opacity-50">Status</label>
                                            <select
                                                value={editFormData.status}
                                                disabled={isSubmitting}
                                                onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                                                className="w-full px-4 py-2 bg-white/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 outline-none transition-all disabled:opacity-50"
                                            >
                                                <option value="Active">Active</option>
                                                <option value="Inactive">Inactive</option>
                                            </select>
                                        </div>
                                        <div className="col-span-2 flex gap-3 mt-2">
                                            <button
                                                type="button"
                                                disabled={isSubmitting}
                                                onClick={() => setIsEditing(false)}
                                                className="flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-secondary hover:bg-neutral-light dark:hover:bg-gray-700 transition-all border border-neutral-medium dark:border-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={isSubmitting}
                                                className="flex-1 py-2 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-dark shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                            >
                                                {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                                Save Changes
                                            </button>
                                        </div>
                                    </form>
                                ) : (
                                    <div className="bg-white/85 dark:bg-gray-800/70 backdrop-blur-md rounded-2xl border border-neutral-medium/60 dark:border-gray-700 shadow-sm p-5">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-secondary dark:text-gray-400">Entity Type</p>
                                            <p className="text-sm font-black text-neutral-dark dark:text-white">{selectedClient.entityType}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-secondary dark:text-gray-400">Fiscal Year End</p>
                                            <p className="text-sm font-black text-neutral-dark dark:text-white">{selectedClient.fiscalYearEnd || '---'}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-secondary dark:text-gray-400">Contact Person</p>
                                            <p className="text-sm font-black text-neutral-dark dark:text-white">{selectedClient.contactPerson || '---'}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-secondary dark:text-gray-400">Official Email</p>
                                            <p className="text-sm font-black text-primary truncate" title={selectedClient.email}>{selectedClient.email || '---'}</p>
                                        </div>
                                        </div>
                                    </div>
                                )}
                            </ClientDrawerSection>

                            {/* Active Retainer Engagements */}
                            {(activeTab === 'All' || activeTab === 'Retainer') && (
                                <ClientDrawerSection
                                    id="client-retainers"
                                    title="Retainer Services"
                                    count={retainers.filter(r => normalizeId(r.clientId) === normalizeId(selectedClient.id) && canViewService(r.assignedStaff)).length}
                                    defaultOpen
                                    action={canModifyAssignment && (
                                        <button
                                            onClick={() => {
                                                if (showAssignmentForm) {
                                                    resetAssignmentForm();
                                                } else {
                                                    if (editingRetainerId) resetAssignmentForm();
                                                    setShowAssignmentForm(true);
                                                }
                                            }}
                                            className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-all ${showAssignmentForm
                                                    ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400'
                                                    : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400'
                                                }`}
                                        >
                                            {showAssignmentForm ? <X size={12} /> : <Plus size={12} />}
                                            {showAssignmentForm ? 'Cancel' : 'Add Service'}
                                        </button>
                                    )}
                                >

                                {showAssignmentForm && !editingRetainerId && (
                                    <div className="space-y-4 animate-in zoom-in-95 duration-200">
                                        <div className="bg-white/85 dark:bg-gray-800/60 rounded-2xl border border-emerald-500/30 dark:border-emerald-500/20 shadow-sm shadow-neutral-dark/5 p-5 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                                                    <Layers size={12} className="text-emerald-500" />
                                                    {editingRetainerId ? 'Edit Service' : 'Service Config'}
                                                </h4>
                                            </div>

                                            <form onSubmit={handleAddRetainer} className="space-y-4">
                                                {assignments.map((assignment) => (
                                                    <ServiceAssignmentBox
                                                        key={assignment.id}
                                                        assignment={assignment}
                                                        updateAssignment={updateAssignment}
                                                        removeAssignmentBox={removeAssignmentBox}
                                                        canModifyAssignment={canModifyAssignment}
                                                        availableStaff={availableStaff}
                                                        context={context}
                                                        targetClientId={normalizeId(selectedClient.id)}
                                                        retainers={retainers}
                                                        editingRetainerId={editingRetainerId}
                                                        assignments={assignments}
                                                    />
                                                ))}

                                                <div className="flex flex-col gap-3 pt-4 mt-1 border-t border-neutral-medium/60 dark:border-gray-700">
                                                    {!editingRetainerId && (
                                                        <button
                                                            type="button"
                                                            onClick={addAssignmentBox}
                                                            className="flex items-center justify-center gap-2 text-xs font-bold text-primary hover:text-primary-dark transition-colors px-4 py-2 rounded-xl bg-primary/5 hover:bg-primary/10 border border-dashed border-primary/20"
                                                        >
                                                            <Plus size={16} />
                                                            Add More Assignment
                                                        </button>
                                                    )}

                                                    <button
                                                        type="submit"
                                                        disabled={isSubmitting || assignments.some(a => !a.serviceId || !a.assignedStaffId)}
                                                        className={`w-full py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all flex items-center justify-center gap-3 disabled:opacity-50 ${editingRetainerId
                                                                ? 'bg-primary text-white shadow-primary/20 hover:bg-primary/90'
                                                                : 'bg-emerald-600 text-white shadow-emerald-600/20 hover:bg-emerald-700'
                                                            }`}
                                                    >
                                                        {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                                                        {editingRetainerId ? 'Update Service' : 'Confirm Assignment'}
                                                    </button>
                                                </div>
                                            </form>
                                        </div>
                                    </div>
                                )}

                                {/* Existing Assigned Retainers List */}
                                <div className="space-y-2">
                                    {retainers.filter(r => {
                                        return normalizeId(r.clientId) === normalizeId(selectedClient.id) && canViewService(r.assignedStaff);
                                    }).map((r) => {
                                        const isEditingThis = editingRetainerId && normalizeId(editingRetainerId) === normalizeId(r.id);
                                        
                                        if (isEditingThis) {
                                            return (
                                                <div key={r.id} className="bg-white/85 dark:bg-gray-800/60 rounded-2xl border border-primary/30 dark:border-primary/20 shadow-sm shadow-neutral-dark/5 p-5 space-y-4 animate-in zoom-in-95 duration-200">
                                                    <div className="flex items-center justify-between">
                                                        <h4 className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-2">
                                                            <Edit2 size={12} />
                                                            Editing Service
                                                        </h4>
                                                    </div>

                                                    <form onSubmit={handleAddRetainer} className="space-y-4">
                                                        {assignments.map((assignment) => (
                                                            <ServiceAssignmentBox
                                                                key={assignment.id}
                                                                assignment={assignment}
                                                                updateAssignment={updateAssignment}
                                                                removeAssignmentBox={removeAssignmentBox}
                                                                canModifyAssignment={canModifyAssignment}
                                                                availableStaff={availableStaff}
                                                                context={context}
                                                                targetClientId={normalizeId(selectedClient.id)}
                                                                retainers={retainers}
                                                                editingRetainerId={editingRetainerId}
                                                                assignments={assignments}
                                                            />
                                                        ))}

                                                        <div className="flex gap-2 pt-4 border-t border-neutral-medium dark:border-gray-700">
                                                            <button
                                                                type="button"
                                                                onClick={() => resetAssignmentForm()}
                                                                className="flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-secondary dark:text-gray-400 hover:bg-neutral-light dark:hover:bg-gray-700 transition-all border border-neutral-medium dark:border-gray-700"
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                type="submit"
                                                                disabled={isSubmitting}
                                                                className="flex-[2] py-2 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-dark shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                                            >
                                                                {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                                                Update Service
                                                            </button>
                                                        </div>
                                                    </form>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div key={r.id} className="bg-white/85 dark:bg-gray-800/70 rounded-2xl border border-neutral-medium/60 dark:border-gray-700 shadow-sm px-4 py-3 group hover:border-primary/20 hover:shadow-md transition-all duration-300">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                                            <FileText size={14} />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <h4 className="text-[13px] font-black text-neutral-dark dark:text-white leading-tight truncate">{r.serviceName || r.serviceType || 'Untitled Service'}</h4>
                                                            <p className="text-[10px] font-bold text-secondary/70 dark:text-gray-400 truncate">
                                                                Assigned to {r.assignedStaff || 'Unassigned'} · {r.engagementStatus || r.status || 'Active'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                     <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-all shrink-0">
                                                         <button
                                                             onClick={() => handleEditRetainer(r)}
                                                             className="p-2 text-secondary hover:text-primary hover:bg-primary/10 rounded-xl transition-all"
                                                             title="Edit Service"
                                                         >
                                                             <Edit2 size={14} />
                                                         </button>
                                                         {canModifyAssignment && (
                                                             <button 
                                                                onClick={() => handleDeleteRetainer(r)} 
                                                                className="p-2 text-secondary hover:text-error hover:bg-error/10 rounded-xl transition-all"
                                                                title="Delete Service"
                                                             >
                                                                <Trash2 size={14} />
                                                             </button>
                                                         )}
                                                     </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {retainers.filter(r => {
                                        return normalizeId(r.clientId) === normalizeId(selectedClient.id) && canViewService(r.assignedStaff);
                                    }).length === 0 && !showAssignmentForm && (
                                            <div className="py-10 text-center border border-dashed border-neutral-medium dark:border-gray-700 rounded-[2rem] bg-white/40 dark:bg-gray-900/40">
                                                <FileText className="mx-auto mb-3 text-neutral-medium dark:text-gray-700 opacity-30" size={24} />
                                                <p className="text-[9px] text-secondary font-black uppercase tracking-widest opacity-30">No active services</p>
                                            </div>
                                        )}
                                </div>
                            </ClientDrawerSection>
                        )}

                            {/* Special Engagements Section */}
                            {(activeTab === 'All' || activeTab === 'Special') && (
                                <ClientDrawerSection
                                    id="client-specials"
                                    title="Special Engagements"
                                    count={specials.filter(s => normalizeId(s.clientId) === normalizeId(selectedClient.id) && canViewService(s.assignedStaff)).length}
                                    defaultOpen
                                    action={canModifyAssignment && (
                                        <button
                                            onClick={() => {
                                                if (showSpecialForm) {
                                                    resetSpecialForm();
                                                } else {
                                                    if (editingSpecialId) resetSpecialForm();
                                                    setShowSpecialForm(true);
                                                }
                                            }}
                                            className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-all ${showSpecialForm
                                                    ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400'
                                                    : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400'
                                                }`}
                                        >
                                            {showSpecialForm ? <X size={12} /> : <Plus size={12} />}
                                            {showSpecialForm ? 'Cancel' : 'Add Special'}
                                        </button>
                                    )}
                                >

                                {showSpecialForm && !editingSpecialId && (
                                    <div className="space-y-4 animate-in zoom-in-95 duration-200">
                                        <div className="bg-white/85 dark:bg-gray-800/60 rounded-2xl border border-emerald-500/30 dark:border-emerald-500/20 shadow-sm shadow-neutral-dark/5 p-5 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                                                    <Briefcase size={12} className="text-emerald-500" />
                                                    {editingSpecialId ? 'Edit Project' : 'Project Config'}
                                                </h4>
                                            </div>

                                            <form onSubmit={handleAddSpecial} className="space-y-4">
                                                {specialAssignments.map((task) => (
                                                    <SpecialEngagementBox
                                                        key={task.id}
                                                        task={task}
                                                        updateSpecialAssignment={updateSpecialAssignment}
                                                        removeSpecialBox={removeSpecialBox}
                                                        availableStaff={availableStaff}
                                                        context={context}
                                                        specialAssignments={specialAssignments}
                                                    />
                                                ))}

                                                <div className="flex flex-col gap-3 pt-4 mt-1 border-t border-neutral-medium/60 dark:border-gray-700">
                                                    {!editingSpecialId && (
                                                        <button
                                                            type="button"
                                                            onClick={addSpecialBox}
                                                            className="flex items-center justify-center gap-2 text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors px-4 py-2 rounded-xl bg-emerald-500/5 hover:bg-emerald-500/10 border border-dashed border-emerald-500/20"
                                                        >
                                                            <Plus size={16} />
                                                            Add More Project
                                                        </button>
                                                    )}

                                                    <button
                                                        type="submit"
                                                        disabled={isSubmitting || specialAssignments.some(a => !a.projectTitle || !a.assignedStaffId)}
                                                        className={`w-full py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all flex items-center justify-center gap-3 disabled:opacity-50 ${editingSpecialId
                                                                ? 'bg-primary text-white shadow-primary/20 hover:bg-primary/90'
                                                                : 'bg-emerald-600 text-white shadow-emerald-600/20 hover:bg-emerald-700'
                                                            }`}
                                                    >
                                                        {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                                                        {editingSpecialId ? 'Update Project' : 'Confirm Special Assignment'}
                                                    </button>
                                                </div>
                                            </form>
                                        </div>
                                    </div>
                                )}
                                { /* Existing Specials List */ }
                                <div className="space-y-2">
                                    {specials.filter(s => {
                                        return normalizeId(s.clientId) === normalizeId(selectedClient.id) && canViewService(s.assignedStaff);
                                    }).map((s) => {
                                        const isEditingThis = editingSpecialId && normalizeId(editingSpecialId) === normalizeId(s.id);

                                        if (isEditingThis) {
                                            return (
                                                <div key={s.id} className="bg-white/85 dark:bg-gray-800/60 rounded-2xl border border-primary/30 dark:border-primary/20 shadow-sm shadow-neutral-dark/5 p-5 space-y-4 animate-in zoom-in-95 duration-200">
                                                    <div className="flex items-center justify-between">
                                                        <h4 className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-2">
                                                            <Edit2 size={12} />
                                                            Editing Project
                                                        </h4>
                                                    </div>

                                                    <form onSubmit={handleAddSpecial} className="space-y-4">
                                                        {specialAssignments.map((task) => (
                                                            <SpecialEngagementBox
                                                                key={task.id}
                                                                task={task}
                                                                updateSpecialAssignment={updateSpecialAssignment}
                                                                removeSpecialBox={removeSpecialBox}
                                                                availableStaff={availableStaff}
                                                                context={context}
                                                                specialAssignments={specialAssignments}
                                                            />
                                                        ))}

                                                        <div className="flex gap-2 pt-4 border-t border-neutral-medium dark:border-gray-700">
                                                            <button
                                                                type="button"
                                                                onClick={() => resetSpecialForm()}
                                                                className="flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-secondary hover:bg-neutral-light transition-all border border-neutral-medium"
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                type="submit"
                                                                disabled={isSubmitting}
                                                                className="flex-[2] py-2 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-dark shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                                            >
                                                                {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                                                Update Project
                                                            </button>
                                                        </div>
                                                    </form>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div key={s.id} className="bg-white/85 dark:bg-gray-800/70 rounded-2xl border border-neutral-medium/60 dark:border-gray-700 shadow-sm px-4 py-3 group hover:border-primary/20 hover:shadow-md transition-all duration-300">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 shrink-0">
                                                            <Briefcase size={14} />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <h4 className="text-[13px] font-black text-neutral-dark dark:text-white leading-tight truncate">{s.projectTitle || 'Untitled Project'}</h4>
                                                            <p className="text-[10px] font-bold text-secondary/70 dark:text-gray-400 truncate">
                                                                Assigned to {s.assignedStaff || 'Unassigned'} · {s.status || 'Planning'}{s.endDate ? ` · Due ${s.endDate}` : ''}
                                                            </p>
                                                        </div>
                                                    </div>
                                                     <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-all shrink-0">
                                                         <button 
                                                            onClick={() => handleEditSpecial(s)} 
                                                            className="p-2 text-secondary hover:text-primary hover:bg-primary/10 rounded-xl transition-all"
                                                            title="Edit Project"
                                                         >
                                                            <Edit2 size={14} />
                                                         </button>
                                                         {canModifyAssignment && (
                                                             <button 
                                                                onClick={() => handleDeleteSpecial(s)} 
                                                                className="p-2 text-secondary hover:text-error hover:bg-error/10 rounded-xl transition-all"
                                                                title="Delete Project"
                                                             >
                                                                <Trash2 size={14} />
                                                             </button>
                                                         )}
                                                     </div>
                                                </div>
                                                {s.description && (
                                                    <p className="text-[10px] text-secondary font-medium leading-relaxed opacity-60 pl-11 mt-2 line-clamp-1">{s.description}</p>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {specials.filter(s => {
                                        return normalizeId(s.clientId) === normalizeId(selectedClient.id) && canViewService(s.assignedStaff);
                                    }).length === 0 && (
                                            <div className="py-8 text-center border border-dashed border-neutral-medium dark:border-gray-700 rounded-[2rem] bg-white/40 dark:bg-gray-900/40">
                                                <p className="text-[9px] text-secondary font-black uppercase tracking-widest opacity-30">No special engagements recorded</p>
                                            </div>
                                        )}
                                </div>
                            </ClientDrawerSection>
                        )}

                            {/* Client Credentials Section */}
                            <ClientDrawerSection
                                id="client-credentials"
                                title="System Credentials"
                                count={(context?.credentials || []).filter(c => normalizeId(c.clientID) === normalizeId(selectedClient.id)).length}
                                defaultOpen={false}
                                action={
                                    <button
                                        onClick={() => {
                                            if (showCredentialForm) {
                                                setShowCredentialForm(false);
                                                setEditingCredentialId(null);
                                            } else {
                                                setCredentialFormData({ systemName: '', username: '', password: '', securityAnswer: '', remarks: '' });
                                                setShowCredentialForm(true);
                                            }
                                        }}
                                        className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-all ${showCredentialForm
                                                ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400'
                                                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400'
                                            }`}
                                    >
                                        {showCredentialForm ? <X size={12} /> : <Plus size={12} />}
                                        {showCredentialForm ? 'Cancel' : 'Add New'}
                                    </button>
                                }
                            >

                                {showCredentialForm && !editingCredentialId && (
                                    <CredentialBox 
                                        credential={credentialFormData}
                                        isEditing={true}
                                        onCancel={() => setShowCredentialForm(false)}
                                        onSave={handleAddCredential}
                                        isSubmitting={isSubmitting}
                                    />
                                )}

                                <div className="space-y-3">
                                    {(context?.credentials || []).filter(c => normalizeId(c.clientID) === normalizeId(selectedClient.id)).length > 0 && (
                                        <div className="bg-white/85 dark:bg-gray-800/70 rounded-2xl border border-neutral-medium/60 dark:border-gray-700 shadow-sm overflow-hidden">
                                            <div className="hidden sm:grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto] gap-4 px-4 py-2.5 bg-neutral-light/50 dark:bg-gray-900/40 border-b border-neutral-medium/50 dark:border-gray-700">
                                                <span className="text-[9px] font-black text-secondary dark:text-gray-400">System</span>
                                                <span className="text-[9px] font-black text-secondary dark:text-gray-400">Username</span>
                                                <span className="text-[9px] font-black text-secondary dark:text-gray-400">Password</span>
                                                <span className="text-[9px] font-black text-secondary dark:text-gray-400 text-right">Actions</span>
                                            </div>
                                            <div className="divide-y divide-neutral-medium/40 dark:divide-gray-700">
                                                {(context?.credentials || [])
                                                    .filter(c => normalizeId(c.clientID) === normalizeId(selectedClient.id))
                                                    .map((c) => (
                                                        editingCredentialId === c.credentialID ? (
                                                            <div key={c.credentialID} className="p-4">
                                                                <CredentialBox
                                                                    credential={c}
                                                                    isEditing
                                                                    onCancel={() => setEditingCredentialId(null)}
                                                                    onSave={handleUpdateCredential}
                                                                    isSubmitting={isSubmitting}
                                                                />
                                                            </div>
                                                        ) : (
                                                            <CredentialRow
                                                                key={c.credentialID}
                                                                credential={c}
                                                                onEdit={(cred) => {
                                                                    setEditingCredentialId(cred.credentialID);
                                                                    setCredentialFormData(cred);
                                                                }}
                                                                onDelete={handleDeleteCredential}
                                                            />
                                                        )
                                                    ))
                                                }
                                            </div>
                                        </div>
                                    )}
                                    {(context?.credentials || []).filter(c => normalizeId(c.clientID) === normalizeId(selectedClient.id)).length === 0 && !showCredentialForm && (
                                        <div className="py-8 text-center border border-dashed border-neutral-medium dark:border-gray-700 rounded-[2rem] bg-white/40 dark:bg-gray-900/40">
                                            <Shield className="mx-auto mb-2 text-neutral-medium dark:text-gray-700 opacity-20" size={20} />
                                            <p className="text-[9px] text-secondary font-black uppercase tracking-widest opacity-30">No credentials stored</p>
                                        </div>
                                    )}
                                </div>
                            </ClientDrawerSection>
                        </div>

                    </div>
                </div>,
                document.body
            )}
            {/* Delete Confirmation Modal */}
            {itemToDelete && createPortal(
                <div className="fixed inset-0 z-[10002] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-rose-100 dark:border-rose-900/30 w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-600 dark:text-rose-400">
                                <Trash2 size={32} />
                            </div>
                            <h3 className="text-lg font-bold text-neutral-dark dark:text-white mb-2">
                                {itemToDelete.type === 'Retainer' ? 'Delete Assigned Service?' : itemToDelete.type === 'Special' ? 'Delete Special Engagement?' : 'Delete System Credential?'}
                            </h3>
                            <p className="text-sm text-secondary dark:text-gray-400 mb-6">
                                Are you sure you want to remove <span className="font-bold text-neutral-dark dark:text-white">
                                    "{itemToDelete.type === 'Retainer'
                                        ? (itemToDelete.data.serviceName || itemToDelete.data.serviceType)
                                        : itemToDelete.type === 'Special' 
                                            ? (itemToDelete.data.projectTitle || 'this project')
                                            : (itemToDelete.data.name || 'this credential')}"
                                </span>?
                                {itemToDelete.type === 'Retainer' && (
                                    <>
                                        <br />This will also delete all associated deadlines.
                                    </>
                                )}
                                <br />This action cannot be undone.
                            </p>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setItemToDelete(null)}
                                    disabled={isSubmitting}
                                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-secondary hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirmDelete}
                                    disabled={isSubmitting}
                                    className="flex-1 px-4 py-2.5 bg-rose-600 text-white rounded-xl text-sm font-bold hover:bg-rose-700 shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            Deleting...
                                        </>
                                    ) : (
                                        'Yes, Delete'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default Clients;
