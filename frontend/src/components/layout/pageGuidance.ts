import type { PortalNavItem } from './PortalShell';

export type PageGuide = { purpose: string; steps: string[]; note?: string; terms: string };
const guide = (purpose: string, steps: string[], terms: string, note?: string): PageGuide => ({ purpose, steps, terms, note });

const roomGuide = guide('Request a room and follow its review, approval and confirmation.', [
  'Choose a date and time, find an available room, then enter the meeting details and submit the request.',
  'The Facilities Officer reviews the room request. The Facilities Manager then approves or rejects it.',
  'After approval, the Facilities Officer confirms the booking. Check that its status is Confirmed before using the room.',
], 'book a room meeting reservation request booking schedule', 'Submitting a request does not confirm a booking. A rescheduled request goes through review again.');

// Guidance describes existing processes; it never grants actions or changes state rules.
export function getPageGuide(path: string, label: string): PageGuide {
  if (path.startsWith('/reservation-portal')) return guide('Book a facility meeting space and manage guest passes in the Team 8 portal.', [
    'Choose the meeting space, date and available time. Enter a title and optional invitee email addresses.',
    'Confirm the reservation, then check the booking result and email delivery message. A booking can be confirmed even if an invitation email was not delivered.',
    'Use My Bookings to view or manage your bookings. Guests show their QR pass or open their guest-pass link for admission.',
  ], 'book meeting space facility team 8 guest qr pass invitation', 'This portal is separate from room requests that require officer review and manager approval.');
  if (path.includes('/approval') && path.startsWith('/facilities')) return guide('Review room requests awaiting a Facilities Manager decision.', [
    'Open a request and check the meeting details, schedule and officer review.',
    'Approve when the requirements are met, or reject with a clear reason. The system rechecks availability and capacity.',
    'An approved room still needs Facilities Officer confirmation before it is confirmed.',
  ], 'approve booking room reservation manager decision capacity allocation');
  if (path.startsWith('/facilities/reservations')) return guide('Browse room reservations and follow their review and confirmation status.', [
    'Use the status filter to find reservations, then read the room, meeting time and current status.',
    'For requests awaiting your decision, open Booking Approvals from the Facilities Manager menu.',
    'Approval is followed by Facilities Officer confirmation. Refresh the list to check the latest status.',
  ], 'room reservations booking list status manager');
  if (path.includes('/reservations')) return path.startsWith('/facilities-officer') ? guide('Review room requests and confirm approved bookings.', [
    'Open the reservation and check its schedule, availability and capacity.',
    'Review the request to send it for Facilities Manager approval. Explain any problem in the review notes.',
    'Confirm an approved booking, then complete it at the appropriate time. Only actions allowed by its current status are available.',
  ], 'book room review booking confirm reservation queue', roomGuide.note) : roomGuide;
  if (/qr-check-in|guest-pass/.test(path)) return guide('Verify a guest pass and record arrival or departure.', [
    'Scan the guest QR pass or use the available lookup option.',
    'Check the displayed guest and booking details before recording arrival.',
    'Record departure when the guest leaves. Follow any screening or review message before admission.',
  ], 'scan qr guest check in check out arrival departure pass');
  if (/visitors/.test(path) && !path.startsWith('/privacy')) return guide('Register visitors or review their visit and screening status.', [
    'For a new visit, enter the visitor details, purpose and expected arrival.',
    'Registration creates a visit record. Screening and any required manual review happen before check-in.',
    'Read the current status and any review notes. Authorized staff record arrival and departure.',
  ], 'register visitor guest screening arrival check in check out');
  if (/requests-review|\/employee\/requests/.test(path)) return guide('Submit or review a contract or legal request.', [
    'Choose the request type and describe what is needed. Use a clear title.',
    'After submission, the appropriate contract or legal team reviews the request. Read its status and any response.',
    'Use the available actions to review or manage a request; the current status determines what can be changed.',
  ], 'submit request legal contract review');
  if (/access-requests/.test(path)) return guide('Request or review access to a document.', [
    'Select the document and explain why access is needed.',
    'An authorized reviewer considers the request. Check its status and any response.',
    'A document being listed does not automatically give permission to open its contents.',
  ], 'document access permission request approve records');
  if (/disposal|shredding|decommissioning|retention/.test(path)) return guide('Manage how long records are kept and review disposal requirements.', [
    'Open the record or policy and check its dates, scope and current status.',
    'Read any legal hold or review requirement before taking an available action. A legal hold can prevent disposal.',
    'Record the required reason or evidence. Approval of a request does not itself mean a file has been deleted.',
  ], 'retention keep records dispose disposal shredding policy legal hold');
  if (/cctv/.test(path)) return guide('Review surveillance records and authorized export requests.', [
    'Find the relevant record or export request and check the purpose and scope.',
    'Follow the independent approval requirements shown for the request.',
    'Use only the available actions and record the required justification.',
  ], 'cctv surveillance video export privacy approval', 'Being a Super Administrator does not remove independent approval requirements.');
  if (/documents|repositor|archive|ingestion|custody/.test(path)) return guide('Find, submit or manage documents and their review status.', [
    'Find the document using the page filters, or use the available upload or submission action.',
    'Check the required details and file rules. Uploading a file and entering document metadata are different actions; follow the form shown on this page.',
    'Read the review or access status before opening, downloading or managing a record. Some records require a separate access request.',
  ], 'upload file document archive records download review');
  if (/\/rbac|roles|permissions/.test(path)) return guide('Manage which users can use each part of the system.', [
    'Find the user or role and review its current access.',
    'Check the effect of the change before saving. Roles control access across the system.',
    'Read any conflict or validation message and verify the resulting assignment.',
  ], 'role permission user access account manage');
  if (/user-oversight/.test(path)) return guide('Inspect the system from a selected user’s scope.', [
    'Select the user whose view you need to inspect.',
    'Read the oversight notice and stay within that user’s permitted scope.',
    'End oversight to return to your own view.',
  ], 'user oversight inspect account', 'Oversight is read-only and is different from using your own Super Admin actions.');
  if (/ai-services/.test(path)) return guide('Configure artificial intelligence services and review their usage.', [
    'Review the configured providers and modules. A provider connects the system to an AI service.',
    'Use Test Connection to check a configured connection. Review any error before changing settings.',
    'Usage charts need recorded requests. No measurements yet means a value has not been recorded; it is different from zero.',
  ], 'ai artificial intelligence provider prompt connection usage');
  if (/backup/.test(path)) return guide('Review backup copies and recovery tools.', [
    'Check the latest backup status and the available backup records.',
    'Read the scope and confirmation before starting an available backup or recovery action.',
    'Check the result message; recovery may affect stored system data.',
  ], 'backup recovery disaster restore dr');
  if (/settings|integrations/.test(path)) return guide('Review or update system connections and settings.', [
    'Read the setting description and review its current value.',
    'Change only the setting you intend to update, then use the page’s save or test action if available.',
    'Check the result message to confirm whether the change was saved.',
  ], 'system config configuration settings integration connection');
  if (/notifications/.test(path)) return guide('Read updates about requests, decisions and reminders.', [
    'Open an unread update and read its message.',
    'Follow the available link to the relevant record or page.',
    'Check the record’s current status before taking action; an older notification may describe an earlier status.',
  ], 'notifications alerts reminders message updates');
  if (/contracts|vendors|obligations|notices|cases/.test(path)) return guide('Manage business records and follow their review or lifecycle status.', [
    'Find the relevant record and read its details, dates and current status.',
    'Use an available create, edit or review action. Include the required details and reasons.',
    'Read the result and any next review requirement. Actions depend on the record’s current status.',
  ], 'contract vendor supplier legal case notice obligation review');
  if (/rooms|management|assets|calendar/.test(path) && path.startsWith('/facilities')) return guide('Review facilities, meeting spaces, equipment or their schedules.', [
    'Use the page filters or calendar to find the space, item or date you need.',
    'Open the details and check availability, capacity or condition before making a change.',
    'Use the available action and check the result. Room bookings must still follow the reservation process.',
  ], 'facility room space equipment asset supplies calendar schedule logistics');
  if (/security|sessions|lockouts|incidents|breaches|risk|sod|audit|activity|governance|inventory|biometrics|dsr/.test(path)) return guide(`Review ${label.toLowerCase()} and any required follow-up.`, [
    'Use the page filters to find the relevant record, event or request.',
    'Open its details and check the current status, scope and evidence.',
    'Use only the actions offered for that record. Read any justification or independent review requirement before proceeding.',
  ], `security privacy audit incident risk review ${label}`);
  if (/approval|signoff|supervision/.test(path)) return guide('Review items that need a decision or follow-up.', [
    'Open an item and read its details and supporting records.',
    'Check the requirements and any earlier review before making an available decision.',
    'Add a clear reason or response and check the resulting status.',
  ], 'approve approval sign off review decision team supervision');
  if (/analytics|reports|dashboard|system-health/.test(path) || /dashboard/i.test(label)) return guide('See a summary of activity and items that need attention.', [
    'Read the summary and any loading or error message. Empty charts may mean there are no recorded measurements for that period.',
    'Use the available filters or links to open the details behind a summary.',
    'To start a task, find its page in the menu or use Find a page. Searching pages does not search business records.',
  ], 'dashboard home summary analytics report chart health');
  if (/profile/.test(path)) return guide('Review your account details.', ['Check the displayed account and contact details.', 'Use the available edit action to update permitted fields, then check the save result.'], 'profile account personal details');
  return guide(`Use ${label} to find the information or actions available on this page.`, [
    'Read the page introduction and use any filters to find what you need.',
    'Open a record to see its details. Read the current status before using an available action.',
    'Check the result message. If information cannot load, try again and report a repeated problem to your system administrator.',
  ], label);
}

