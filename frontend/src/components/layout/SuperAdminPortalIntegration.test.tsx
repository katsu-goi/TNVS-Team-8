import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../stores/authStore';
import { FacilitiesManagerLayout } from '../facilities/FacilitiesManagerLayout';
import { FacilitiesOfficerLayout } from '../facilities-officer/FacilitiesOfficerLayout';
import { LegalOfficerLayout } from '../legal/LegalOfficerLayout';
import { ProcurementOfficerLayout } from '../procurement/ProcurementOfficerLayout';
import { EmployeeLayout } from '../employee/EmployeeLayout';
import { RoleWorkspaceLayout } from '../workspaces/RoleWorkspaceLayout';
import { workspaceConfigs } from '../workspaces/workspaceConfig';
vi.mock('./PortalShell',()=>({PortalShell:({portalLabel,navItems}: {portalLabel:string;navItems:{id:string}[]})=><div>{portalLabel}<span>{navItems.filter(item=>item.id.startsWith('role-')).length} role groups</span></div>}));
describe('administrator presentation across portals',()=>{
  beforeEach(()=>{localStorage.clear();useAuthStore.setState({user:{id:'a',email:'a@test.invalid',roles:['SUPER_ADMIN'],assignedRoles:['SUPER_ADMIN']}});});
  afterEach(cleanup);
  it.each([FacilitiesManagerLayout,FacilitiesOfficerLayout,LegalOfficerLayout,ProcurementOfficerLayout,EmployeeLayout])('retains Super Administration in a business layout',Layout=>{
    render(<Layout/>);expect(screen.getByText('Super Administration')).toBeInTheDocument();expect(screen.getByText('14 role groups')).toBeInTheDocument();
  });
  it.each(workspaceConfigs)('retains Super Administration in $slug',config=>{
    render(<RoleWorkspaceLayout config={config}/>);expect(screen.getByText('Super Administration')).toBeInTheDocument();
  });
});
