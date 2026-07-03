import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAttendanceReport } from '../hooks/useAttendanceReport';
import type {
  AttendanceReportRecord,
  AttendanceStatus,
  ApiError,
} from '../types';
import StatusBadge from './StatusBadge';
import DatePicker from './ui/DatePicker';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300; // Req 12.2

const STATUS_OPTIONS: Array<{ key: AttendanceStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'present', label: 'Present' },
  { key: 'absent', label: 'Absent' },
  { key: 'late', label: 'Late' },
  { key: 'leave', label: 'Leave' },
];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function formatTime(value?: string): string {
  if (!value) return '—';
  // Render an ISO timestamp as HH:MM; otherwise show the raw value as-is.
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime()) && /[T\s]\d{2}:\d{2}/.test(value)) {
    const hh = String(parsed.getHours()).padStart(2, '0');
    const mm = String(parsed.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  return value;
}

/**
 * Read-only attendance report list wired to the backend (Req 6.1-6.5, 6.7).
 *
 * Renders each record's status, check-in, check-out, date, and employee name
 * with a 300ms-debounced search (Req 12.2), status + date filters (Req 6.3,
 * 6.4), and page navigation (Req 6.5). The backend scopes results to the
 * caller's role from the JWT, so this component is role-agnostic and is reused
 * by the supervisor and zone-manager attendance screens. Shows an Empty_State
 * when an authorized request returns no records (Req 6.7).
 */
export default function AttendanceReportView() {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | 'all'>('all');
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [page, setPage] = useState(1);

  // Debounce the search term so a burst of keystrokes issues at most one
  // request per 300ms of inactivity (Req 12.2).
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const formattedDate = useMemo(() => {
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, [selectedDate]);

  // Reset to the first page whenever any filter changes so pagination stays
  // consistent with the active filter set (Req 6.5).
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, formattedDate]);

  const params = useMemo(
    () => ({
      page,
      page_size: PAGE_SIZE,
      search: debouncedSearch || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
      date: formattedDate,
    }),
    [page, debouncedSearch, statusFilter, formattedDate]
  );

  const { data, isLoading, isError, error, refetch, isFetching } =
    useAttendanceReport(params);

  const records = data?.items ?? [];
  const totalPages = data?.total_pages ?? 0;
  const canPrev = page > 1;
  const canNext = totalPages > 0 && page < totalPages;

  const renderItem = ({ item }: { item: AttendanceReportRecord }) => (
    <View style={styles.recordCard}>
      <View style={styles.recordHeader}>
        <Text style={styles.employeeName} numberOfLines={1}>
          {item.employee_name}
        </Text>
        <StatusBadge status={item.status} />
      </View>
      <Text style={styles.recordDate}>{item.date}</Text>
      <View style={styles.timesRow}>
        <View style={styles.timeItem}>
          <Text style={styles.timeLabel}>Check-in</Text>
          <Text style={styles.timeValue}>{formatTime(item.check_in)}</Text>
        </View>
        <View style={styles.timeItem}>
          <Text style={styles.timeLabel}>Check-out</Text>
          <Text style={styles.timeValue}>{formatTime(item.check_out)}</Text>
        </View>
      </View>
    </View>
  );

  const renderListContent = () => {
    if (isLoading) {
      return (
        <View style={styles.stateContainer}>
          <ActivityIndicator size="large" color="#1565C0" />
          <Text style={styles.stateText}>Loading attendance…</Text>
        </View>
      );
    }

    if (isError) {
      const apiError = error as unknown as ApiError | undefined;
      const message =
        apiError?.kind === 'forbidden'
          ? 'You are not authorized to view these records.'
          : apiError?.message || 'Failed to load attendance records.';
      return (
        <View style={styles.stateContainer}>
          <Ionicons name="alert-circle-outline" size={40} color="#C62828" />
          <Text style={styles.stateText}>{message}</Text>
          {apiError?.kind !== 'forbidden' && (
            <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    // Empty_State when an authorized request returns no records (Req 6.7).
    return (
      <View style={styles.stateContainer}>
        <Ionicons name="document-text-outline" size={40} color="#9e9e9e" />
        <Text style={styles.stateText}>No attendance records found.</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search (debounced) */}
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={18} color="#757575" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by employee name"
          placeholderTextColor="#9e9e9e"
          value={searchInput}
          onChangeText={setSearchInput}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searchInput.length > 0 && (
          <TouchableOpacity onPress={() => setSearchInput('')}>
            <Ionicons name="close-circle" size={18} color="#9e9e9e" />
          </TouchableOpacity>
        )}
      </View>

      {/* Status filter chips */}
      <View style={styles.chipsRow}>
        {STATUS_OPTIONS.map((opt) => {
          const active = statusFilter === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setStatusFilter(opt.key)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Date filter */}
      <View style={{ marginHorizontal: 16, marginTop: 12 }}>
        <DatePicker
          value={selectedDate}
          onChange={setSelectedDate}
          label="Filter by Date"
        />
      </View>

      <FlatList
        data={records}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={
          records.length === 0 ? styles.emptyListContent : styles.listContent
        }
        ListEmptyComponent={renderListContent()}
        keyboardShouldPersistTaps="handled"
      />

      {/* Pagination controls */}
      {records.length > 0 && totalPages > 1 && (
        <View style={styles.pagination}>
          <TouchableOpacity
            style={[styles.pageButton, !canPrev && styles.pageButtonDisabled]}
            onPress={() => canPrev && setPage((p) => p - 1)}
            disabled={!canPrev}
          >
            <Ionicons
              name="chevron-back"
              size={18}
              color={canPrev ? '#1565C0' : '#bdbdbd'}
            />
            <Text style={[styles.pageButtonText, !canPrev && styles.pageButtonTextDisabled]}>
              Prev
            </Text>
          </TouchableOpacity>

          <View style={styles.pageIndicatorRow}>
            {isFetching && <ActivityIndicator size="small" color="#1565C0" />}
            <Text style={styles.pageIndicator}>
              Page {page} of {totalPages}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.pageButton, !canNext && styles.pageButtonDisabled]}
            onPress={() => canNext && setPage((p) => p + 1)}
            disabled={!canNext}
          >
            <Text style={[styles.pageButtonText, !canNext && styles.pageButtonTextDisabled]}>
              Next
            </Text>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={canNext ? '#1565C0' : '#bdbdbd'}
            />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginTop: 12,
    height: 48,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: '#212121',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    marginTop: 12,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  chipActive: {
    backgroundColor: '#1565C0',
    borderColor: '#1565C0',
  },
  chipText: {
    fontSize: 13,
    color: '#616161',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#ffffff',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginTop: 12,
    height: 48,
  },
  dateInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: '#212121',
  },
  listContent: {
    padding: 16,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  recordCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  employeeName: {
    flex: 1,
    marginRight: 8,
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
  },
  recordDate: {
    marginTop: 6,
    fontSize: 13,
    color: '#757575',
  },
  timesRow: {
    flexDirection: 'row',
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
  },
  timeItem: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 12,
    color: '#9e9e9e',
    marginBottom: 2,
  },
  timeValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#212121',
  },
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  stateText: {
    marginTop: 12,
    fontSize: 14,
    color: '#616161',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#1565C0',
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#ffffff',
  },
  pageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pageButtonDisabled: {
    opacity: 0.6,
  },
  pageButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1565C0',
    marginHorizontal: 2,
  },
  pageButtonTextDisabled: {
    color: '#bdbdbd',
  },
  pageIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pageIndicator: {
    fontSize: 13,
    color: '#616161',
  },
});
