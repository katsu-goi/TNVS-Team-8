import { useState, useEffect, useRef } from 'react';

export interface LiveActivity {
  id: string;
  user: { name: string; email: string; initials: string; role: 'Admin' | 'Employee' };
  action: string;
  timestamp: Date;
  ip: string;
  device: string;
  isNew: boolean;
}

const USERS = [
  { name: 'John Doe', email: 'john.doe@greengsm.com', role: 'Admin' as const },
  { name: 'Jane Smith', email: 'jane.smith@greengsm.com', role: 'Employee' as const },
  { name: 'Mike Chen', email: 'mike.chen@greengsm.com', role: 'Admin' as const },
  { name: 'Sarah Lee', email: 'sarah.lee@greengsm.com', role: 'Employee' as const },
  { name: 'Alex Rivera', email: 'alex.rivera@greengsm.com', role: 'Employee' as const },
  { name: 'Emily Watson', email: 'emily.watson@greengsm.com', role: 'Admin' as const },
  { name: 'David Kim', email: 'david.kim@greengsm.com', role: 'Employee' as const },
];

const ACTIONS = [
  'Updated Room 102 availability',
  'Logged in via Unified Login',
  'Generated System Report',
  'Modified user permissions for jane.smith',
  'Approved visitor pass for VIP guest',
  'Configured firewall rule IDR-204',
  'Archived document CON-2026-089',
  'Ran database integrity check',
  'Updated integration API key for Zendesk',
  'Triggered manual backup',
  'Resolved security alert AL-4421',
  'Changed system config MAINTENANCE_MODE',
  'Exported audit log report',
  'Created new admin notification',
  'Tested SMTP connection',
  'Synchronized user directory',
  'Cleared expired sessions',
];

const DEVICES = ['Chrome 126 / Windows', 'Firefox 128 / macOS', 'Edge 125 / Windows', 'Safari 17 / iOS', 'Chrome 126 / Linux', 'Mobile App / Android', 'Mobile App / iOS'];
const IPS = ['10.0.1.45', '10.0.1.102', '10.0.2.15', '10.0.2.88', '10.0.3.33', '10.0.3.67', '10.0.1.201', '10.0.4.12'];

let counter = 0;

function generateActivity(): LiveActivity {
  const user = USERS[Math.floor(Math.random() * USERS.length)];
  const action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
  const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase();
  counter++;
  return {
    id: `act-${Date.now()}-${counter}`,
    user: { ...user, initials },
    action,
    timestamp: new Date(),
    ip: IPS[Math.floor(Math.random() * IPS.length)],
    device: DEVICES[Math.floor(Math.random() * DEVICES.length)],
    isNew: true,
  };
}

export function useLiveActivities(maxItems = 15) {
  const [activities, setActivities] = useState<LiveActivity[]>([]);
  const peakRef = useRef(0);

  useEffect(() => {
    const add = () => {
      setActivities(prev => {
        const next = [generateActivity(), ...prev].slice(0, maxItems);
        const online = next.length;
        if (online > peakRef.current) peakRef.current = online;
        return next;
      });
    };

    add();
    const interval = setInterval(add, 3000 + Math.random() * 5000);

    const clearNew = setInterval(() => {
      setActivities(prev => prev.map(a => ({ ...a, isNew: false })));
    }, 3000);

    return () => { clearInterval(interval); clearInterval(clearNew); };
  }, [maxItems]);

  const onlineCount = activities.length;
  const peakToday = peakRef.current;

  return { activities, onlineCount, peakToday };
}
