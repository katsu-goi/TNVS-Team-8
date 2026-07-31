import { useState } from 'react';

export interface LiveActivity {
  id: string;
  user: { name: string; email: string; initials: string; role: 'Admin' | 'Employee' };
  action: string;
  timestamp: Date;
  ip: string;
  device: string;
  isNew: boolean;
}

export function useLiveActivities() {
  const [activities] = useState<LiveActivity[]>([]);

  const onlineCount = activities.length;
  const peakToday = 0;

  return { activities, onlineCount, peakToday };
}
