import React, { forwardRef } from 'react';

const SingleSlip = ({ transmittal, client, staffMember, logoUrl, copyType, formattedDate, showSignatures = true, pinSignaturesBottom = false, showCutGuideBelowSignatures = false }: any) => {
    const items = transmittal.items.split('||');

    return (
        <div className={`flex flex-col text-black font-sans text-[11px] ${pinSignaturesBottom ? 'h-full' : ''}`} style={{ fontFamily: 'Arial, sans-serif' }}>
            {/* Header */}
            <div className="flex justify-between items-start mb-3">
                <div className="w-64 h-16 flex items-center">
                    {logoUrl ? (
                        <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
                    ) : (
                        <div className="text-xl font-bold text-red-700 uppercase tracking-tighter leading-none">
                            MP Camaso <br/><span className="text-xs text-gray-600">& Associates</span>
                        </div>
                    )}
                </div>
                <div className="text-right text-[9px] font-bold leading-tight italic pt-1">
                    <p>Unit 301, West Insula Building,</p>
                    <p>#135 West Avenue Brgy. Bungad, Quezon City</p>
                    <p>Tel No. (02) 8800-5415</p>
                </div>
            </div>

            {/* Subheader */}
            <div className="flex justify-between items-center mb-1 font-bold text-[11px] items-stretch">
                <div className="border-2 border-black px-6 py-1 flex flex-col justify-center leading-snug">
                    {copyType}
                </div>
                <div className="border-2 border-black px-6 py-1 flex flex-col justify-center leading-snug">
                    {transmittal.transmittalID}
                </div>
            </div>

            {/* Title */}
            <div className="border-2 border-black text-center py-1 mb-1 font-black text-xl tracking-wide uppercase flex flex-col justify-center leading-none min-h-[28px]">
                TRANSMITTAL SLIP
            </div>

            {/* TO Section */}
            <div className="border-2 border-black flex flex-col mb-1 font-bold">
                <div className="flex">
                    <div className="w-24 flex items-center justify-center border-r-2 border-black font-black uppercase text-xs">
                        TO
                    </div>
                    <div className="flex-1 flex flex-col">
                        <div className="flex border-b-2 border-black items-stretch">
                            <div className="w-24 px-2 py-1 border-r-2 border-black font-bold leading-snug flex flex-col justify-center">ATTENTION</div>
                            <div className="flex-1 px-2 py-1 font-normal leading-snug flex flex-col justify-center">{transmittal.receiverName || client.contactPerson || '---'}</div>
                        </div>
                        <div className="flex border-b-2 border-black items-stretch">
                            <div className="w-24 px-2 py-1 border-r-2 border-black font-bold leading-snug flex flex-col justify-center">COMPANY</div>
                            <div className="flex-1 px-2 py-1 font-normal leading-snug flex flex-col justify-center">{client.name}</div>
                        </div>
                        <div className="flex items-stretch">
                            <div className="w-24 px-2 py-1 border-r-2 border-black font-bold leading-snug flex flex-col justify-center">ADDRESS</div>
                            <div className="flex-1 px-2 py-1 font-normal leading-snug flex flex-col justify-center">{transmittal.receiverAddress || 'Registered Address'}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* FROM and DATE Section */}
            <div className="border-2 border-black flex font-bold mb-3 items-stretch">
                <div className="w-24 px-2 py-1 border-r-2 border-black uppercase text-center font-black leading-snug flex flex-col justify-center">FROM</div>
                <div className="flex-1 px-2 py-1 font-normal text-center leading-snug flex flex-col justify-center">MP CAMASO AND ASSOCIATES</div>
                <div className="w-20 px-2 py-1 border-l-2 border-r-2 border-black uppercase text-center font-black leading-snug flex flex-col justify-center">DATE</div>
                <div className="w-28 px-2 py-1 font-normal text-center leading-snug flex flex-col justify-center">{formattedDate}</div>
            </div>

            {/* CONTENTS */}
            <div className={`mb-8 ${pinSignaturesBottom ? 'flex-1' : ''}`}>
                <div className="font-bold italic mb-0.5">
                    Please acknowledge your receipt of the following:
                </div>
                <div className="border-2 border-black">
                    <div className="border-b-2 border-black text-center font-black py-0.5">
                        CONTENTS
                    </div>
                    {items.map((item: string, idx: number) => (
                        <div key={idx} className="flex border-b-2 border-black last:border-b-0 items-stretch">
                            <div className="flex-1 px-3 py-1 font-normal leading-snug flex flex-col justify-center">
                                {item}
                            </div>
                        </div>
                    ))}

                </div>
            </div>

            {showSignatures && (
                <>
                    <div className={`flex justify-between font-bold gap-8 ${pinSignaturesBottom ? 'mt-auto' : ''}`}>
                        <div className="flex-1 flex flex-col gap-2">
                            <div className="flex items-end">
                                <span className="w-[115px] shrink-0 uppercase mb-1">TRANSMITTED BY:</span>
                                <div className="flex-1 relative h-6">
                                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 font-normal whitespace-nowrap">
                                        {staffMember ? `${staffMember.firstName} ${staffMember.lastName}` : ''}
                                    </span>
                                    <div className="absolute bottom-0 left-0 w-full border-b border-black"></div>
                                </div>
                            </div>
                            <div className="flex items-end">
                                <span className="w-[115px] shrink-0 uppercase mb-1">DATE/TIME:</span>
                                <div className="flex-1 relative h-6">
                                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 font-normal whitespace-nowrap">
                                        {formattedDate}
                                    </span>
                                    <div className="absolute bottom-0 left-0 w-full border-b border-black"></div>
                                </div>
                            </div>
                        </div>
                        <div className="flex-1 flex flex-col gap-2">
                            <div className="flex items-end">
                                <span className="w-[115px] shrink-0 uppercase mb-1">RECEIVED BY:</span>
                                <div className="flex-1 relative h-6">
                                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 font-normal whitespace-nowrap"></span>
                                    <div className="absolute bottom-0 left-0 w-full border-b border-black"></div>
                                </div>
                            </div>
                            <div className="flex items-end">
                                <span className="w-[115px] shrink-0 uppercase mb-1">DATE/TIME:</span>
                                <div className="flex-1 relative h-6">
                                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 font-normal whitespace-nowrap"></span>
                                    <div className="absolute bottom-0 left-0 w-full border-b border-black"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    {showCutGuideBelowSignatures && (
                        <div className="-mx-12 border-b-[3px] border-dashed border-gray-400 mt-8 relative">
                            <span className="absolute left-12 -top-4 text-gray-400 text-[10px] bg-white pr-2">✂ cut here</span>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

const chunkItems = (items: string[], chunkSize = 20) => {
    const chunks: string[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
        chunks.push(items.slice(i, i + chunkSize));
    }
    return chunks;
};

const PagedSlip = ({ transmittal, client, staffMember, logoUrl, copyType, formattedDate, items, pageNumber, totalPages, pageBreakAfter }: any) => {
    const pageTransmittal = {
        ...transmittal,
        items: items.join('||')
    };

    return (
        <div className="w-[794px] h-[1123px] px-12 py-12 flex flex-col" style={{ pageBreakAfter }}>
            <div className="flex-1 flex flex-col min-h-0">
                <SingleSlip
                    transmittal={pageTransmittal}
                    client={client}
                    staffMember={staffMember}
                    logoUrl={logoUrl}
                    copyType={copyType}
                    formattedDate={formattedDate}
                    showSignatures={pageNumber === totalPages}
                    pinSignaturesBottom
                />
            </div>
            <div className="text-right text-[9px] font-bold text-gray-500 mt-2">
                Page {pageNumber} of {totalPages}
            </div>
        </div>
    );
};

export const TransmittalPrintTemplate = forwardRef<HTMLDivElement, any>(({ transmittal, client, staffMember, logoUrl }, ref) => {
    if (!transmittal || !client) return null;

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-');
    };

    const formattedDate = formatDate(transmittal.date);
    const itemsCount = transmittal.items ? transmittal.items.split('||').length : 0;

    if (itemsCount > 25) {
        const itemPages = chunkItems(transmittal.items.split('||'), 25);
        const totalPages = itemPages.length;

        return (
            <div ref={ref} className="bg-white flex flex-col">
                {itemPages.map((items, index) => (
                    <PagedSlip
                        key={`client-${index}`}
                        transmittal={transmittal}
                        client={client}
                        staffMember={staffMember}
                        logoUrl={logoUrl}
                        copyType="CLIENT'S COPY"
                        formattedDate={formattedDate}
                        items={items}
                        pageNumber={index + 1}
                        totalPages={totalPages}
                        pageBreakAfter="always"
                    />
                ))}
                {itemPages.map((items, index) => (
                    <PagedSlip
                        key={`mpca-${index}`}
                        transmittal={transmittal}
                        client={client}
                        staffMember={staffMember}
                        logoUrl={logoUrl}
                        copyType="MPCA's COPY"
                        formattedDate={formattedDate}
                        items={items}
                        pageNumber={index + 1}
                        totalPages={totalPages}
                        pageBreakAfter={index < itemPages.length - 1 ? 'always' : 'auto'}
                    />
                ))}
            </div>
        );
    }

    if (itemsCount > 8) {
        return (
            <div ref={ref} className="bg-white flex flex-col">
                {/* Page 1 - Client Copy */}
                <div className="w-[794px] h-[1123px] px-12 py-12 flex flex-col" style={{ pageBreakAfter: 'always' }}>
                    <div className="flex-1 flex flex-col">
                        <SingleSlip 
                            transmittal={transmittal} 
                            client={client} 
                            staffMember={staffMember} 
                            logoUrl={logoUrl} 
                            copyType="CLIENT'S COPY" 
                            formattedDate={formattedDate}
                            showCutGuideBelowSignatures={itemsCount > 8 && itemsCount < 20}
                        />
                    </div>
                </div>
                {/* Page 2 - MPCA Copy */}
                <div className="w-[794px] h-[1123px] px-12 py-12 flex flex-col">
                    <div className="flex-1 flex flex-col">
                        <SingleSlip 
                            transmittal={transmittal} 
                            client={client} 
                            staffMember={staffMember} 
                            logoUrl={logoUrl} 
                            copyType="MPCA's COPY" 
                            formattedDate={formattedDate}
                            showCutGuideBelowSignatures={itemsCount > 8 && itemsCount < 20}
                        />
                    </div>
                </div>
            </div>
        );
    }

    const isLegal = itemsCount > 4;
    const containerWidth = isLegal ? "w-[816px]" : "w-[794px]";
    const containerHeight = isLegal ? "h-[1344px]" : "h-[1123px]";

    return (
        <div 
            ref={ref} 
            className={`bg-white ${containerWidth} ${containerHeight} flex flex-col px-12 py-12`}
        >
            <div className="flex-1 flex flex-col">
                <SingleSlip 
                    transmittal={transmittal} 
                    client={client} 
                    staffMember={staffMember} 
                    logoUrl={logoUrl} 
                    copyType="CLIENT'S COPY" 
                    formattedDate={formattedDate}
                />
            </div>
            
            <div className="-mx-12 border-b-[3px] border-dashed border-gray-400 my-8 flex-shrink-0 relative">
                <span className="absolute left-12 -top-4 text-gray-400 text-[10px] bg-white pr-2">✂ cut here</span>
            </div>

            <div className="flex-1 flex flex-col">
                <SingleSlip 
                    transmittal={transmittal} 
                    client={client} 
                    staffMember={staffMember} 
                    logoUrl={logoUrl} 
                    copyType="MPCA's COPY" 
                    formattedDate={formattedDate}
                />
            </div>
        </div>
    );
});
