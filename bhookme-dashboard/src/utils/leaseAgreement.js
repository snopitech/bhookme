// ============================================================
// leaseAgreement.js
// ------------------------------------------------------------
// One source for the residential lease agreement text:
//  - shown inside the rental application (the tenant reads and
//    signs it by typing their full name), and
//  - turned into the signed PDF the tenant downloads from their
//    dashboard once the first payment is in.
// jsPDF is loaded only when someone downloads, so it doesn't make
// the rest of the site slower.
// ============================================================

const TYPE_LABELS = {
  APARTMENT: 'apartment',
  HOUSE: 'house',
  CONDO: 'condominium',
  TOWNHOUSE: 'townhouse',
  STUDIO: 'studio apartment',
  ROOM: 'private room',
};

export function usd(n) {
  return `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function longDate(value) {
  if (!value) return '';
  const s = String(value).slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return String(value);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function addMonthsToDate(dateString, months) {
  if (!dateString) return '';
  const [y, m, d] = dateString.split('-').map(Number);
  const date = new Date(y, m - 1 + Number(months || 0), d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// The numbered clauses of the lease. `t` holds the terms:
// landlordName, tenantName, address/city/state/zip (or a
// placeholder before approval), moveInDate, moveOutDate, months,
// monthlyRent, securityDeposit, occupants, petsAllowed, hasPets,
// petDetails, furnished, utilitiesIncluded, propertyType.
export function leaseClauses(t) {
  const premises =
    [t.address, t.city, t.state, t.zip].filter(Boolean).join(', ') ||
    `the ${TYPE_LABELS[t.propertyType] || 'home'} listed as "${t.propertyTitle || 'the property'}" in ${[t.city, t.state].filter(Boolean).join(', ')}`;
  const months = Number(t.months || 1);

  return [
    {
      title: 'Parties',
      text: `This Residential Lease Agreement ("Agreement") is made between ${t.landlordName || 'the Landlord (the host on bhookme)'} ("Landlord") and ${t.tenantName || 'the Tenant'} ("Tenant"), through the bhookme platform.`,
    },
    {
      title: 'Premises',
      text: `Landlord leases to Tenant the ${TYPE_LABELS[t.propertyType] || 'home'} located at ${premises} (the "Premises")${t.furnished ? ', furnished' : ''}.`,
    },
    {
      title: 'Term',
      text: `The lease begins on ${longDate(t.moveInDate)} and ends on ${longDate(t.moveOutDate)} (${months} month${months === 1 ? '' : 's'}). Any extension must be agreed in writing by both parties.`,
    },
    {
      title: 'Rent',
      text: `Tenant agrees to pay ${usd(t.monthlyRent)} per month, due on the same day of each month as the move-in date. The first month's rent is due before move-in. Rent paid more than 5 days late may be subject to a late fee as allowed by local law.`,
    },
    {
      title: 'Security deposit',
      text: `Tenant pays a security deposit of ${usd(t.securityDeposit)} before move-in. The deposit is held to cover unpaid rent and damage beyond normal wear and tear, and will be returned, less any lawful deductions with an itemized list, within the time required by state law after Tenant moves out.`,
    },
    {
      title: 'Occupants',
      text: `The Premises will be occupied by no more than ${Number(t.occupants || 1)} person${Number(t.occupants || 1) === 1 ? '' : 's'} as listed in the rental application. Guests staying longer than 14 days in a row need Landlord's written approval.`,
    },
    {
      title: 'Utilities',
      text: t.utilitiesIncluded
        ? 'Utilities are included in the rent unless otherwise agreed in writing.'
        : 'Tenant is responsible for setting up and paying all utilities (electricity, water, gas, internet) unless otherwise agreed in writing.',
    },
    {
      title: 'Pets',
      text: t.petsAllowed
        ? `Pets are allowed${t.hasPets && t.petDetails ? ` as disclosed in the application (${t.petDetails})` : ''}. Tenant is responsible for any damage caused by pets.`
        : 'No pets are allowed on the Premises without Landlord\'s prior written consent.',
    },
    {
      title: 'Use and care',
      text: 'Tenant will use the Premises only as a private residence, keep it clean and in good condition, promptly report needed repairs, and not make alterations without Landlord\'s written consent. No illegal activity is permitted. Smoking indoors is not permitted.',
    },
    {
      title: 'Repairs and access',
      text: 'Landlord keeps the Premises in safe and livable condition and makes necessary repairs within a reasonable time. Landlord may enter with at least 24 hours\' notice for inspections or repairs, or at any time in an emergency.',
    },
    {
      title: 'Subletting',
      text: 'Tenant may not sublet the Premises or assign this Agreement without Landlord\'s written consent.',
    },
    {
      title: 'Ending the lease',
      text: 'At the end of the term Tenant will return all keys and leave the Premises clean and in the same condition as at move-in, except for normal wear and tear. Breaking the lease early may make Tenant responsible for rent until the Premises is re-rented, as allowed by law.',
    },
    {
      title: 'Application',
      text: 'Tenant confirms that all information in the rental application is true and complete. False information is grounds for ending this Agreement.',
    },
    {
      title: 'Electronic signature',
      text: 'Both parties agree that typing a full name as a signature on bhookme is a valid electronic signature with the same effect as a handwritten one. This Agreement takes effect once Landlord approves the application and the first month\'s rent and security deposit are paid.',
    },
  ];
}

