import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
  Image,
  Alert,
  Modal,
  Switch,
} from 'react-native';
import { router } from 'expo-router';
import {
  ChevronLeft,
  Package,
  Search,
  X,
  Trash2,
  Store,
  DollarSign,
  Calendar,
  AlertTriangle,
  Star,
  Pencil,
  Download,
  FileText,
  CheckSquare,
  Square,
  ListFilter,
  ArrowUpDown,
  Tag,
  Boxes,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text, ArabicTextInput as TextInputArabic } from '@/components/ArabicText';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';
import { ProductImagesEditor } from '@/components/ProductImagesEditor';
import {
  fetchProductImages,
  saveProductImages,
  toEditableImages,
  type EditableImage,
} from '@/lib/productImages';
import { downloadCSV, buildCSV, exportPDF, buildHTMLTable } from '@/lib/export';
import { CategoryPickerModal } from '@/components/CategoryPickerModal';
import { getCategoryPathLabel } from '@/lib/categories';

const ADMIN_API_BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/admin-api`;

type Product = {
  id: string;
  name: string;
  price: string;
  compare_at_price: string | null;
  category: string;
  category_id: string | null;
  category_name: string;
  status: 'active' | 'draft' | 'archived' | string;
  is_featured: boolean;
  is_new: boolean;
  sku: string;
  rating: number;
  review_count: number;
  image_url: string | null;
  stock: number;
  merchant_id: string | null;
  created_at: string;
  merchant?: { id: string; full_name: string; email: string } | null;
};

type Category = {
  id: string;
  name: string;
  slug?: string;
  image_url?: string | null;
  parent_id?: string | null;
  sort_order?: number;
  is_active?: boolean;
};

type StatusFilter = 'all' | 'active' | 'draft' | 'archived';
type StockFilter = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';
type SortKey = 'newest' | 'oldest' | 'price_high' | 'price_low' | 'name_az' | 'stock_low';

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'All Status', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Draft', value: 'draft' },
  { label: 'Archived', value: 'archived' },
];

const STOCK_FILTERS: { label: string; value: StockFilter }[] = [
  { label: 'All Stock', value: 'all' },
  { label: 'In Stock', value: 'in_stock' },
  { label: 'Low Stock', value: 'low_stock' },
  { label: 'Out of Stock', value: 'out_of_stock' },
];

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: 'Newest First', value: 'newest' },
  { label: 'Oldest First', value: 'oldest' },
  { label: 'Price: High to Low', value: 'price_high' },
  { label: 'Price: Low to High', value: 'price_low' },
  { label: 'Name: A-Z', value: 'name_az' },
  { label: 'Stock: Low to High', value: 'stock_low' },
];

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  active: { color: colors.success[700], bg: colors.success[50], label: 'Active' },
  draft: { color: colors.warning[700], bg: colors.warning[50], label: 'Draft' },
  archived: { color: colors.neutral[600], bg: colors.neutral[200], label: 'Archived' },
};

export default function AdminProductsScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [merchantFilter, setMerchantFilter] = useState<string>('all');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [sortMenuVisible, setSortMenuVisible] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Edit
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState({
    name: '', price: '', compare_at_price: '', category_id: '', status: 'active', is_featured: false,
  });
  const [saving, setSaving] = useState(false);
  const [editImages, setEditImages] = useState<EditableImage[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);

  // Selection / bulk actions
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [togglingFeaturedId, setTogglingFeaturedId] = useState<string | null>(null);

  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    };
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const [productsRes, categoriesRes] = await Promise.all([
        fetch(`${ADMIN_API_BASE}/products`, { headers }),
        supabase.from('categories').select('id, name, slug, image_url, parent_id, sort_order, is_active').order('sort_order', { ascending: true }),
      ]);
      if (!productsRes.ok) {
        const err = await productsRes.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load products');
      }
      const data = await productsRes.json();
      setProducts(data.products || []);
      setCategories((categoriesRes.data as Category[]) || []);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${ADMIN_API_BASE}/products/${deleteTarget.id}`, {
        method: 'DELETE',
        headers,
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete product');
      }
      setDeleteTarget(null);
      Alert.alert('Success', 'Product deleted successfully');
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setDeleting(false);
    }
  };

  const toggleFeatured = async (product: Product) => {
    setTogglingFeaturedId(product.id);
    // optimistic update
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, is_featured: !p.is_featured } : p));
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${ADMIN_API_BASE}/products/${product.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ is_featured: !product.is_featured }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update product');
      }
    } catch (e: any) {
      // revert on failure
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, is_featured: product.is_featured } : p));
      Alert.alert('Error', e.message);
    } finally {
      setTogglingFeaturedId(null);
    }
  };

  const openEdit = (product: Product) => {
    setEditForm({
      name: product.name || '',
      price: String(product.price ?? ''),
      compare_at_price: product.compare_at_price ? String(product.compare_at_price) : '',
      category_id: product.category_id || '',
      status: product.status || 'active',
      is_featured: !!product.is_featured,
    });
    setEditTarget(product);
    setEditImages(product.image_url ? [{ url: product.image_url, isPrimary: true }] : []);
    setImagesLoading(true);
    fetchProductImages(product.id)
      .then(list => {
        const editable = toEditableImages(list);
        if (editable.length > 0) setEditImages(editable);
      })
      .catch(() => { /* تجاهل */ })
      .finally(() => setImagesLoading(false));
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    if (!editForm.name.trim()) {
      Alert.alert('Error', 'Product name is required');
      return;
    }
    const priceNum = Number(editForm.price);
    if (!editForm.price || isNaN(priceNum) || priceNum < 0) {
      Alert.alert('Error', 'Enter a valid price');
      return;
    }
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const body: Record<string, unknown> = {
        name: editForm.name.trim(),
        price: priceNum,
        category_id: editForm.category_id || null,
        status: editForm.status,
        is_featured: editForm.is_featured,
      };
      if (editForm.compare_at_price) {
        const cap = Number(editForm.compare_at_price);
        if (!isNaN(cap)) body.compare_at_price = cap;
      } else {
        body.compare_at_price = null;
      }
      const response = await fetch(`${ADMIN_API_BASE}/products/${editTarget.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save product');
      }
      try {
        await saveProductImages(editTarget.id, editImages);
      } catch (imgErr: any) {
        Alert.alert('تنبيه', imgErr?.message || 'تم حفظ بيانات المنتج لكن تعذّر حفظ الصور');
      }
      setEditTarget(null);
      Alert.alert('Success', 'Product updated successfully');
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Filtering & sorting ──────────────────────────────────────
  const filteredProducts = useMemo(() => {
    let list = products.filter(p => {
      if (search) {
        const q = search.toLowerCase();
        const matchesSearch =
          p.name?.toLowerCase().includes(q) ||
          p.category_name?.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          p.merchant?.full_name?.toLowerCase().includes(q) ||
          p.merchant?.email?.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && p.category_id !== categoryFilter) return false;
      if (stockFilter === 'in_stock' && p.stock <= 5) return false;
      if (stockFilter === 'low_stock' && !(p.stock > 0 && p.stock <= 5)) return false;
      if (stockFilter === 'out_of_stock' && p.stock > 0) return false;
      if (featuredOnly && !p.is_featured) return false;
      if (merchantFilter === 'platform' && p.merchant_id) return false;
      if (merchantFilter !== 'all' && merchantFilter !== 'platform' && p.merchant_id !== merchantFilter) return false;
      const priceNum = Number(p.price ?? 0);
      if (minPrice && !isNaN(Number(minPrice)) && priceNum < Number(minPrice)) return false;
      if (maxPrice && !isNaN(Number(maxPrice)) && priceNum > Number(maxPrice)) return false;
      if (dateFrom) {
        const from = new Date(dateFrom).getTime();
        if (!isNaN(from) && new Date(p.created_at).getTime() < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo).getTime() + 24 * 60 * 60 * 1000;
        if (!isNaN(to) && new Date(p.created_at).getTime() > to) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case 'newest': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'oldest': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'price_high': return Number(b.price) - Number(a.price);
        case 'price_low': return Number(a.price) - Number(b.price);
        case 'name_az': return (a.name || '').localeCompare(b.name || '');
        case 'stock_low': return (a.stock ?? 0) - (b.stock ?? 0);
        default: return 0;
      }
    });

    return list;
  }, [products, search, statusFilter, categoryFilter, stockFilter, featuredOnly, sortKey, merchantFilter, minPrice, maxPrice, dateFrom, dateTo]);

  // ── Selection helpers ────────────────────────────────────────
  const toggleSelectMode = () => {
    setSelectMode(v => !v);
    setSelectedIds(new Set());
  };

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredProducts.map(p => p.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${ADMIN_API_BASE}/products/bulk-delete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete products');
      }
      setBulkDeleteConfirm(false);
      setSelectMode(false);
      setSelectedIds(new Set());
      Alert.alert('Success', 'Selected products were deleted');
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkFeature = async (featured: boolean) => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const headers = await getAuthHeaders();
      await Promise.all(Array.from(selectedIds).map(id =>
        fetch(`${ADMIN_API_BASE}/products/${id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ is_featured: featured }),
        })
      ));
      setSelectMode(false);
      setSelectedIds(new Set());
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setBulkBusy(false);
    }
  };

  // ── Export ────────────────────────────────────────────────────
  const handleExportCSV = useCallback(async () => {
    if (filteredProducts.length === 0) return;
    setExporting(true);
    try {
      const headers = ['Name', 'SKU', 'Price', 'Compare At', 'Category', 'Status', 'Featured', 'Stock', 'Merchant', 'Merchant Email', 'Created'];
      const rows = filteredProducts.map((p) => [
        p.name,
        p.sku || '',
        Number(p.price || 0).toFixed(2),
        p.compare_at_price ? Number(p.compare_at_price).toFixed(2) : '',
        p.category_name || 'Uncategorized',
        p.status,
        p.is_featured ? 'Yes' : 'No',
        String(p.stock ?? 0),
        p.merchant?.full_name ?? 'Platform',
        p.merchant?.email ?? '',
        new Date(p.created_at).toLocaleDateString(),
      ]);
      await downloadCSV(buildCSV(headers, rows), `admin-products-${Date.now()}`);
    } finally { setExporting(false); }
  }, [filteredProducts]);

  const handleExportPDF = useCallback(async () => {
    if (filteredProducts.length === 0) return;
    setExporting(true);
    try {
      const headers = ['Name', 'Price', 'Category', 'Status', 'Stock', 'Merchant'];
      const rows = filteredProducts.map((p) => [
        p.name,
        `${Number(p.price || 0).toFixed(2)}`,
        p.category_name || 'Uncategorized',
        p.status,
        String(p.stock ?? 0),
        p.merchant?.full_name ?? 'Platform',
      ]);
      await exportPDF(buildHTMLTable('Products Report', `${filteredProducts.length} products`, headers, rows), 'Products Report');
    } finally { setExporting(false); }
  }, [filteredProducts]);

  const fmt = (v: string | number | null) => v == null ? '' : `${Math.round(Number(v)).toLocaleString('en-US')} ل.س`;
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const merchantOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const p of products) {
      if (!p.merchant_id) continue;
      const name = p.merchant?.full_name || p.merchant?.email || 'تاجر';
      const prev = map.get(p.merchant_id);
      if (prev) prev.count += 1;
      else map.set(p.merchant_id, { id: p.merchant_id, name, count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [products]);

  const featuredCount = useMemo(() => products.filter(p => p.is_featured).length, [products]);
  const outOfStockCount = useMemo(() => products.filter(p => p.stock <= 0).length, [products]);
  const lowStockCount = useMemo(() => products.filter(p => p.stock > 0 && p.stock <= 5).length, [products]);

  const activeFilterCount =
    (statusFilter !== 'all' ? 1 : 0) +
    (categoryFilter !== 'all' ? 1 : 0) +
    (stockFilter !== 'all' ? 1 : 0) +
    (featuredOnly ? 1 : 0) +
    (merchantFilter !== 'all' ? 1 : 0) +
    (minPrice ? 1 : 0) +
    (maxPrice ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0);

  const resetFilters = () => {
    setStatusFilter('all');
    setCategoryFilter('all');
    setStockFilter('all');
    setFeaturedOnly(false);
    setMerchantFilter('all');
    setMinPrice('');
    setMaxPrice('');
    setDateFrom('');
    setDateTo('');
    setSearch('');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>All Products</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={styles.loadingText}>Loading products…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>All Products</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconBtn} onPress={toggleSelectMode}>
            {selectMode ? <CheckSquare size={20} color={colors.primary[600]} /> : <Square size={20} color={colors.primary[600]} />}
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={handleExportCSV} disabled={exporting || filteredProducts.length === 0}>
            <Download size={20} color={colors.primary[600]} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={handleExportPDF} disabled={exporting || filteredProducts.length === 0}>
            <FileText size={20} color={colors.primary[600]} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchInput}>
          <Search size={18} color={colors.neutral[400]} />
          <TextInputArabic
            style={styles.searchField}
            placeholder="Search by name, SKU, category, or merchant…"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <X size={16} color={colors.neutral[400]} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity style={styles.sortBtn} onPress={() => setSortMenuVisible(true)}>
          <ArrowUpDown size={18} color={colors.primary[600]} />
        </TouchableOpacity>
      </View>

      {/* Status filter chips */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.sm }}>
          {STATUS_FILTERS.map(f => (
            <TouchableOpacity
              key={f.value}
              style={[styles.filterChip, statusFilter === f.value && styles.filterChipActive]}
              onPress={() => setStatusFilter(f.value)}
            >
              <Text style={[styles.filterChipText, statusFilter === f.value && styles.filterChipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
          <View style={styles.filterDivider} />
          {STOCK_FILTERS.map(f => (
            <TouchableOpacity
              key={f.value}
              style={[styles.filterChip, stockFilter === f.value && styles.filterChipActive]}
              onPress={() => setStockFilter(f.value)}
            >
              <Text style={[styles.filterChipText, stockFilter === f.value && styles.filterChipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
          <View style={styles.filterDivider} />
          <TouchableOpacity
            style={[styles.filterChip, featuredOnly && styles.filterChipActive]}
            onPress={() => setFeaturedOnly(v => !v)}
          >
            <Star size={12} color={featuredOnly ? colors.white : colors.warning[600]} fill={featuredOnly ? colors.white : 'transparent'} />
            <Text style={[styles.filterChipText, featuredOnly && styles.filterChipTextActive, { marginLeft: 4 }]}>Featured Only</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Category filter chips */}
      {categories.length > 0 ? (
        <View style={styles.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.sm }}>
            <TouchableOpacity
              style={[styles.categoryChip, categoryFilter === 'all' && styles.categoryChipActive]}
              onPress={() => setCategoryFilter('all')}
            >
              <Tag size={12} color={categoryFilter === 'all' ? colors.white : colors.accent[600]} />
              <Text style={[styles.categoryChipText, categoryFilter === 'all' && styles.categoryChipTextActive]}>All Categories</Text>
            </TouchableOpacity>
            {categories.map(c => (
              <TouchableOpacity
                key={c.id}
                style={[styles.categoryChip, categoryFilter === c.id && styles.categoryChipActive]}
                onPress={() => setCategoryFilter(c.id)}
              >
                <Text style={[styles.categoryChipText, categoryFilter === c.id && styles.categoryChipTextActive]}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* فلترة حسب التاجر */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.sm }}>
          <TouchableOpacity
            style={[styles.merchantChip, merchantFilter === 'all' && styles.merchantChipActive]}
            onPress={() => setMerchantFilter('all')}
          >
            <Store size={12} color={merchantFilter === 'all' ? colors.white : colors.primary[600]} />
            <Text style={[styles.merchantChipText, merchantFilter === 'all' && styles.merchantChipTextActive]}>كل التجّار</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.merchantChip, merchantFilter === 'platform' && styles.merchantChipActive]}
            onPress={() => setMerchantFilter('platform')}
          >
            <Text style={[styles.merchantChipText, merchantFilter === 'platform' && styles.merchantChipTextActive]}>منتجات المنصّة</Text>
          </TouchableOpacity>
          {merchantOptions.map(m => (
            <TouchableOpacity
              key={m.id}
              style={[styles.merchantChip, merchantFilter === m.id && styles.merchantChipActive]}
              onPress={() => setMerchantFilter(m.id)}
            >
              <Text style={[styles.merchantChipText, merchantFilter === m.id && styles.merchantChipTextActive]}>{`${m.name} (${m.count})`}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* فلترة متقدّمة: السعر والتاريخ */}
      <View style={styles.advWrap}>
        <TouchableOpacity style={styles.advToggle} onPress={() => setShowAdvanced(v => !v)}>
          <ListFilter size={14} color={colors.primary[600]} />
          <Text style={styles.advToggleText}>{showAdvanced ? 'إخفاء الفلترة المتقدّمة' : 'فلترة متقدّمة (السعر والتاريخ)'}</Text>
          {activeFilterCount > 0 ? <View style={styles.advBadge}><Text style={styles.advBadgeText}>{activeFilterCount}</Text></View> : null}
        </TouchableOpacity>
        {showAdvanced ? (
          <View style={styles.advPanel}>
            <View style={styles.advRow}>
              <View style={styles.advField}>
                <Text style={styles.advLabel}>أقل سعر</Text>
                <TextInputArabic style={styles.advInput} value={minPrice} onChangeText={t => setMinPrice(t.replace(/[^0-9.]/g, ''))} placeholder="0" keyboardType="decimal-pad" />
              </View>
              <View style={styles.advField}>
                <Text style={styles.advLabel}>أعلى سعر</Text>
                <TextInputArabic style={styles.advInput} value={maxPrice} onChangeText={t => setMaxPrice(t.replace(/[^0-9.]/g, ''))} placeholder="1000" keyboardType="decimal-pad" />
              </View>
            </View>
            <View style={styles.advRow}>
              <View style={styles.advField}>
                <Text style={styles.advLabel}>من تاريخ</Text>
                <TextInputArabic style={styles.advInput} value={dateFrom} onChangeText={setDateFrom} placeholder="YYYY-MM-DD" autoCapitalize="none" />
              </View>
              <View style={styles.advField}>
                <Text style={styles.advLabel}>إلى تاريخ</Text>
                <TextInputArabic style={styles.advInput} value={dateTo} onChangeText={setDateTo} placeholder="YYYY-MM-DD" autoCapitalize="none" />
              </View>
            </View>
            <TouchableOpacity style={styles.advReset} onPress={resetFilters}>
              <X size={14} color={colors.error[600]} />
              <Text style={styles.advResetText}>تصفير كل الفلاتر</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      ) : null}

      {/* Stats summary */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.summaryScroll} contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.sm }}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{products.length}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{products.filter(p => p.merchant_id).length}</Text>
          <Text style={styles.summaryLabel}>Merchant</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{products.filter(p => !p.merchant_id).length}</Text>
          <Text style={styles.summaryLabel}>Platform</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryValue, { color: colors.warning[600] }]}>{featuredCount}</Text>
          <Text style={styles.summaryLabel}>Featured</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryValue, { color: colors.error[600] }]}>{outOfStockCount}</Text>
          <Text style={styles.summaryLabel}>Out of Stock</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryValue, { color: colors.accent[600] }]}>{lowStockCount}</Text>
          <Text style={styles.summaryLabel}>Low Stock</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{filteredProducts.length}</Text>
          <Text style={styles.summaryLabel}>Showing</Text>
        </View>
      </ScrollView>

      {/* Selection toolbar */}
      {selectMode ? (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionText}>{selectedIds.size} selected</Text>
          <View style={styles.selectionActions}>
            <TouchableOpacity onPress={selectAllFiltered}><Text style={styles.selectionAction}>Select All</Text></TouchableOpacity>
            <TouchableOpacity onPress={clearSelection}><Text style={styles.selectionAction}>Clear</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => handleBulkFeature(true)} disabled={selectedIds.size === 0 || bulkBusy}>
              <Text style={[styles.selectionAction, { color: colors.warning[600] }]}>Feature</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleBulkFeature(false)} disabled={selectedIds.size === 0 || bulkBusy}>
              <Text style={[styles.selectionAction, { color: colors.neutral[500] }]}>Unfeature</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setBulkDeleteConfirm(true)} disabled={selectedIds.size === 0 || bulkBusy}>
              <Text style={[styles.selectionAction, { color: colors.error[600] }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Products list */}
      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {filteredProducts.length === 0 ? (
          <View style={styles.emptyState}>
            <Package size={48} color={colors.neutral[300]} />
            <Text style={styles.emptyTitle}>No products found</Text>
            <Text style={styles.emptyMsg}>Try adjusting your search or filters.</Text>
            {activeFilterCount > 0 ? (
              <TouchableOpacity onPress={() => { setStatusFilter('all'); setCategoryFilter('all'); setStockFilter('all'); setFeaturedOnly(false); }}>
                <Text style={styles.clearFiltersLink}>Clear all filters</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          filteredProducts.map(product => {
            const statusCfg = STATUS_CONFIG[product.status] ?? STATUS_CONFIG.active;
            const isSelected = selectedIds.has(product.id);
            const stockColor = product.stock <= 0 ? colors.error[600] : product.stock <= 5 ? colors.warning[600] : colors.neutral[500];
            return (
              <TouchableOpacity
                key={product.id}
                style={[styles.productCard, isSelected && styles.productCardSelected]}
                activeOpacity={selectMode ? 0.7 : 1}
                onPress={() => selectMode && toggleSelected(product.id)}
              >
                <View style={styles.productRow}>
                  {selectMode ? (
                    <TouchableOpacity style={styles.checkboxBtn} onPress={() => toggleSelected(product.id)}>
                      {isSelected ? <CheckSquare size={22} color={colors.primary[600]} /> : <Square size={22} color={colors.neutral[300]} />}
                    </TouchableOpacity>
                  ) : null}
                  {/* Product image */}
                  {product.image_url ? (
                    <Image source={{ uri: product.image_url }} style={styles.productImage} />
                  ) : (
                    <View style={styles.productImagePlaceholder}>
                      <Package size={20} color={colors.neutral[400]} />
                    </View>
                  )}
                  {/* Product info */}
                  <View style={{ flex: 1 }}>
                    <View style={styles.productNameRow}>
                      <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
                      {product.is_featured ? <Star size={14} color={colors.warning[500]} fill={colors.warning[500]} /> : null}
                    </View>
                    <View style={styles.badgeRow}>
                      <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
                      </View>
                      <Text style={styles.productCategory}>{product.category_name || 'Uncategorized'}</Text>
                    </View>
                    <View style={styles.productMetaRow}>
                      <View style={styles.productMetaItem}>
                        <DollarSign size={12} color={colors.success[600]} />
                        <Text style={styles.productPrice}>{fmt(product.price)}</Text>
                        {product.compare_at_price ? (
                          <Text style={styles.comparePrice}>{fmt(product.compare_at_price)}</Text>
                        ) : null}
                      </View>
                      <View style={styles.productMetaItem}>
                        <Boxes size={12} color={stockColor} />
                        <Text style={[styles.productMetaText, { color: stockColor, fontWeight: product.stock <= 5 ? '700' : '400' }]}>
                          Stock: {product.stock ?? 0}
                        </Text>
                      </View>
                    </View>
                  </View>
                  {/* Actions */}
                  {!selectMode ? (
                    <View style={styles.actionsCol}>
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => toggleFeatured(product)}
                        disabled={togglingFeaturedId === product.id}
                      >
                        {togglingFeaturedId === product.id ? (
                          <ActivityIndicator size={14} color={colors.warning[600]} />
                        ) : (
                          <Star size={16} color={colors.warning[500]} fill={product.is_featured ? colors.warning[500] : 'transparent'} />
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(product)}>
                        <Pencil size={16} color={colors.primary[600]} />
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={() => setDeleteTarget(product)}>
                        <Trash2 size={16} color={colors.error[500]} />
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
                {/* Merchant info */}
                {product.merchant ? (
                  <View style={styles.merchantRow}>
                    <Store size={12} color={colors.primary[600]} />
                    <Text style={styles.merchantText}>
                      {product.merchant.full_name || 'Unknown merchant'}
                      {product.merchant.email ? ` (${product.merchant.email})` : ''}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.merchantRow}>
                    <Store size={12} color={colors.neutral[400]} />
                    <Text style={styles.merchantText}>Platform product (no merchant)</Text>
                  </View>
                )}
                <View style={styles.dateRow}>
                  <Calendar size={12} color={colors.neutral[400]} />
                  <Text style={styles.dateText}>Added: {fmtDate(product.created_at)}</Text>
                  {product.sku ? <Text style={styles.dateText}>  ·  SKU: {product.sku}</Text> : null}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Sort menu modal */}
      <Modal visible={sortMenuVisible} transparent animationType="fade" onRequestClose={() => setSortMenuVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSortMenuVisible(false)}>
          <View style={styles.sortMenu}>
            <Text style={styles.sortMenuTitle}>Sort By</Text>
            {SORT_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={styles.sortOption}
                onPress={() => { setSortKey(opt.value); setSortMenuVisible(false); }}
              >
                <Text style={[styles.sortOptionText, sortKey === opt.value && styles.sortOptionTextActive]}>{opt.label}</Text>
                {sortKey === opt.value ? <CheckSquare size={16} color={colors.primary[600]} /> : null}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => !deleting && setDeleteTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.deleteIconWrap}>
              <AlertTriangle size={48} color={colors.error[500]} />
            </View>
            <Text style={styles.modalTitle}>Delete Product?</Text>
            <Text style={styles.modalMsg}>
              Are you sure you want to delete "{deleteTarget?.name}"? This action cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <View style={{ flex: 1 }}>
                <Button title="Cancel" onPress={() => setDeleteTarget(null)} variant="outline" disabled={deleting} fullWidth />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Delete" onPress={handleDelete} loading={deleting} fullWidth />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bulk delete confirmation modal */}
      <Modal visible={bulkDeleteConfirm} transparent animationType="fade" onRequestClose={() => !bulkBusy && setBulkDeleteConfirm(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.deleteIconWrap}>
              <AlertTriangle size={48} color={colors.error[500]} />
            </View>
            <Text style={styles.modalTitle}>Delete {selectedIds.size} Products?</Text>
            <Text style={styles.modalMsg}>
              This will permanently delete {selectedIds.size} selected product(s). This action cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <View style={{ flex: 1 }}>
                <Button title="Cancel" onPress={() => setBulkDeleteConfirm(false)} variant="outline" disabled={bulkBusy} fullWidth />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Delete All" onPress={handleBulkDelete} loading={bulkBusy} fullWidth />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit modal */}
      <Modal visible={!!editTarget} transparent animationType="slide" onRequestClose={() => !saving && setEditTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.editModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Product</Text>
              <TouchableOpacity style={styles.modalClose} onPress={() => setEditTarget(null)}>
                <X size={20} color={colors.neutral[500]} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>صور المنتج</Text>
              <Text style={styles.imagesHint}>
                يمكنك رفع أكثر من صورة، والصورة المحدّدة بالنجمة هي التي تظهر في الصفحة الرئيسية.
              </Text>
              <ProductImagesEditor
                images={editImages}
                onChange={setEditImages}
                disabled={saving || imagesLoading}
              />

              <Text style={styles.fieldLabel}>Product Name</Text>
              <TextInputArabic
                style={styles.fieldInput}
                value={editForm.name}
                onChangeText={(v) => setEditForm(f => ({ ...f, name: v }))}
                placeholder="Product name"
              />

              <View style={styles.fieldRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>السعر (ل.س)</Text>
                  <TextInputArabic
                    style={styles.fieldInput}
                    value={editForm.price}
                    onChangeText={(v) => setEditForm(f => ({ ...f, price: v }))}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>سعر المقارنة (ل.س)</Text>
                  <TextInputArabic
                    style={styles.fieldInput}
                    value={editForm.compare_at_price}
                    onChangeText={(v) => setEditForm(f => ({ ...f, compare_at_price: v }))}
                    placeholder="Optional"
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>Category</Text>
              <TouchableOpacity
                style={styles.categoryPickerBtn}
                onPress={() => setCategoryPickerOpen(true)}
              >
                <Tag size={16} color={colors.accent[600]} />
                <Text style={styles.categoryPickerBtnText} numberOfLines={1}>
                  {editForm.category_id
                    ? getCategoryPathLabel(categories as any, editForm.category_id)
                    : 'None — tap to choose a department / category'}
                </Text>
              </TouchableOpacity>

              <Text style={styles.fieldLabel}>Status</Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {(['active', 'draft', 'archived'] as const).map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.statusOption, editForm.status === s && { backgroundColor: STATUS_CONFIG[s].bg, borderColor: STATUS_CONFIG[s].color }]}
                    onPress={() => setEditForm(f => ({ ...f, status: s }))}
                  >
                    <Text style={[styles.statusOptionText, editForm.status === s && { color: STATUS_CONFIG[s].color, fontWeight: '700' }]}>
                      {STATUS_CONFIG[s].label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.featuredRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Star size={18} color={colors.warning[500]} fill={editForm.is_featured ? colors.warning[500] : 'transparent'} />
                  <Text style={styles.fieldLabel}>Featured Product</Text>
                </View>
                <Switch
                  value={editForm.is_featured}
                  onValueChange={(v) => setEditForm(f => ({ ...f, is_featured: v }))}
                  trackColor={{ false: colors.neutral[200], true: colors.warning[200] }}
                  thumbColor={editForm.is_featured ? colors.warning[600] : colors.neutral[400]}
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <View style={{ flex: 1 }}>
                <Button title="Cancel" onPress={() => setEditTarget(null)} variant="outline" disabled={saving} fullWidth />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Save Changes" onPress={saveEdit} loading={saving} fullWidth />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <CategoryPickerModal
        visible={categoryPickerOpen}
        categories={categories as any}
        value={editForm.category_id || null}
        onSelect={(id) => setEditForm((f) => ({ ...f, category_id: id ?? '' }))}
        onClose={() => setCategoryPickerOpen(false)}
        title="Choose department / category"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  categoryPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
    marginBottom: spacing.xs,
  },
  categoryPickerBtnText: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    fontWeight: '600',
  },
  merchantChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.primary[200],
    backgroundColor: colors.surface,
  },
  merchantChipActive: { backgroundColor: colors.primary[600], borderColor: colors.primary[600] },
  merchantChipText: { ...typography.caption, color: colors.primary[700], fontWeight: '700' },
  merchantChipTextActive: { color: colors.white },
  advWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  advToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  advToggleText: { ...typography.caption, color: colors.primary[600], fontWeight: '700' },
  advBadge: { backgroundColor: colors.primary[600], borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  advBadgeText: { ...typography.caption, color: colors.white, fontWeight: '700', fontSize: 10 },
  advPanel: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md,
    marginTop: spacing.sm, gap: spacing.sm, borderWidth: 1, borderColor: colors.border,
  },
  advRow: { flexDirection: 'row', gap: spacing.sm },
  advField: { flex: 1, gap: 4 },
  advLabel: { ...typography.caption, color: colors.textMuted, fontWeight: '700' },
  advInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.sm, paddingVertical: 8,
    ...typography.caption, color: colors.text, backgroundColor: colors.background,
  },
  advReset: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6 },
  advResetText: { ...typography.caption, color: colors.error[600], fontWeight: '700' },
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md, backgroundColor: colors.surface,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerRight: { flexDirection: 'row', gap: 2 },
  title: { ...typography.h4, color: colors.text, fontWeight: '700' },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { ...typography.body, color: colors.textSecondary },
  searchRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  searchInput: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.inputBg, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
  },
  searchField: { flex: 1, ...typography.body, color: colors.text, paddingVertical: 0 },
  sortBtn: {
    width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.inputBg,
    alignItems: 'center', justifyContent: 'center',
  },
  filterRow: { borderBottomWidth: 1, borderBottomColor: colors.border },
  filterScroll: { flexGrow: 0, paddingVertical: spacing.md, backgroundColor: colors.surface },
  filterScrollSecondary: { flexGrow: 0, paddingVertical: spacing.md, backgroundColor: colors.surface },
  filterDivider: { width: 1, backgroundColor: colors.border, marginHorizontal: 2 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full, backgroundColor: colors.inputBg,
  },
  filterChipActive: { backgroundColor: colors.primary[600] },
  filterChipText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '500' },
  filterChipTextActive: { color: colors.white, fontWeight: '700' },
  categoryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.full, backgroundColor: colors.accent[50],
  },
  categoryChipActive: { backgroundColor: colors.accent[600] },
  categoryChipText: { ...typography.caption, color: colors.accent[700], fontWeight: '600' },
  categoryChipTextActive: { color: colors.white },
  errorBanner: {
    backgroundColor: colors.error[50], borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, margin: spacing.md,
    borderWidth: 1, borderColor: colors.error[100],
  },
  errorBannerText: { ...typography.bodySmall, color: colors.error[700] },
  summaryScroll: { flexGrow: 0, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  summaryCard: { minWidth: 80, backgroundColor: colors.inputBg, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center' },
  summaryValue: { ...typography.h4, fontWeight: '700', color: colors.primary[700] },
  summaryLabel: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', marginTop: 2 },
  selectionBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.primary[50], borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  selectionText: { ...typography.bodySmall, fontWeight: '700', color: colors.primary[700] },
  selectionActions: { flexDirection: 'row', gap: spacing.md },
  selectionAction: { ...typography.caption, fontWeight: '700', color: colors.primary[600] },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyTitle: { ...typography.h4, color: colors.text },
  emptyMsg: { ...typography.body, color: colors.textSecondary },
  clearFiltersLink: { ...typography.bodySmall, color: colors.primary[600], fontWeight: '700', marginTop: spacing.sm },
  productCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md,
    marginBottom: spacing.sm, ...shadows.sm,
  },
  productCardSelected: { borderWidth: 2, borderColor: colors.primary[500] },
  productRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  checkboxBtn: { paddingTop: 4 },
  productImage: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.inputBg },
  productImagePlaceholder: {
    width: 64, height: 64, borderRadius: radius.md,
    backgroundColor: colors.inputBg, alignItems: 'center', justifyContent: 'center',
  },
  productNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  productName: { ...typography.body, fontWeight: '600', color: colors.text, flexShrink: 1 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  statusBadgeText: { ...typography.caption, fontWeight: '700' },
  productCategory: { ...typography.caption, color: colors.textSecondary },
  productMetaRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm, flexWrap: 'wrap' },
  productMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  productPrice: { ...typography.bodySmall, fontWeight: '700', color: colors.success[700] },
  comparePrice: { ...typography.caption, color: colors.neutral[400], textDecorationLine: 'line-through' },
  productMetaText: { ...typography.caption, color: colors.textSecondary },
  actionsCol: { alignItems: 'center', gap: 6 },
  actionBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.inputBg, alignItems: 'center', justifyContent: 'center',
  },
  deleteBtn: { backgroundColor: colors.error[50] },
  merchantRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  merchantText: { ...typography.caption, color: colors.textSecondary },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  dateText: { ...typography.caption, color: colors.neutral[400] },
  imagesHint: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  modalContent: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, width: '100%', maxWidth: 400, alignItems: 'center', ...shadows.lg },
  editModalContent: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, width: '100%', maxWidth: 480, ...shadows.lg },
  deleteIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.error[50], alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  modalTitle: { ...typography.h3, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  modalMsg: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg },
  modalActions: { flexDirection: 'row', gap: spacing.md, width: '100%', marginTop: spacing.md },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.inputBg, alignItems: 'center', justifyContent: 'center' },
  fieldLabel: { ...typography.bodySmall, fontWeight: '600', color: colors.text, marginBottom: spacing.xs, marginTop: spacing.sm },
  fieldInput: {
    backgroundColor: colors.inputBg, borderRadius: radius.md, paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2, ...typography.body, color: colors.text,
  },
  fieldRow: { flexDirection: 'row', gap: spacing.md },
  statusOption: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  statusOptionText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  featuredRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border,
  },
  sortMenu: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, width: '85%', maxWidth: 360, ...shadows.lg },
  sortMenuTitle: { ...typography.h4, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  sortOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm + 2 },
  sortOptionText: { ...typography.body, color: colors.text },
  sortOptionTextActive: { color: colors.primary[600], fontWeight: '700' },
});
