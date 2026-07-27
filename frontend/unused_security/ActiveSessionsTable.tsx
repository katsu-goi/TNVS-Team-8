import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { ActiveSession } from '../../types/security';
import { Table } from '@/components/ui/table';
import { Button } from '@/components/ui/button';

const ActiveSessionsTable: React.FC = () => {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);

  const fetchSessions = async () => {
    try {
      const response = await axios.get<ActiveSession[]>('/api/v1/security/sessions');
      setSessions(response.data);
    } catch (err) {
      console.error('Failed to fetch active sessions', err);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const revoke = async (id: string) => {
    try {
      await axios.post(`/api/v1/security/sessions/${id}/revoke`);
      setSessions(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      console.error('Failed to revoke session', err);
    }
  };

  return (
    <div className="p-4 bg-gray-900 text-gray-100 rounded-lg">
      <h2 className="text-xl mb-4">Active Sessions</h2>
      <Table
        data={sessions}
        columns={[
          { header: 'ID', accessor: 'id' },
          { header: 'User', accessor: 'username' },
          { header: 'IP', accessor: 'ipAddress' },
          { header: 'Login Time', accessor: 'loginTime' },
          { header: 'Last Activity', accessor: 'lastActivity' },
          { header: 'Device', accessor: 'device' },
          {
            header: 'Actions',
            accessor: 'id',
            cell: (row: any) => (
              <Button onClick={() => revoke(row.id)} className="bg-red-600 hover:bg-red-700">
                Force Logout
              </Button>
            ),
          },
        ]}
      />
    </div>
  );
};

export default ActiveSessionsTable;
