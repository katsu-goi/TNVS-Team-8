import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { Envelope } from '../../api/client';

/**
 * The confirmation step in front of every governed act.
 *
 * <h3>Why this exists</h3>
 * The backend refuses every one of its sensitive actions unless the caller sends a
 * written reason of at least ten characters, and it never carries the act out on
 * the strength of one signature. Before this component, the screens that trigger
 * those acts sent no reason at all: a single click on Terminate fired
 * `POST .../terminate` with an empty body, and the page then displayed "Contract
 * terminated" regardless of what came back. So the same click produced a 422 the
 * user never saw and a success message that was not true.
 *
 * This is the missing half of that control, and it does two separate jobs that are
 * easy to confuse. It <em>collects</em> the justification the gate requires - that
 * is mechanical, and without it the call cannot succeed. And it <em>tells the
 * person what the click actually does</em>, which is the part that matters: it
 * raises a request, it changes nothing yet, and somebody else has to sign. A
 * confirmation dialog that says "Are you sure?" over an action that is really a
 * request for permission has taught the user the wrong model of their own system.
 *
 * <h3>Why the ten-character rule is duplicated here</h3>
 * `ApprovalGateService.request` rejects a justification shorter than ten trimmed
 * characters, and this component disables its confirm button under the same rule.
 * That is deliberate duplication, not a missing single source of truth. The server
 * check is the one that enforces; this one exists so a user typing "asdf" learns it
 * before a round-trip, in the box they are already looking at, rather than through
 * a red toast that arrives after the dialog has closed. If the two ever disagree the
 * server wins and the user sees its sentence - which is why {@link mutateJson}
 * surfaces that sentence instead of swallowing it.
 *
 * <h3>Design</h3>
 * Every class here is lifted from the modals already in the app - the Request
 * Disposal dialog in `ComplianceOfficerPages` and the `Modal` in
 * `LegalOfficerPages`. Same overlay, same card, same icon chip, same label,
 * textarea and button styling. Nothing about the visual language is new; this is
 * the existing dialog pattern with a required field, which is what the disposal
 * dialog already was. The buttons repeat `ActionButton`'s classes rather than
 * importing it because that component is declared privately in four separate page
 * files, and reaching into one of them from here would couple this to whichever
 * page happened to be first.
 */

/** Matches `ApprovalGateService.request`, which refuses anything shorter. */
export const MIN_REASON_LENGTH = 10;

const overlayCls = 'fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4';
const cardCls = 'bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto';
const labelCls = 'text-[11px] font-semibold text-slate-500 uppercase';
const inputCls = 'mt-1 w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200';
const buttonBase = 'inline-flex items-center space-x-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
const neutralBtn = `${buttonBase} bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50`;
const dangerBtn = `${buttonBase} bg-white text-rose-600 border-rose-200 hover:bg-rose-50`;
const primaryBtn = `${buttonBase} bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700`;

