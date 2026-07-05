import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, Alert, ActivityIndicator, ScrollView, FlatList, Platform } from 'react-native';
import { Header } from '../../components/ui/Header';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { theme } from '../../theme/theme';
import { api, toApiError } from '../../services/api';
import { useNetwork } from '../../hooks/useNetwork';
import { rfidLocalStore } from '../../services/rfidLocalStore';

export default function RFIDPaymentScreen({ route, navigation }: any) {
  const { property, outstanding_paisa } = route.params;
  const isConnected = useNetwork();

  const [outstanding, setOutstanding] = useState(outstanding_paisa || 0);
  const [payAmount, setPayAmount] = useState('');
  const [paymentSource, setPaymentSource] = useState('cash'); // cash|pos|online|waiver
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    fetchPaymentHistory();
  }, []);

  const fetchPaymentHistory = async () => {
    if (!isConnected) return;
    setLoadingHistory(true);
    try {
      const res = (await api.get(`/rfid/payment/history/${property.id}`)) as any;
      if (res) {
        setHistory(res);
      }
    } catch (e) {
      console.warn('Failed to load payment history:', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handlePayment = async () => {
    const amtFloat = parseFloat(payAmount);
    if (isNaN(amtFloat) || amtFloat <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount greater than zero.');
      return;
    }

    const amtPaisa = Math.round(amtFloat * 100);
    if (amtPaisa > outstanding) {
      Alert.alert('Amount Exceeded', 'You cannot collect more than the total outstanding amount: ₹' + (outstanding / 100).toFixed(2));
      return;
    }

    setLoading(true);
    const deviceId = Platform.OS + '-' + (Platform.Version || 'unknown');

    const paymentPayload = {
      property_id: property.id,
      amount_paid_paisa: amtPaisa,
      payment_source: paymentSource,
      remarks: 'Mobile collected',
      collection_device: deviceId,
    };

    try {
      if (!isConnected) {
        // Offline Payment Queue
        const localReceipt = 'RCP-OFFLINE-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        await rfidLocalStore.addToQueue({
          action_type: 'payment',
          payload: paymentPayload,
        });

        setOutstanding((prev: number) => Math.max(0, prev - amtPaisa));
        setPayAmount('');

        Alert.alert(
          'Collected Offline',
          'Payment captured offline.\nReceipt No: ' + localReceipt + '\nThis will sync when connectivity returns.',
          [{ text: 'OK' }]
        );
        setLoading(false);
        return;
      }

      const res = (await api.post('/rfid/payment', paymentPayload)) as any;
      if (res && res.success) {
        Alert.alert(
          'Payment Successful',
          'Receipt Number: ' + res.receipt_number,
          [{ text: 'OK', onPress: () => navigation.popToTop() }]
        );
        if (res.remaining !== undefined) {
          setOutstanding(res.remaining);
        }
        setPayAmount('');
        fetchPaymentHistory();
      }
    } catch (err: any) {
      const apiErr = toApiError(err);
      Alert.alert('Payment Failed', apiErr.message || 'Could not process payment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Payment Collection" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card style={styles.propertyCard}>
          <Text style={styles.ownerName}>{property.owner_first_name} {property.owner_last_name}</Text>
          <Text style={styles.address}>{property.address}</Text>
          <Text style={styles.rfidText}>RFID ID: {property.rfid_id}</Text>
          <Text style={styles.meta}>Zone: {property.zone_name} | Ward: {property.ward_name}</Text>
        </Card>

        <Card style={styles.outstandingCard}>
          <Text style={styles.outstandingLabel}>Outstanding Charges</Text>
          <Text style={styles.outstandingValue}>₹{(outstanding / 100).toFixed(2)}</Text>
        </Card>

        {outstanding > 0 ? (
          <Card style={styles.collectCard}>
            <Text style={styles.sectionTitle}>Collect Payment</Text>
            <View style={styles.field}>
              <Text style={styles.label}>Amount to Collect (₹)</Text>
              <TextInput
                style={styles.input}
                value={payAmount}
                onChangeText={setPayAmount}
                keyboardType="numeric"
                placeholder="Enter amount in Rs"
                placeholderTextColor={theme.colors.textDim}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Payment Source</Text>
              <TextInput
                style={styles.inputReadOnly}
                value={paymentSource.toUpperCase()}
                editable={false}
              />
              <Text style={styles.helperText}>Currently only Cash collections are enabled natively.</Text>
            </View>

            <Button
              title="Confirm Payment Collection"
              loading={loading}
              disabled={!payAmount}
              onPress={handlePayment}
            />
          </Card>
        ) : (
          <Card style={styles.noDuesCard}>
            <Text style={styles.noDuesText}>✓ No outstanding dues for this property.</Text>
          </Card>
        )}

        <Text style={styles.historyTitle}>Payment History</Text>
        {loadingHistory ? (
          <ActivityIndicator size="small" color={theme.colors.primary} />
        ) : history.length > 0 ? (
          history.map((item, idx) => (
            <Card key={idx} style={styles.historyCard}>
              <View style={styles.historyHeader}>
                <Text style={styles.receiptText}>{item.receipt_number}</Text>
                <Text style={styles.historyAmount}>₹{(item.amount_paid_paisa / 100).toFixed(2)}</Text>
              </View>
              <Text style={styles.historyMeta}>
                Paid on: {new Date(item.collected_at).toLocaleDateString()} via {item.payment_source.toUpperCase()}
              </Text>
            </Card>
          ))
        ) : (
          <Text style={styles.noHistoryText}>No past payment transactions recorded.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    padding: 16,
    gap: 16,
  },
  propertyCard: {
    padding: 16,
    gap: 4,
  },
  ownerName: {
    ...theme.typography.heading,
    fontSize: 18,
    color: theme.colors.textDark,
  },
  address: {
    ...theme.typography.secondary,
    color: theme.colors.textDim,
  },
  rfidText: {
    ...theme.typography.secondary,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  meta: {
    ...theme.typography.caption,
    color: theme.colors.textDim,
    marginTop: 4,
  },
  outstandingCard: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  outstandingLabel: {
    ...theme.typography.secondary,
    color: theme.colors.primaryHover,
    fontWeight: '600',
  },
  outstandingValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: theme.colors.success,
  },
  collectCard: {
    padding: 16,
    gap: 16,
  },
  sectionTitle: {
    ...theme.typography.heading,
    fontSize: 16,
    color: theme.colors.textDark,
  },
  field: {
    gap: 6,
  },
  label: {
    ...theme.typography.secondary,
    fontWeight: '600',
    color: theme.colors.textDark,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: theme.colors.textDark,
    backgroundColor: '#FFFFFF',
  },
  inputReadOnly: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: theme.colors.textDim,
    backgroundColor: theme.colors.background,
  },
  helperText: {
    ...theme.typography.caption,
    color: theme.colors.textDim,
  },
  noDuesCard: {
    padding: 16,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
  },
  noDuesText: {
    ...theme.typography.secondary,
    color: theme.colors.success,
    fontWeight: '600',
  },
  historyTitle: {
    ...theme.typography.heading,
    fontSize: 16,
    color: theme.colors.textDark,
    marginTop: 8,
  },
  historyCard: {
    padding: 12,
    gap: 4,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  receiptText: {
    ...theme.typography.secondary,
    fontWeight: '600',
    color: theme.colors.textDark,
  },
  historyAmount: {
    ...theme.typography.secondary,
    fontWeight: '700',
    color: theme.colors.success,
  },
  historyMeta: {
    ...theme.typography.caption,
    color: theme.colors.textDim,
  },
  noHistoryText: {
    ...theme.typography.secondary,
    color: theme.colors.textDim,
    textAlign: 'center',
    paddingVertical: 16,
  },
});
