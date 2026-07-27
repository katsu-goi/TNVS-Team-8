import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { SecurityLog } from '../../types/security';
import { Table } from '@/components/ui/table'; // assumed generic Table component
import { Button } from '@/components/ui/button';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';

interface Filters {
  userId?: string;
  module?: string;
  action?: string;
  riskLevel?: string;
  ipAddress?: string;
  from?: string;
  to?: string;
}

const SecurityLogsTable: React.FC = () => {
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<Filters>({});

  const fetchLogs = async () => {
    try {
      const params: any = {
        page,
        size,
        ...filters,
      };
      const response = await axios.get<{ content: SecurityLog[]; totalElements: number }>('/api/v1/security/logs', { params });
      setLogs(response.data.content);
      setTotal(response.data.totalElements);
    } catch (err) {
      console.error('Failed to fetch security logs', err);
    }
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, size, filters]);

  const exportCsv = () => {
    const header = ['ID', 'User ID', 'Full Name', 'Role', 'Module', 'Action', 'Timestamp', 'IP', 'Browser', 'OS', 'Device', 'Risk', 'Status'];
    const rows = logs.map(l => [
      l.id,
      l.userId,
      l.fullName,
      l.role,
      l.module,
      l.action,
      l.timestamp,
      l.ipAddress,
      l.browser ?? '',
      l.os ?? '',
      l.device ?? '',
      l.riskLevel ?? '',
      l.status ?? ''
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'SecurityLogs');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    saveAs(blob, 'security_logs.xlsx');
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value || undefined }));
  };

  return (
    <div className="p-4 bg-gray-900 text-gray-100 rounded-lg">
      <h2 className="text-xl mb-4">Security Activity Logs</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4">
        <input placeholder="User ID" name="userId" onChange={handleFilterChange} className="input" />
        <input placeholder="Module" name="module" onChange={handleFilterChange} className="input" />
        <input placeholder="Action" name="action" onChange={handleFilterChange} className="input" />
        <input placeholder="Risk Level" name="riskLevel" onChange={handleFilterChange} className="input" />
        <input placeholder="IP Address" name="ipAddress" onChange={handleFilterChange} className="input" />
        <input type="date" name="from" onChange={handleFilterChange} className="input" />
        <input type="date" name="to" onChange={handleFilterChange} className="input" />
        <Button onClick={exportCsv}>Export Excel</Button>
      </div>
      <Table data={logs} columns={[
        { header: 'ID', accessor: 'id' },
        { header: 'User', accessor: 'fullName' },
        { header: 'Module', accessor: 'module' },
        { header: 'Action', accessor: 'action' },
        { header: 'Time', accessor: 'timestamp' },
        { header: 'IP', accessor: 'ipAddress' },
        { header: 'Risk', accessor: 'riskLevel' },
        { header: 'Status', accessor: 'status' },
      ]} />
      <div className="flex justify-between mt-4">
        <Button disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</Button>
        <span>Page {page + 1} of {Math.ceil(total / size)}</span>
        <Button disabled={(page + 1) * size >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
      </div>
    </div>
  );
};

export default SecurityLogsTable;
