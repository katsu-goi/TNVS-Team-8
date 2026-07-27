import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { SecurityAlert } from '../../types/security';
import { Table } from '@/components/ui/table';
import { Button } from '@/components/ui/button';

const AlertsPanel: React.FC = () => {
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);

  // Initial load
  const fetchAlerts = async () => {
    try {
      const response = await axios.get<SecurityAlert[]>('/api/v1/security/alerts');
      setAlerts(response.data);
    } catch (err) {
      console.error('Failed to fetch alerts', err);
    }
  };

  // Real‑time updates via SSE (assuming endpoint /api/v1/security/alerts/stream)
  useEffect(() => {
    fetchAlerts();
    const eventSource = new EventSource('/api/v1/security/alerts/stream');
    eventSource.onmessage = e => {
      try {
        const alert: SecurityAlert = JSON.parse(e.data);
        setAlerts(prev => [alert, ...prev]);
      } catch (parseErr) {
        console.error('Failed to parse SSE alert', parseErr);
      }
    };
    eventSource.onerror = err => {
      console.error('SSE connection error', err);
      eventSource.close();
    };
    return () => {
      eventSource.close();
    };
  }, []);

  const acknowledge = async (id: number) => {
    try {
      await axios.post(`/api/v1/security/alerts/${id}/acknowledge`);
      setAlerts(prev => prev.map(a => (a.id === id ? { ...a, status: 'ACKNOWLEDGED' } : a)));
    } catch (err) {
      console.error('Failed to acknowledge alert', err);
    }
  };

  return (
    <div className="p-4 bg-gray-900 text-gray-100 rounded-lg">
      <h2 className="text-xl mb-4">Security Alerts</h2>
      <Table
        data={alerts}
        columns={[
          { header: 'ID', accessor: 'id' },
          { header: 'Severity', accessor: 'severity' },
          { header: 'Type', accessor: 'alertType' },
          { header: 'Module', accessor: 'module' },
          { header: 'Description', accessor: 'description' },
          { header: 'Time', accessor: 'timestamp' },
          { header: 'Status', accessor: 'status' },
          {
            header: 'Actions',
            accessor: 'id',
            cell: (row: any) => (
              <Button onClick={() => acknowledge(row.id)} disabled={row.status !== 'OPEN'}>
                Acknowledge
              </Button>
            ),
          },
        ]}
      />
    </div>
  );
};

export default AlertsPanel;
