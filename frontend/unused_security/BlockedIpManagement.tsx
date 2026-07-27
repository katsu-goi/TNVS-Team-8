import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { BlockedIp } from '../../types/security';
import { Table } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal'; // assumed modal component

const BlockedIpManagement: React.FC = () => {
  const [blockedIps, setBlockedIps] = useState<BlockedIp[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newIp, setNewIp] = useState('');
  const [reason, setReason] = useState('');

  const fetchBlockedIps = async () => {
    try {
      const response = await axios.get<BlockedIp[]>('/api/v1/security/blocked-ips');
      setBlockedIps(response.data);
    } catch (err) {
      console.error('Failed to fetch blocked IPs', err);
    }
  };

  useEffect(() => {
    fetchBlockedIps();
  }, []);

  const addIp = async () => {
    try {
      await axios.post('/api/v1/security/blocked-ips', {
        ipAddress: newIp,
        reason,
        blockedBy: undefined,
        blockedAt: undefined,
        expiresAt: undefined,
        status: 'BLOCKED',
      });
      setShowAddModal(false);
      setNewIp('');
      setReason('');
      fetchBlockedIps();
    } catch (err) {
      console.error('Failed to add blocked IP', err);
    }
  };

  const unblockIp = async (ip: string) => {
    try {
      // Simple unblocking by deleting the record (backend will handle status change)
      await axios.delete(`/api/v1/security/blocked-ips/${encodeURIComponent(ip)}`);
      fetchBlockedIps();
    } catch (err) {
      console.error('Failed to unblock IP', err);
    }
  };

  const extendBlock = async (ip: string) => {
    try {
      // Extend expiration by 24h (backend should interpret this payload)
      await axios.patch(`/api/v1/security/blocked-ips/${encodeURIComponent(ip)}`, {
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      fetchBlockedIps();
    } catch (err) {
      console.error('Failed to extend block', err);
    }
  };

  return (
    <div className="p-4 bg-gray-900 text-gray-100 rounded-lg">
      <h2 className="text-xl mb-4">Blocked IP Management</h2>
      <Button onClick={() => setShowAddModal(true)} className="mb-4 bg-green-600 hover:bg-green-700">
        Add IP
      </Button>
      <Table
        data={blockedIps}
        columns={[
          { header: 'IP Address', accessor: 'ipAddress' },
          { header: 'Reason', accessor: 'reason' },
          { header: 'Blocked At', accessor: 'blockedAt' },
          { header: 'Expires At', accessor: 'expiresAt' },
          { header: 'Status', accessor: 'status' },
          {
            header: 'Actions',
            accessor: 'ipAddress',
            cell: (row: any) => (
              <div className="flex space-x-2">
                <Button onClick={() => unblockIp(row.ipAddress)} className="bg-red-600 hover:bg-red-700">
                  Unblock
                </Button>
                <Button onClick={() => extendBlock(row.ipAddress)} className="bg-blue-600 hover:bg-blue-700">
                  Extend
                </Button>
              </div>
            ),
          },
        ]}
      />

      {showAddModal && (
        <Modal onClose={() => setShowAddModal(false)} title="Add Blocked IP">
          <div className="space-y-4">
            <input
              type="text"
              placeholder="IP Address"
              value={newIp}
              onChange={e => setNewIp(e.target.value)}
              className="input"
            />
            <input
              type="text"
              placeholder="Reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="input"
            />
            <div className="flex justify-end space-x-2">
              <Button onClick={() => setShowAddModal(false)} variant="secondary">
                Cancel
              </Button>
              <Button onClick={addIp} variant="primary">
                Add
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default BlockedIpManagement;
