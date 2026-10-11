import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReservationPortalPage } from './ReservationPortalPage';
import { ReservationDetailsModal } from './ReservationDetailsModal';
import { useAuthStore } from '../../stores/authStore';
import type { ReservationDetails } from '../../api/reservationPortalService';
vi.mock('../layout/AppLayout',()=>({AppLayout:({children}:{children:React.ReactNode})=><div data-testid="super-admin-shell">{children}</div>}));
vi.mock('../../api/reservationPortalService',()=>({reservationPortalService:{getFacilities:vi.fn().mockResolvedValue([]),getReservations:vi.fn().mockResolvedValue([])}}));
describe('Super Admin facility booking integration',()=>{
 beforeEach(()=>{localStorage.clear();useAuthStore.setState({user:{id:'admin',email:'admin@outside.test',assignedRoles:['SUPER_ADMIN'],roles:['SUPER_ADMIN']}});});
 afterEach(cleanup);
 it('embeds booking controls inside one administrator shell',async()=>{
  render(<ReservationPortalPage/>);
  expect(screen.getByTestId('super-admin-shell')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'My bookings'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'New Visit / Reserve Room'})).toBeInTheDocument();
  expect(await screen.findByText('No meeting spaces are configured.')).toBeInTheDocument();
 });
 it('allows management of another host booking while ordinary users retain owner controls',()=>{
  const reservation: ReservationDetails={id:'booking',facilityId:'facility',facilityName:'Meeting room',hostUserId:'other',hostName:'Host',hostEmail:'host@test.invalid',title:'Meeting',startTime:new Date(Date.now()+86400000).toISOString(),endTime:new Date(Date.now()+90000000).toISOString(),status:'CONFIRMED',notes:null,createdAt:new Date().toISOString(),invitees:[]};
  const props={reservation,loading:false,error:'',currentUserId:'admin',actionLoading:false,onClose:vi.fn(),onSave:vi.fn(),onCancel:vi.fn()};
  const view=render(<ReservationDetailsModal {...props} canManage/>);
  expect(screen.getByRole('button',{name:'Edit'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Cancel reservation'})).toBeInTheDocument();
  view.rerender(<ReservationDetailsModal {...props}/>);
  expect(screen.queryByRole('button',{name:'Edit'})).not.toBeInTheDocument();
 });
});
