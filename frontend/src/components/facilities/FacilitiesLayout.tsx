import React, { useState, useEffect, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { RoomItem, ReservationItem, EquipmentAsset, AdminAnalytics10KPI } from '../../types/reservationSystem';
import { reservationService } from '../../api/reservationService';

export interface FacilitiesContext {
 rooms: RoomItem[];
 reservations: ReservationItem[];
 equipmentAssets: EquipmentAsset[];
 kpis: AdminAnalytics10KPI | null;
 loading: boolean;
 error: string | null;
 reload: () => void;
 realtimeActive: boolean;
 userRole: string;
}

export const FacilitiesLayout: React.FC = () => {
 const [rooms, setRooms] = useState<RoomItem[]>([]);
 const [reservations, setReservations] = useState<ReservationItem[]>([]);
 const [equipmentAssets, setEquipmentAssets] = useState<EquipmentAsset[]>([]);
 const [kpis, setKpis] = useState<AdminAnalytics10KPI | null>(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [realtimeActive, setRealtimeActive] = useState(true);

 const loadAllData = useCallback(async () => {
 setLoading(true);
 setError(null);
 try {
 const [roomsData, resData, equipData, kpiData] = await Promise.all([
 reservationService.getRooms(),
 reservationService.getReservations(),
 reservationService.getEquipmentAssets(),
 reservationService.get10KpiMetrics(),
 ]);
 setRooms(roomsData);
 setReservations(resData);
 setEquipmentAssets(equipData);
 setKpis(kpiData);
 } catch (err: any) {
 setError(err.message || 'Failed to load facilities data.');
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => { loadAllData(); }, [loadAllData]);

 useEffect(() => {
 const unsubscribe = reservationService.subscribeToRealtimeChanges(() => {
 setRealtimeActive(true);
 loadAllData();
 });
 return () => unsubscribe();
 }, [loadAllData]);

 const ctx: FacilitiesContext = {
 rooms,
 reservations,
 equipmentAssets,
 kpis,
 loading,
 error,
 reload: loadAllData,
 realtimeActive,
 userRole: 'ROLE_ADMIN', // placeholder until auth is wired
 };

 return (
 <div className="space-y-6">
 {error && (
 <div className="p-4 rounded-xl bg-rose-500/10 border border-slate-200 text-rose-400 text-sm flex items-center space-x-2">
 <AlertCircle className="w-5 h-5 shrink-0" />
 <span>{error}</span>
 </div>
 )}

 <Outlet context={ctx} />
 </div>
 );
};
