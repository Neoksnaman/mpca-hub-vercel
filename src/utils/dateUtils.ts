export const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const computeActualDueDate = (monthStr: string, yearStr: string, code: string, fiscalYearEnd: string) => {
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

    // 1. Establish the Base Date (End of the reporting period)
    if (type === 'M' || type === 'Q' || type === 'SM') {
        // End of the month specified (e.g., March 31)
        date = new Date(year, monthIndex + 1, 0);
    } else {
        // Annual/Yearly: based on fiscal year end
        const [fyM, fyD] = (fiscalYearEnd || '12/31').split('/').map(Number);
        date = new Date(year, fyM - 1, fyD);
    }

    // Timezone Safety: Set to Noon local time to avoid off-by-one day errors
    date.setHours(12, 0, 0, 0);

    // 2. Apply Offset
    if (unit === 'D') {
        // Add X days to the base date
        date.setDate(date.getDate() + val);
    } else if (unit === 'M') {
        // Add X months and roll to the LAST day of that target month
        const targetMonth = date.getMonth() + val;
        date = new Date(date.getFullYear(), targetMonth + 1, 0);
    }

    // 3. Weekend Roll-over: If Saturday or Sunday, move to next Monday
    const dayOfWeek = date.getDay(); // 0 is Sunday, 6 is Saturday
    if (dayOfWeek === 6) { // Saturday
        date.setDate(date.getDate() + 2);
    } else if (dayOfWeek === 0) { // Sunday
        date.setDate(date.getDate() + 1);
    }

    return {
        formatted: date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        raw: date
    };
};

export const parseDateStr = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    let date;
    if (dateStr.includes('/')) {
        const [m, d, y] = dateStr.split('/');
        date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    } else if (dateStr.includes('-')) {
        const [y, m, d] = dateStr.split('-');
        date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    } else {
        date = new Date(dateStr);
    }
    return isNaN(date.getTime()) ? null : date;
};