export function getNavigationEntries(items: PortalNavItem[], portalLabel: string) {
  return items.flatMap(item => [
    ...(item.disclosureOnly ? [] : [{ ...item, context: item.group || portalLabel }]),
    ...(item.children ?? []).map(child => ({ ...child, context: item.disclosureOnly ? item.label : `${portalLabel} · ${item.label}` })),
  ]);
}

const normalized = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function findNavigationEntries(items: PortalNavItem[], portalLabel: string, query: string) {
  const words = normalized(query).split(' ').filter(Boolean);
  return getNavigationEntries(items, portalLabel).filter(item => {
    const text = normalized(`${item.label} ${item.context} ${getPageGuide(item.path, item.label).terms}`);
    return words.every(word => text.includes(word));
  });
}

export function getCurrentNavigationEntry(items: PortalNavItem[], portalLabel: string, pathname: string) {
  return getNavigationEntries(items, portalLabel).filter(item => [item.path, ...(item.activePaths ?? [])].some(path =>
    pathname === path || (!item.exact && pathname.startsWith(`${path}/`)),
  )).sort((a, b) => b.path.length - a.path.length)[0];
}

export function getRoomStatusGuidance(status?: string) {
  const states: Record<string, { label: string; next: string }> = {
    PENDING: { label: 'Awaiting officer review', next: 'The Facilities Officer reviews the room request next.' },
    PENDING_MANAGER_APPROVAL: { label: 'Awaiting manager approval', next: 'The Facilities Manager reviews the request next.' },
    APPROVED: { label: 'Approved — awaiting confirmation', next: 'Waiting for the Facilities Officer to confirm the booking.' },
    CONFIRMED: { label: 'Confirmed', next: 'The booking is confirmed. Check its date, time and room before arrival.' },
    CHECKED_IN: { label: 'In progress', next: 'The booking has been checked in.' },
    COMPLETED: { label: 'Completed', next: 'This booking is complete.' },
    REJECTED: { label: 'Rejected', next: 'Read the rejection reason before creating a new request.' },
    CANCELLED: { label: 'Cancelled', next: 'This booking is cancelled.' },
  };
  return states[(status || '').toUpperCase()] || { label: status?.replace(/_/g, ' ') || 'Status unavailable', next: 'Check the booking details for its current status.' };
}
