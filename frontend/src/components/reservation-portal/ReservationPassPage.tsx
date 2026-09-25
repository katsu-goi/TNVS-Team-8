import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { AlertCircle, CheckCircle2, Clock3, MapPin, ShieldCheck } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { extractErrorMessage } from '../../api/client';
import { reservationPortalService } from '../../api/reservationPortalService';

type PassDetails = {
  inviteeEmail: string;
  checkedIn: boolean;
  title: string;
  startTime: string;
  endTime: string;
  status: string;
  facilityName: string;
  hostName?: string;
  floorPlanUrl?: string | null;
  magicLinkExpiresAt?: string | null;
  credentialType?: string;
  checkedInAt?: string | null;
};

export const ReservationPassPage: React.FC = () => {
  const { token: pathToken } = useParams<{ token: string }>();
  const [pass, setPass] = useState<PassDetails | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [qrImage, setQrImage] = useState('');

  useEffect(() => {
    const token = pathToken ?? new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setError('This QR pass is missing its token.');
      setLoading(false);
      return;
    }
    const loadPass = pathToken
      ? reservationPortalService.getGuestPass(token)
      : reservationPortalService.verifyPass(token);
    loadPass
      .then(async (details) => {
        setPass(details as PassDetails);
        setQrImage(await QRCode.toDataURL(window.location.href, { width: 220, margin: 1, errorCorrectionLevel: 'M' }));
      })
      .catch((verifyError) => setError(extractErrorMessage(verifyError)))
      .finally(() => setLoading(false));
  }, [pathToken]);

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10 text-slate-900">
      <main className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-5"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-700 text-white"><ShieldCheck className="h-5 w-5" /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-700">Team 8 Facilities</p><h1 className="text-xl font-bold">Digital QR Pass</h1></div></div>
        {loading ? <div className="py-12 text-center text-sm text-slate-500">Verifying pass...</div> : error ? <div className="mt-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><span>{error}</span></div> : pass ? <div className="mt-6 space-y-5"><div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800"><CheckCircle2 className="h-5 w-5" />{pathToken ? 'Guest pass verified' : 'Pass verified'}</div><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Invitee</p><p className="mt-1 text-sm font-bold text-slate-900">{pass.inviteeEmail}</p></div><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Visit</p><p className="mt-1 text-lg font-bold text-slate-900">{pass.title}</p></div><div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm"><p className="flex items-center gap-2 text-slate-700"><MapPin className="h-4 w-4 text-red-700" />{pass.facilityName}</p><p className="flex items-center gap-2 text-slate-700"><Clock3 className="h-4 w-4 text-red-700" />{new Date(pass.startTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} - {new Date(pass.endTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>{pass.hostName ? <p className="text-slate-700">Host: <span className="font-semibold">{pass.hostName}</span></p> : null}</div>{qrImage ? <div className="rounded-xl border border-slate-200 bg-white p-4 text-center"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Check-in QR pass</p><img src={qrImage} alt="Guest check-in QR pass" className="mx-auto mt-3 h-52 w-52" /><p className="mt-2 text-xs text-slate-500">Present this code to the Facilities Officer.</p></div> : null}<p className="text-center text-xs text-slate-400">Reservation status: {pass.status} · Check-in: {pass.checkedIn ? 'Completed' : 'Pending'}{pass.magicLinkExpiresAt ? ` · Link expires: ${new Date(pass.magicLinkExpiresAt).toLocaleString()}` : ''}</p></div> : null}
      </main>
    </div>
  );
};
