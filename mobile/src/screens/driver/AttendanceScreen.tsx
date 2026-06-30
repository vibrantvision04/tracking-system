import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { theme } from '../../theme/theme';
import { useTranslation } from '../../i18n/useTranslation';

interface AttendanceRecord {
  id: string;
  employee_name: string;
  date: string;
  status: string;
  check_in: string;
  check_out?: string;
}

interface AttendancePage {
  items: AttendanceRecord[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  present: { bg: '#E8F5E9', color: '#2E7D32', label: 'Present' },
  late: { bg: '#FFF8E1', color: '#F57F17', label: 'Late' },
  absent: { bg: '#FFEBEE', color: '#C62828', label: 'Absent' },
  leave: { bg: '#E3F2FD', color: '#1565C0', label: 'Leave' },
};

export default function DriverAttendanceScreen({ navigation }: any) {
  const { t } = useTranslation();
  const PAGE_SIZE = 15;

  // Fetch paginated attendance records for the driver (backend scopes to own records)
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = useInfiniteQuery<AttendancePage>({
    queryKey: ['driverAttendance'],
    queryFn: async ({ pageParam = 1 }) => {
      const res = await api.get(`/attendance/list?page=${pageParam}&page_size=${PAGE_SIZE}&from_date=2024-01-01&to_date=2030-12-31`);
      return res as unknown as AttendancePage;
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.page < lastPage.total_pages) return lastPage.page + 1;
      return undefined;
    },
    initialPageParam: 1,
  });

  const allRecords = data?.pages.flatMap((p) => p.items) ?? [];
  const totalRecords = data?.pages[0]?.total ?? 0;

  // Compute attendance score
  const presentCount = allRecords.filter((r) => r.status === 'present').length;
  const lateCount = allRecords.filter((r) => r.status === 'late').length;
  const absentCount = allRecords.filter((r) => r.status === 'absent').length;
  const attendanceScore = totalRecords > 0 ? Math.round(((presentCount + lateCount) / totalRecords) * 100) : 0;

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '--:--';
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const renderRecord = ({ item }: { item: AttendanceRecord }) => {
    const style = STATUS_STYLE[item.status] || STATUS_STYLE.absent;
    return (
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <Text style={styles.dateText}>{formatDate(item.date)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: style.bg }]}>
            <Text style={[styles.statusText, { color: style.color }]}>{style.label}</Text>
          </View>
        </View>
        <View style={styles.timeRow}>
          <Text style={styles.timeLabel}>In: <Text style={styles.timeValue}>{formatTime(item.check_in)}</Text></Text>
          {item.check_out && (
            <Text style={styles.timeLabel}>Out: <Text style={styles.timeValue}>{formatTime(item.check_out)}</Text></Text>
          )}
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading attendance...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Failed to load attendance</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Attendance</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Score Card */}
      <View style={styles.scoreCard}>
        <View style={styles.scoreMain}>
          <Text style={styles.scoreValue}>{attendanceScore}%</Text>
          <Text style={styles.scoreLabel}>Attendance Score</Text>
        </View>
        <View style={styles.scoreBreakdown}>
          <View style={styles.scoreStat}>
            <Text style={[styles.scoreStatValue, { color: '#2E7D32' }]}>{presentCount}</Text>
            <Text style={styles.scoreStatLabel}>Present</Text>
          </View>
          <View style={styles.scoreStat}>
            <Text style={[styles.scoreStatValue, { color: '#F57F17' }]}>{lateCount}</Text>
            <Text style={styles.scoreStatLabel}>Late</Text>
          </View>
          <View style={styles.scoreStat}>
            <Text style={[styles.scoreStatValue, { color: '#C62828' }]}>{absentCount}</Text>
            <Text style={styles.scoreStatLabel}>Absent</Text>
          </View>
        </View>
      </View>

      {/* Record list */}
      {allRecords.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No attendance records found</Text>
        </View>
      ) : (
        <FlatList
          data={allRecords}
          keyExtractor={(item) => item.id}
          renderItem={renderRecord}
          contentContainerStyle={styles.list}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginVertical: 16 }} />
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#616161', fontWeight: '600' },
  errorText: { fontSize: 16, color: '#C62828', marginBottom: 12 },
  retryBtn: { backgroundColor: theme.colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: 'bold' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 48, paddingBottom: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0',
  },
  backText: { color: theme.colors.primary, fontWeight: 'bold', fontSize: 16 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#212121' },
  scoreCard: {
    backgroundColor: '#fff', margin: 16, borderRadius: 12, padding: 16, elevation: 2,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  scoreMain: { alignItems: 'center', marginBottom: 16 },
  scoreValue: { fontSize: 36, fontWeight: 'bold', color: theme.colors.primary },
  scoreLabel: { fontSize: 13, color: '#616161', marginTop: 4 },
  scoreBreakdown: { flexDirection: 'row', justifyContent: 'space-around' },
  scoreStat: { alignItems: 'center' },
  scoreStatValue: { fontSize: 20, fontWeight: 'bold' },
  scoreStatLabel: { fontSize: 11, color: '#9e9e9e', marginTop: 2 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  card: {
    backgroundColor: '#fff', borderRadius: 8, padding: 14, marginBottom: 10, elevation: 1,
    shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  dateText: { fontSize: 14, fontWeight: '600', color: '#212121' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: 'bold' },
  timeRow: { flexDirection: 'row', gap: 16 },
  timeLabel: { fontSize: 12, color: '#9e9e9e' },
  timeValue: { fontWeight: '600', color: '#424242' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { fontSize: 14, color: '#9e9e9e' },
});
