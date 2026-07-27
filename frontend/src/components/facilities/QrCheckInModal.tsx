import React, { useState } from 'react';
import { X, QrCode, CheckCircle2, AlertCircle, Scan, ShieldCheck, Loader2 } from 'lucide-react';
import { ReservationItem } from '../../types/reservationSystem';
import { reservationService } from '../../api/reservationService';

interface QrCheckInModalProps {
 reservation: ReservationItem | null;
 isOpen: boolean;
 onClose: () => void;
 onCheckInSuccess?: (updatedRes: ReservationItem) => void;
 isOfficerScanner?: boolean;
}

export const QrCheckInModal: React.FC<QrCheckInModalProps> = ({
 reservation,
 isOpen,
 onClose,
 onCheckInSuccess,
 isOfficerScanner = false,
}) => {
 const [manualToken, setManualToken] = useState('');
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [successRes, setSuccessRes] = useState<ReservationItem | null>(null);

 if (!isOpen) return null;

 const handlePerformCheckIn = async (tokenToUse: string) => {
 setLoading(true);
 setError(null);
 try {
 const result = await reservationService.checkInByQr(tokenToUse);
 if (result.success && result.reservation) {
 setSuccessRes(result.reservation);
 if (onCheckInSuccess) onCheckInSuccess(result.reservation);
 } else {
 setError(result.message);
 }
 } catch (err: any) {
 setError(err.message || 'Check-in failed.');
 } finally {
 setLoading(false);
 }
 };

 return (
 <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
 <div className="glass-panel w-full max-w-md p-6 space-y-6 border-slate-200">
 {/* Header */}
 <div className="flex items-center justify-between border-b border-slate-200 pb-4">
 <div className="flex items-center space-x-2">
 <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-slate-200">
 <QrCode className="w-5 h-5" />
 </div>
 <div>
 <h3 className="font-heading font-bold text-white text-base">
 {isOfficerScanner ? 'Facilities Officer QR Scanner' : 'Room Entry QR Pass'}
 </h3>
 <p className="text-slate-400 text-xs mt-0.5">
 {isOfficerScanner ? 'Scan or verify employee room pass' : 'Present at room display to check in'}
 </p>
 </div>
 </div>
 <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
 <X className="w-5 h-5" />
 </button>
 </div>

 {/* Success View */}
 {successRes ? (
 <div className="p-6 rounded-2xl bg-emerald-50 border border-slate-200 text-center space-y-4">
 <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto animate-bounce" />
 <div>
 <h4 className="font-bold text-white text-lg">Check-In Successful!</h4>
 <p className="text-xs text-slate-300 mt-1">
 Room <span className="text-emerald-600 font-semibold">{successRes.roomName}</span> is now active.
 </p>
 </div>
 <div className="p-3 rounded-xl bg-slate-900 border border-slate-200 text-xs text-slate-400 space-y-1">
 <div><strong className="text-slate-200">Attendee:</strong> {successRes.employeeName}</div>
 <div><strong className="text-slate-200">Meeting:</strong> {successRes.meetingTitle}</div>
 <div><strong className="text-slate-200">Check-in Time:</strong> {new Date().toLocaleTimeString()}</div>
 </div>
 <button
 onClick={() => { setSuccessRes(null); onClose(); }}
 className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-700/90 transition-colors"
 >
 Done
 </button>
 </div>
 ) : isOfficerScanner ? (
 /* Officer Scanner Mode */
 <div className="space-y-5">
 {error && (
 <div className="p-3 rounded-xl bg-rose-500/10 border border-slate-200 text-rose-400 text-xs flex items-center space-x-2">
 <AlertCircle className="w-4 h-4 shrink-0" />
 <span>{error}</span>
 </div>
 )}

 {/* Scanner Animation View */}
 <div className="relative h-48 rounded-2xl bg-slate-950 border border-slate-200 overflow-hidden flex flex-col items-center justify-center space-y-2">
 <div className="absolute inset-0 bg-gradient-to-b from-emerald-600/10 via-transparent to-emerald-600/10 animate-pulse"></div>
 <Scan className="w-12 h-12 text-emerald-600 animate-spin" style={{ animationDuration: '6s' }} />
 <span className="text-xs text-slate-300 font-semibold z-10">Laser QR Scanner Active</span>
 <span className="text-[10px] text-slate-500 z-10">Point camera at employee QR code</span>
 </div>

 {/* Manual Token Verification */}
 <div className="space-y-2">
 <label className="text-xs font-semibold text-slate-300 block">Or Enter Pass Code Manually</label>
 <div className="flex space-x-2">
 <input
 type="text"
 value={manualToken}
 onChange={(e) => setManualToken(e.target.value)}
 placeholder="e.g. QR-A9X2B7C1"
 className="flex-1 bg-white border border-slate-200 rounded-card px-3 py-2 text-sm text-white focus:border-emerald-200 focus:outline-none uppercase font-mono"
 />
 <button
 onClick={() => handlePerformCheckIn(manualToken)}
 disabled={loading || !manualToken}
 className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-700/90 disabled:opacity-50 flex items-center space-x-1.5"
 >
 {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Verify</span>}
 </button>
 </div>
 </div>
 </div>
 ) : (
 /* Employee QR Pass Display Mode */
 <div className="space-y-5 text-center">
 {reservation && (
 <div className="space-y-2">
 <span className="text-xs font-mono px-2.5 py-1 rounded-md bg-slate-800 text-emerald-600 border border-slate-200">
 {reservation.reservationIdDisplay}
 </span>
 <h4 className="font-bold text-white text-base mt-1">{reservation.meetingTitle}</h4>
 <p className="text-xs text-slate-400">{reservation.roomName} • {reservation.building}</p>
 </div>
 )}

 {/* Visual QR Code Generator */}
 <div className="p-4 rounded-2xl bg-white w-48 h-48 mx-auto flex flex-col items-center justify-center shadow-xl border-4 border-emerald-200/50">
 {/* Simulated QR Code Graphic */}
 <div className="grid grid-cols-5 gap-1.5 w-full h-full p-2 bg-slate-950 rounded-lg">
 {Array.from({ length: 25 }).map((_, i) => (
 <div
 key={i}
 className={`rounded-sm ${
 (i % 2 === 0 || i % 7 === 0 || i === 12) ? 'bg-emerald-600' : 'bg-slate-900'
 }`}
 ></div>
 ))}
 </div>
 </div>

 <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-200 text-xs text-slate-300 space-y-1">
 <div className="flex items-center justify-center space-x-1.5 text-emerald-600 font-semibold">
 <ShieldCheck className="w-4 h-4" />
 <span>Valid Corporate Entry Token</span>
 </div>
 <p className="text-[11px] text-slate-400">
 Pass Token: <code className="text-slate-200 font-mono">{reservation?.qrCodeToken || 'QR-DEFAULT'}</code>
 </p>
 </div>

 {/* Simulated One-Click Self Check-In Button for Testing */}
 <button
 onClick={() => handlePerformCheckIn(reservation?.qrCodeToken || '')}
 disabled={loading}
 className="w-full py-2.5 rounded-xl bg-emerald-100 hover:bg-emerald-600 text-emerald-600 hover:text-white font-semibold text-xs border border-slate-200 transition-all flex items-center justify-center space-x-2"
 >
 {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Simulate Self Check-In Now</span>}
 </button>
 </div>
 )}
 </div>
 </div>
 );
};