export interface ConfirmActionModalProps {
  /** e.g. "Delete Legal Clause". Names the act, not the button that opened this. */
  title: string;
  /** Which thing is being acted on - the clause type, contract title, provider name. */
  targetLabel?: string;
  /**
   * What the approval will cost once it is granted, in one sentence.
   *
   * Taken from the action's own rationale in `SensitiveAction` where one exists, so
   * the approver and the requester are reading the same justification for why the
   * gate is there at all.
   */
  consequence: string;
  /** Question the reason box is answering. Defaults to a generic prompt. */
  reasonPlaceholder?: string;
  /** Defaults to "Request Approval" - never "Delete", because it does not delete. */
  confirmLabel?: string;
  /** Emerald chip for a neutral act, rose for a destructive one. */
  tone?: 'danger' | 'neutral';
  icon?: React.ElementType;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

export const ConfirmActionModal: React.FC<ConfirmActionModalProps> = ({
  title,
  targetLabel,
  consequence,
  reasonPlaceholder = 'Why is this necessary? This becomes part of the permanent record.',
  confirmLabel = 'Request Approval',
  tone = 'danger',
  icon: Icon = AlertTriangle,
  busy,
  onCancel,
  onConfirm,
}) => {
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();
  const tooShort = trimmed.length < MIN_REASON_LENGTH;

  const close = () => { if (!busy) onCancel(); };

  return (
    <div className={overlayCls} onClick={close}>
      <div className={cardCls} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2">
            <div className={`p-2 rounded-xl border ${tone === 'danger' ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'}`}>
              <Icon className={`w-4 h-4 ${tone === 'danger' ? 'text-rose-500' : 'text-emerald-500'}`} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">{title}</h3>
              {targetLabel && <p className="text-[11px] text-slate-400">{targetLabel}</p>}
            </div>
          </div>
          <button onClick={close} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>

        {/* The load-bearing sentence. Stated before the consequence, because the
            most likely misreading of this dialog is that pressing confirm does the
            thing - and a user who believes that stops checking whether it happened. */}
        <p className="text-xs text-slate-500">
          This raises a request for approval. <span className="font-semibold text-slate-700">Nothing is changed yet</span> - the
          act is carried out only after the required approvals are recorded, and you cannot approve your own request.
        </p>

        <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{consequence}</p>

        <div>
          <label className={labelCls}>Reason <span className="text-rose-500">*</span></label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            autoFocus
            disabled={busy}
            placeholder={reasonPlaceholder}
            className={inputCls}
          />
          <p className={`text-[11px] mt-1 ${tooShort && trimmed.length > 0 ? 'text-rose-500' : 'text-slate-400'}`}>
            {tooShort
              ? `At least ${MIN_REASON_LENGTH} characters - the approver reads this before deciding.`
              : 'This is stored with the request and cannot be edited later.'}
          </p>
        </div>

        <div className="flex justify-end space-x-2 pt-1">
          <button onClick={close} disabled={busy} className={neutralBtn}><span>Cancel</span></button>
          <button
            onClick={() => onConfirm(trimmed)}
            disabled={busy || tooShort}
            className={tone === 'danger' ? dangerBtn : primaryBtn}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{busy ? 'Submitting…' : confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

/** The subset of `GovernedActionGateway.describe()` the screens read back. */
export interface RaisedApproval {
  pendingApproval?: boolean;
  approvalRequestId?: string;
  actionLabel?: string;
  requiredApprovals?: number;
  approvalCount?: number;
  approverRoles?: string[];
  targetLabel?: string;
  aiRiskLevel?: string | null;
  aiRationale?: string | null;
}

/**
 * What to tell the user after a governed route answers 200.
 *
 * <p>Prefers the server's own `message`, which `GovernedActionGateway.prompt`
 * writes for exactly this purpose: it names the action, states that nothing has
 * changed, counts the signatures still needed, lists the roles that can give them
 * and quotes the request id. Rebuilding that here from the DTO would be a second
 * copy of a sentence that already exists and would drift from it.
 *
 * <p>The fallback matters anyway. These routes are reachable from screens that will
 * outlive this change, and a caller that gets an envelope with no message must
 * still not print "Deleted".
 */
export function pendingApprovalMessage(envelope: Envelope<RaisedApproval> | null | undefined,
                                       fallbackActionLabel: string): string {
  if (envelope?.message) {
    return envelope.message;
  }
  const dto = envelope?.data;
  const label = dto?.actionLabel || fallbackActionLabel;
  const needed = dto?.requiredApprovals ?? 1;
  const roles = dto?.approverRoles?.length ? dto.approverRoles.join(' or ') : 'an authorised approver';
  return `${label} requested - nothing has been changed yet. It needs ${needed} `
    + `${needed === 1 ? 'approval' : 'approvals'} from ${roles}, and you cannot approve your own request.`;
}
