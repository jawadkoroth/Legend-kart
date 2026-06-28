'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ChevronUp,
  ChevronDown,
  Columns,
  Download,
  Copy,
  CheckSquare,
  Square,
  Search,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

export interface AdminTableColumn<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
  width?: number; // width in pixels
}

interface BulkAction<T> {
  label: string;
  onClick: (selectedRows: T[]) => void;
  icon?: React.ComponentType<any>;
}

interface AdminTableProps<T> {
  columns: AdminTableColumn<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  bulkActions?: BulkAction<T>[];
  
  // Pagination
  total?: number;
  limit?: number;
  offset?: number;
  onPageChange?: (offset: number) => void;
}

export default function AdminTable<T extends { id: string | number }>({
  columns: initialColumns,
  data,
  loading = false,
  emptyMessage = 'No matching records found.',
  searchPlaceholder = 'Search rows...',
  bulkActions = [],
  total = 0,
  limit = 20,
  offset = 0,
  onPageChange
}: AdminTableProps<T>) {
  // Columns visibility & sizes
  const [columns, setColumns] = useState<AdminTableColumn<T>[]>(initialColumns);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(initialColumns.map(c => c.key));
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [showColumnToggle, setShowColumnToggle] = useState(false);
  
  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
  
  // Sorting & Filtering local state
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Keyboard focus index
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);
  const tableRef = useRef<HTMLTableSectionElement>(null);
  const activeResizerRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  // Sync initial columns
  useEffect(() => {
    setColumns(initialColumns);
    const initialWidths: Record<string, number> = {};
    initialColumns.forEach(c => {
      initialWidths[c.key] = c.width || 120;
    });
    setColumnWidths(initialWidths);
    setVisibleColumns(initialColumns.map(c => c.key));
  }, [initialColumns]);

  // Bulk actions row selection
  const handleSelectRow = (id: string | number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === data.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.map(r => r.id)));
    }
  };

  const handleSort = (key: string, sortable?: boolean) => {
    if (!sortable) return;
    if (sortKey === key) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  // Local Sort + Search fallback
  const processedData = useMemo(() => {
    let result = [...data];

    // local search (if client-side)
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(row => 
        Object.values(row).some(val => 
          val !== null && val !== undefined && String(val).toLowerCase().includes(q)
        )
      );
    }

    // local sort
    if (sortKey) {
      result.sort((a: any, b: any) => {
        const valA = a[sortKey];
        const valB = b[sortKey];
        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;
        
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortDirection === 'asc' ? valA - valB : valB - valA;
        }
        return sortDirection === 'asc'
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      });
    }

    return result;
  }, [data, searchQuery, sortKey, sortDirection]);

  // Resize handler mouse events
  const handleMouseDown = (key: string, e: React.MouseEvent) => {
    e.preventDefault();
    activeResizerRef.current = {
      key,
      startX: e.clientX,
      startWidth: columnWidths[key] || 120
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!activeResizerRef.current) return;
    const { key, startX, startWidth } = activeResizerRef.current;
    const deltaX = e.clientX - startX;
    const newWidth = Math.max(50, startWidth + deltaX);
    
    setColumnWidths(prev => ({
      ...prev,
      [key]: newWidth
    }));
  };

  const handleMouseUp = () => {
    activeResizerRef.current = null;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  // Keyboard navigation logic
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (focusedRowIndex === null) return;
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedRowIndex(prev => (prev !== null && prev < processedData.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedRowIndex(prev => (prev !== null && prev > 0 ? prev - 1 : prev));
      } else if (e.key === 'Space') {
        e.preventDefault();
        const row = processedData[focusedRowIndex];
        if (row) handleSelectRow(row.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedRowIndex, processedData]);

  // CSV Exporter
  const exportToCSV = () => {
    if (processedData.length === 0) return;
    const headers = columns.filter(c => visibleColumns.includes(c.key)).map(c => c.label).join(',');
    const rows = processedData.map(row => 
      columns
        .filter(c => visibleColumns.includes(c.key))
        .map(c => {
          const val = (row as any)[c.key];
          return `"${String(val || '').replace(/"/g, '""')}"`;
        })
        .join(',')
    );
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `noir_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Copy rows to clipboard (TSV format)
  const copyToClipboard = () => {
    if (processedData.length === 0) return;
    const headers = columns.filter(c => visibleColumns.includes(c.key)).map(c => c.label).join('\t');
    const rows = processedData.map(row => 
      columns
        .filter(c => visibleColumns.includes(c.key))
        .map(c => String((row as any)[c.key] || '').replace(/\t/g, ' '))
        .join('\t')
    );
    const text = [headers, ...rows].join('\n');
    navigator.clipboard.writeText(text).then(() => {
      alert('Selected columns copied to clipboard.');
    });
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  const handlePageClick = (pageNum: number) => {
    if (onPageChange) {
      onPageChange((pageNum - 1) * limit);
    }
  };

  const selectedRowsData = processedData.filter(r => selectedIds.has(r.id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
      
      {/* Table Header controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        
        {/* Search */}
        <div className="admin-search-input-wrapper" style={{ flex: 1, maxWidth: '320px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="admin-search-input"
            style={{ paddingLeft: '36px' }}
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Buttons (Export, Copy, Column toggle) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={exportToCSV} className="btn btn-secondary btn-sm" title="Export CSV" style={{ height: '38px', padding: '0 12px' }}>
            <Download size={14} /> <span style={{ marginLeft: '4px', fontSize: '0.75rem' }}>CSV</span>
          </button>
          <button onClick={copyToClipboard} className="btn btn-secondary btn-sm" title="Copy to Clipboard" style={{ height: '38px', padding: '0 12px' }}>
            <Copy size={14} /> <span style={{ marginLeft: '4px', fontSize: '0.75rem' }}>Copy</span>
          </button>
          
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowColumnToggle(!showColumnToggle)} className="btn btn-secondary btn-sm" style={{ height: '38px', padding: '0 12px' }}>
              <Columns size={14} /> <span style={{ marginLeft: '4px', fontSize: '0.75rem' }}>Columns</span>
            </button>
            {showColumnToggle && (
              <div style={{
                position: 'absolute', right: 0, top: '44px', background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px',
                zIndex: 40, display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '160px',
                boxShadow: 'var(--shadow-md)'
              }}>
                {columns.map(c => (
                  <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                    <input
                      type="checkbox"
                      checked={visibleColumns.includes(c.key)}
                      onChange={() => {
                        setVisibleColumns(prev => 
                          prev.includes(c.key) ? prev.filter(x => x !== c.key) : [...prev, c.key]
                        );
                      }}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bulk actions banner */}
      {selectedIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '16px', padding: '8px 16px',
          background: 'rgba(201,168,106,0.1)', border: '1px solid var(--accent-gold)',
          borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.8rem'
        }}>
          <strong>{selectedIds.size} row(s) selected</strong>
          <div style={{ display: 'flex', gap: '8px' }}>
            {bulkActions.map((action, i) => {
              const ActionIcon = action.icon;
              return (
                <button
                  key={i}
                  onClick={() => action.onClick(selectedRowsData)}
                  className="btn btn-secondary btn-sm"
                  style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)', height: '28px', padding: '0 10px', fontSize: '0.75rem' }}
                >
                  {ActionIcon && <ActionIcon size={12} style={{ marginRight: '4px' }} />}
                  {action.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Table grid layout wrapper */}
      <div className="admin-table-wrapper" style={{ maxHeight: '600px', overflowY: 'auto' }}>
        <table>
          <thead className="admin-table-header">
            <tr>
              {/* Checkbox selector th */}
              <th style={{ width: '40px', padding: '12px' }}>
                <button onClick={handleSelectAll} style={{ color: 'var(--text-secondary)' }}>
                  {selectedIds.size === data.length ? <CheckSquare size={16} /> : <Square size={16} />}
                </button>
              </th>
              
              {/* Normal column headers */}
              {columns
                .filter(c => visibleColumns.includes(c.key))
                .map((c) => (
                  <th
                    key={c.key}
                    onClick={() => handleSort(c.key, c.sortable)}
                    style={{
                      width: columnWidths[c.key] || 'auto',
                      cursor: c.sortable ? 'pointer' : 'default',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {c.label}
                      {c.sortable && sortKey === c.key && (
                        sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                      )}
                    </div>
                    {/* Resizer overlay */}
                    <div
                      className="admin-th-resize-handle"
                      onMouseDown={(e) => handleMouseDown(c.key, e)}
                    />
                  </th>
                ))}
            </tr>
          </thead>
          
          <tbody ref={tableRef}>
            {loading ? (
              Array.from({ length: 5 }).map((_, rIdx) => (
                <tr key={rIdx} className="admin-table-row">
                  <td style={{ padding: '14px' }}><div className="skeleton" style={{ height: '20px', width: '20px' }} /></td>
                  {columns
                    .filter(c => visibleColumns.includes(c.key))
                    .map((c, cIdx) => (
                      <td key={cIdx} style={{ padding: '14px' }}>
                        <div className="skeleton" style={{ height: '18px', width: `${60 + (cIdx * 15) % 40}%` }} />
                      </td>
                    ))}
                </tr>
              ))
            ) : processedData.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + 1}>
                  <div className="admin-empty-state">
                    <p className="admin-empty-title">{emptyMessage}</p>
                    <p className="admin-empty-desc">Check your search criteria or add new items.</p>
                  </div>
                </td>
              </tr>
            ) : (
              processedData.map((row, rIdx) => {
                const isSelected = selectedIds.has(row.id);
                const isFocused = rIdx === focusedRowIndex;
                return (
                  <tr
                    key={row.id}
                    className="admin-table-row"
                    onClick={() => setFocusedRowIndex(rIdx)}
                    style={{
                      backgroundColor: isFocused ? 'rgba(255,255,255,0.015)' : undefined,
                      outline: isFocused ? '1px dashed var(--accent-gold)' : 'none'
                    }}
                  >
                    {/* Checkbox column */}
                    <td style={{ padding: '12px' }}>
                      <button onClick={() => handleSelectRow(row.id)} style={{ color: isSelected ? 'var(--accent-gold)' : 'var(--text-muted)' }}>
                        {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                      </button>
                    </td>

                    {/* Column cells */}
                    {columns
                      .filter(c => visibleColumns.includes(c.key))
                      .map((c) => (
                        <td key={c.key}>
                          {c.render ? c.render(row) : String((row as any)[c.key] ?? '—')}
                        </td>
                      ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      {!loading && total > 0 && totalPages > 1 && (
        <div className="admin-pagination-row">
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Showing {offset + 1} to {Math.min(offset + limit, total)} of {total} records
          </span>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={() => handlePageClick(currentPage - 1)}
              disabled={currentPage === 1}
              className="btn btn-secondary btn-sm"
              style={{ height: '32px', width: '32px', padding: 0 }}
            >
              <ChevronLeft size={14} />
            </button>
            
            {Array.from({ length: totalPages }).map((_, i) => {
              const pageNum = i + 1;
              const isCurrent = pageNum === currentPage;
              return (
                <button
                  key={pageNum}
                  onClick={() => handlePageClick(pageNum)}
                  style={{
                    height: '32px',
                    width: '32px',
                    padding: 0,
                    borderColor: isCurrent ? 'var(--accent-gold)' : 'var(--border-color)',
                    background: isCurrent ? 'rgba(201,168,106,0.1)' : 'transparent',
                    color: isCurrent ? 'var(--accent-gold)' : 'var(--text-primary)'
                  }}
                  className="btn btn-secondary btn-sm"
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              onClick={() => handlePageClick(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="btn btn-secondary btn-sm"
              style={{ height: '32px', width: '32px', padding: 0 }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
