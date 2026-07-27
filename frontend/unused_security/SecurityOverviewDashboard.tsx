import React, { useEffect, useState } from 'react';
import { SecurityOverview } from '../../types/security';
import axios from 'axios';
import { Card } from '@/components/ui/card'; // assuming a Card component exists

const SecurityOverviewDashboard: React.FC = () => {
  const [overview, setOverview] = useState<SecurityOverview | null>(null);

  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const response = await axios.get<SecurityOverview>('/api/v1/security/overview');
        setOverview(response.data);
      } catch (err) {
        console.error('Failed to fetch security overview', err);
      }
    };
    fetchOverview();
  }, []);

  if (!overview) return <div className="text-gray-400">Loading security overview...</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card title="Total Events" value={overview.totalEvents} />
      <Card title="Failed Logins" value={overview.failedLogins} />
      <Card title="Active Sessions" value={overview.activeSessions} />
      <Card title="Blocked IPs" value={overview.blockedIps} />
      <Card title="Open Alerts" value={overview.openAlerts} />
    </div>
  );
};

export default SecurityOverviewDashboard;