// ---------- PDF ----------

export async function downloadLeaseAgreementPdf(agreement) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 54;
  const width = pageW - margin * 2;
  let y = margin;

  const ensure = (h) => {
    if (y + h > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const para = (text, { size = 10, bold = false, gap = 6, color = [40, 40, 40] } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(String(text), width);
    const lineH = size * 1.35;
    lines.forEach((line) => {
      ensure(lineH);
      doc.text(line, margin, y);
      y += lineH;
    });
    y += gap;
  };

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(244, 63, 94);
  doc.text('bhookme', margin, y);
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.setFont('helvetica', 'normal');
  doc.text(`Agreement #BH-L-${agreement.applicationId}`, pageW - margin, y, { align: 'right' });
  y += 28;

  para('RESIDENTIAL LEASE AGREEMENT', { size: 16, bold: true, gap: 4, color: [20, 20, 20] });
  para(
    `${agreement.propertyTitle || ''} - ${[agreement.city, agreement.state].filter(Boolean).join(', ')}`,
    { size: 10, gap: 14, color: [100, 100, 100] }
  );

  // Summary box
  const summary = [
    ['Landlord', agreement.landlordName],
    ['Tenant', `${agreement.tenantName}${agreement.tenantEmail ? ` (${agreement.tenantEmail})` : ''}`],
    ['Premises', [agreement.address, agreement.city, agreement.state, agreement.zip].filter(Boolean).join(', ')],
    ['Term', `${longDate(agreement.moveInDate)} to ${longDate(agreement.moveOutDate)} (${agreement.months} month${agreement.months === 1 ? '' : 's'})`],
    ['Monthly rent', usd(agreement.monthlyRent)],
    ['Security deposit', usd(agreement.securityDeposit)],
    ['Paid at signing', `${usd(agreement.amountPaid)} (first month + deposit)${agreement.paidAt ? ` on ${longDate(agreement.paidAt)}` : ''}`],
  ];
  const rowH = 16;
  const boxH = summary.length * rowH + 16;
  ensure(boxH);
  doc.setDrawColor(225, 225, 225);
  doc.setFillColor(248, 248, 248);
  doc.roundedRect(margin, y, width, boxH, 6, 6, 'FD');
  let by = y + 18;
  summary.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(label, margin + 12, by);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    const v = doc.splitTextToSize(String(value || '-'), width - 130)[0];
    doc.text(v, margin + 120, by);
    by += rowH;
  });
  y += boxH + 18;

  // Clauses
  leaseClauses(agreement).forEach((c, i) => {
    para(`${i + 1}. ${c.title}`, { size: 11, bold: true, gap: 2, color: [20, 20, 20] });
    para(c.text, { size: 10, gap: 10 });
  });

  // Signatures
  ensure(150);
  y += 6;
  para('SIGNATURES', { size: 12, bold: true, gap: 10, color: [20, 20, 20] });

  const sigBlock = (role, name, signedName, when, note) => {
    ensure(70);
    doc.setFont('times', 'italic');
    doc.setFontSize(18);
    doc.setTextColor(25, 45, 110);
    doc.text(signedName || '', margin, y);
    y += 6;
    doc.setDrawColor(150, 150, 150);
    doc.line(margin, y, margin + 260, y);
    y += 13;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(`${role}: ${name || ''}`, margin, y);
    y += 12;
    doc.text(`${note}${when ? ` - ${longDate(when)}` : ''}`, margin, y);
    y += 26;
  };

  sigBlock('Tenant', agreement.tenantName, agreement.signatureName, agreement.signedAt, 'Signed electronically on bhookme');
  sigBlock('Landlord', agreement.landlordName, agreement.landlordName, agreement.approvedAt, 'Approved electronically on bhookme');

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`bhookme.com - Lease agreement #BH-L-${agreement.applicationId} - Page ${p} of ${pages}`, pageW / 2, pageH - 24, {
      align: 'center',
    });
  }

  const safeName = String(agreement.tenantName || 'tenant').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  doc.save(`bhookme-lease-${agreement.applicationId}-${safeName}.pdf`);
}