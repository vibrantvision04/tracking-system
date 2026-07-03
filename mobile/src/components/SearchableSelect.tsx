import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme/theme';

export interface SelectOption {
  /** Value returned on selection. */
  value: string;
  /** Primary text shown in the field and list. */
  label: string;
  /** Optional secondary line (e.g. vehicle number / employee id). */
  sublabel?: string;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string | null;
  onSelect: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Optional accessibility label for the field. */
  accessibilityLabel?: string;
}

/**
 * Reusable searchable dropdown for React Native. Opens a modal with a search
 * box and a filtered, scrollable list. Filtering matches both label and
 * sublabel (e.g. driver name OR vehicle number).
 */
export default function SearchableSelect({
  options,
  value,
  onSelect,
  placeholder = 'Select an option',
  searchPlaceholder = 'Search...',
  accessibilityLabel,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selected = useMemo(
    () => options.find((o) => o.value === value) || null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sublabel ? o.sublabel.toLowerCase().includes(q) : false)
    );
  }, [options, search]);

  const close = () => {
    setOpen(false);
    setSearch('');
  };

  return (
    <>
      <Pressable
        style={styles.field}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || placeholder}
      >
        <Text style={[styles.fieldText, !selected && styles.placeholderText]} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={theme.colors.textDim} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.overlay} onPress={close}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color={theme.colors.textDim} />
              <TextInput
                style={styles.searchInput}
                placeholder={searchPlaceholder}
                placeholderTextColor={theme.colors.textDim}
                value={search}
                onChangeText={setSearch}
                autoFocus
                autoCorrect={false}
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={theme.colors.textDim} />
                </Pressable>
              )}
            </View>

            <FlatList
              data={filtered}
              keyExtractor={(item) => item.value}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No results found</Text>
              }
              renderItem={({ item }) => {
                const isSel = item.value === value;
                return (
                  <Pressable
                    style={[styles.item, isSel && styles.itemSelected]}
                    onPress={() => {
                      onSelect(item.value);
                      close();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemLabel} numberOfLines={1}>{item.label}</Text>
                      {!!item.sublabel && (
                        <Text style={styles.itemSublabel} numberOfLines={1}>{item.sublabel}</Text>
                      )}
                    </View>
                    {isSel && <Ionicons name="checkmark" size={18} color={theme.colors.primary} />}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    height: theme.sizes.inputHeight,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.input,
    paddingHorizontal: theme.spacing.base,
    backgroundColor: theme.colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldText: {
    flex: 1,
    fontSize: theme.typography.secondary.fontSize,
    color: theme.colors.textDark,
    marginRight: theme.spacing.sm,
  },
  placeholderText: {
    color: theme.colors.textDim,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: theme.spacing.base,
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.card,
    maxHeight: '70%',
    overflow: 'hidden',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  } as any,
  searchInput: {
    flex: 1,
    fontSize: theme.typography.secondary.fontSize,
    color: theme.colors.textDark,
    padding: 0,
  },
  list: {
    flexGrow: 0,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.background,
    minHeight: theme.sizes.touchTarget,
  },
  itemSelected: {
    backgroundColor: theme.colors.background,
  },
  itemLabel: {
    fontSize: theme.typography.secondary.fontSize,
    color: theme.colors.textDark,
    fontWeight: '600',
  },
  itemSublabel: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.colors.textDim,
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    color: theme.colors.textDim,
    padding: theme.spacing.xl,
    fontSize: theme.typography.secondary.fontSize,
  },
});
