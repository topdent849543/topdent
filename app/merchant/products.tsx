import { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Alert,
  FlatList,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  ChevronLeft,
  Plus,
  Pencil,
  Trash2,
  Package,
  X,
  Image as ImageIcon,
  Tag,
  Shield,
  Palette,
  Ruler,
  Check,
  Search,
  SlidersHorizontal,
  Download,
  FileText,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text, ArabicTextInput as TextInputArabic } from '@/components/ArabicText';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { confirmAction } from '@/lib/confirm';
import { Button } from '@/components/Button';
import { pickAndUploadImage, isCloudinaryConfigured } from '@/lib/cloudinary';
import { ProductImagesEditor } from '@/components/ProductImagesEditor';
import { toEditableImages, saveProductImages, type EditableImage } from '@/lib/productImages';
import { downloadCSV, buildCSV, exportPDF, buildHTMLTable } from '@/lib/export';
import { CategoryPickerModal } from '@/components/CategoryPickerModal';
import { getCategoryPathLabel } from '@/lib/categories';
import type { Product, Category, ProductImage, ProductVariant } from '@/lib/supabase';

type ProductWithRelations = Product & {
  category: Category | null;
  images: ProductImage[];
  variants: ProductVariant[];
};

type ColorOption = { name: string; hex: string };

type FormState = {
  name: string;
  price: string;
  description: string;
  category_id: string;
  images: EditableImage[];
  status: 'active' | 'draft';
  colors: ColorOption[];
  sizes: string[];
  stock: Record<string, string>; // key: `${colorName}__${size}`
};

const emptyForm: FormState = {
  name: '',
  price: '',
  description: '',
  category_id: '',
  images: [],
  status: 'active',
  colors: [],
  sizes: [],
  stock: {},
};

// Predefined color palette — merchant picks from real swatches, no typing needed
const COLOR_PALETTE: ColorOption[] = [
  { name: 'Black', hex: '#000000' },
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Gray', hex: '#9CA3AF' },
  { name: 'Red', hex: '#EF4444' },
  { name: 'Orange', hex: '#F97316' },
  { name: 'Yellow', hex: '#EAB308' },
  { name: 'Green', hex: '#22C55E' },
  { name: 'Teal', hex: '#14B8A6' },
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Navy', hex: '#1E3A8A' },
  { name: 'Purple', hex: '#A855F7' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Brown', hex: '#92400E' },
  { name: 'Beige', hex: '#E7D5B8' },
  { name: 'Gold', hex: '#D4AF37' },
  { name: 'Silver', hex: '#C0C0C0' },
];

// Quick-pick sizes — shared across all selected colors for this product
const QUICK_SIZES = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'One Size'];

const stockKey = (colorName: string, size: string) => `${colorName}__${size}`;

const isLightColor = (hex: string) => {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 200;
};

const generateSlug = (name: string) => {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  const rand = Math.random().toString(36).slice(2, 8);
  return `${base}-${rand}`;
};

export default function MerchantProductsScreen() {
  const { user, isMerchant } = useAuth();
  const [products, setProducts] = useState<ProductWithRelations[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [customSize, setCustomSize] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Search & filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'draft'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'out_of_stock'>('all');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        supabase
          .from('products')
          .select('*, category:categories(*), images:product_images(*), variants:product_variants(*)')
          .eq('merchant_id', user.id)
          .order('created_at', { ascending: false }),
        supabase.from('categories').select('*').eq('is_active', true),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;

      setProducts((productsRes.data as unknown as ProductWithRelations[]) ?? []);
      setCategories((categoriesRes.data as Category[]) ?? []);
    } catch (e: any) {
      setError(e.message || 'Failed to load products');
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setCustomSize('');
    setModalVisible(true);
  };

  const openEdit = (product: ProductWithRelations) => {
    setEditingId(product.id);

    const colorMap = new Map<string, ColorOption>();
    const sizesSet = new Set<string>();
    const stock: Record<string, string> = {};
    (product.variants ?? []).forEach((v) => {
      if (!colorMap.has(v.color)) {
        const paletteMatch = COLOR_PALETTE.find(
          (c) => c.name.toLowerCase() === v.color.toLowerCase()
        );
        colorMap.set(v.color, {
          name: v.color,
          hex: v.color_hex || paletteMatch?.hex || colors.neutral[400],
        });
      }
      sizesSet.add(v.size);
      stock[stockKey(v.color, v.size)] = String(v.stock ?? 0);
    });

    setForm({
      name: product.name,
      price: String(product.price ?? ''),
      description: product.description ?? '',
      category_id: product.category_id ?? '',
      images: toEditableImages(product.images),
      status: (product.status as 'active' | 'draft') ?? 'active',
      colors: Array.from(colorMap.values()),
      sizes: Array.from(sizesSet),
      stock,
    });
    setModalVisible(true);
  };

  // ── Colors & Sizes helpers ──────────────────────────────────────
  const toggleColor = (option: ColorOption) => {
    setForm((f) => {
      const isSelected = f.colors.some((c) => c.name === option.name);
      if (isSelected) {
        const stock = { ...f.stock };
        f.sizes.forEach((s) => delete stock[stockKey(option.name, s)]);
        return { ...f, colors: f.colors.filter((c) => c.name !== option.name), stock };
      }
      const stock = { ...f.stock };
      f.sizes.forEach((s) => {
        const key = stockKey(option.name, s);
        if (!(key in stock)) stock[key] = '0';
      });
      return { ...f, colors: [...f.colors, option], stock };
    });
  };

  const toggleSize = (size: string) => {
    setForm((f) => {
      const isSelected = f.sizes.includes(size);
      if (isSelected) {
        const stock = { ...f.stock };
        f.colors.forEach((c) => delete stock[stockKey(c.name, size)]);
        return { ...f, sizes: f.sizes.filter((s) => s !== size), stock };
      }
      const stock = { ...f.stock };
      f.colors.forEach((c) => {
        const key = stockKey(c.name, size);
        if (!(key in stock)) stock[key] = '0';
      });
      return { ...f, sizes: [...f.sizes, size], stock };
    });
  };

  const addCustomSize = () => {
    const size = customSize.trim();
    if (!size) return;
    if (form.sizes.some((s) => s.toLowerCase() === size.toLowerCase())) {
      setCustomSize('');
      return;
    }
    toggleSize(size);
    setCustomSize('');
  };

  const updateStock = (colorName: string, size: string, value: string) => {
    setForm((f) => ({ ...f, stock: { ...f.stock, [stockKey(colorName, size)]: value } }));
  };

  const handleSave = async () => {
    if (!user) return;
    // Validation
    if (!form.name.trim()) {
      Alert.alert('Validation Error', 'Product name is required.');
      return;
    }
    const priceNum = parseFloat(form.price);
    if (isNaN(priceNum) || priceNum <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid price.');
      return;
    }

    // Build the color × size stock combinations
    const variantsToSave: { color: string; color_hex: string | null; size: string; stock: number }[] = [];
    for (const c of form.colors) {
      for (const s of form.sizes) {
        const raw = form.stock[stockKey(c.name, s)] ?? '0';
        const stockNum = raw.trim() === '' ? 0 : parseInt(raw, 10);
        if (isNaN(stockNum) || stockNum < 0) {
          Alert.alert(
            'Validation Error',
            `Please enter a valid stock quantity for "${c.name} / ${s}".`
          );
          return;
        }
        variantsToSave.push({ color: c.name, color_hex: c.hex, size: s, stock: stockNum });
      }
    }
    if ((form.colors.length > 0) !== (form.sizes.length > 0)) {
      Alert.alert(
        'Validation Error',
        'Please select at least one color and at least one size, or leave both empty.'
      );
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        // ── Update existing product ──
        const { data: updated, error: updateErr } = await supabase
          .from('products')
          .update({
            name: form.name.trim(),
            price: priceNum,
            description: form.description.trim() || null,
            category_id: form.category_id || null,
            status: form.status,
          })
          .eq('id', editingId)
          .select('*')
          .single();

        if (updateErr) throw updateErr;

        // حفظ كل صور المنتج (إضافة/حذف/ترتيب/الصورة الرئيسية)
        await saveProductImages(editingId, form.images);

        // Sync colors & sizes (replace existing options with the current selection)
        await supabase.from('product_variants').delete().eq('product_id', editingId);
        if (variantsToSave.length > 0) {
          const { error: variantsErr } = await supabase.from('product_variants').insert(
            variantsToSave.map((v) => ({
              product_id: editingId,
              color: v.color,
              color_hex: v.color_hex,
              size: v.size,
              stock: v.stock,
            }))
          );
          if (variantsErr) throw variantsErr;
        }

        Alert.alert('Success', 'Product updated successfully.');
      } else {
        // ── Create new product ──
        const slug = generateSlug(form.name);
        const { data: created, error: createErr } = await supabase
          .from('products')
          .insert({
            name: form.name.trim(),
            slug,
            price: priceNum,
            description: form.description.trim() || null,
            category_id: form.category_id || null,
            status: form.status,
            merchant_id: user.id,
            rating: 0,
            review_count: 0,
            is_featured: false,
            is_new: true,
          })
          .select('*')
          .single();

        if (createErr) throw createErr;

        // حفظ صور المنتج الجديدة
        if (created) {
          await saveProductImages(created.id, form.images);
        }

        // Insert colors & sizes if provided
        if (variantsToSave.length > 0 && created) {
          const { error: variantsErr } = await supabase.from('product_variants').insert(
            variantsToSave.map((v) => ({
              product_id: created.id,
              color: v.color,
              color_hex: v.color_hex,
              size: v.size,
              stock: v.stock,
            }))
          );
          if (variantsErr) throw variantsErr;
        }

        Alert.alert('Success', 'Product created successfully.');
      }

      setModalVisible(false);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (product: ProductWithRelations) => {
    confirmAction(
      {
        title: 'Delete Product',
        message: `Are you sure you want to delete "${product.name}"? This action cannot be undone.`,
      },
      async () => {
        try {
          const { error: delErr } = await supabase
            .from('products')
            .delete()
            .eq('id', product.id);
          if (delErr) throw delErr;
          Alert.alert('Success', 'Product deleted.');
          await load();
        } catch (e: any) {
          Alert.alert('Error', e.message || 'Failed to delete product');
        }
      }
    );
  };

  const fmtMoney = (n: number) =>
    `${Math.round(Number(n || 0)).toLocaleString('en-US')} ل.س`;

  const totalStock = (p: ProductWithRelations) =>
    (p.variants ?? []).reduce((sum, v) => sum + (v.stock ?? 0), 0);

  const activeFilterCount = [
    statusFilter !== 'all',
    categoryFilter !== 'all',
    stockFilter !== 'all',
    priceMin.trim() !== '',
    priceMax.trim() !== '',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setStatusFilter('all');
    setCategoryFilter('all');
    setStockFilter('all');
    setPriceMin('');
    setPriceMax('');
  };

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const min = priceMin.trim() ? Number(priceMin) : null;
    const max = priceMax.trim() ? Number(priceMax) : null;

    return products.filter((p) => {
      if (q) {
        const haystack = [p.name, p.sku, p.brand, p.category?.name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && p.category_id !== categoryFilter) return false;
      if (stockFilter !== 'all') {
        const stock = totalStock(p);
        if (stockFilter === 'in_stock' && stock <= 0) return false;
        if (stockFilter === 'out_of_stock' && stock > 0) return false;
      }
      if (min !== null && p.price < min) return false;
      if (max !== null && p.price > max) return false;
      return true;
    });
  }, [products, searchQuery, statusFilter, categoryFilter, stockFilter, priceMin, priceMax]);

  const productStats = useMemo(() => {
    const active = filteredProducts.filter((p) => p.status === 'active').length;
    const draft = filteredProducts.filter((p) => p.status === 'draft').length;
    const outOfStock = filteredProducts.filter((p) => totalStock(p) <= 0).length;
    return { total: filteredProducts.length, active, draft, outOfStock };
  }, [filteredProducts]);

  const handleExportCSV = useCallback(async () => {
    if (filteredProducts.length === 0) {
      Alert.alert('No Data', 'No products to export.');
      return;
    }
    setExporting(true);
    try {
      const headers = ['Name', 'SKU', 'Category', 'Price', 'Status', 'Stock', 'Colors', 'Sizes', 'Created'];
      const rows = filteredProducts.map((p) => [
        p.name,
        p.sku ?? '',
        p.category?.name ?? '',
        p.price,
        p.status,
        totalStock(p),
        Array.from(new Set((p.variants ?? []).map((v) => v.color))).join(' / '),
        Array.from(new Set((p.variants ?? []).map((v) => v.size))).join(' / '),
        new Date(p.created_at).toLocaleDateString(),
      ]);
      const csv = buildCSV(headers, rows);
      await downloadCSV(csv, `merchant-products-${Date.now()}`);
    } catch (e: any) {
      Alert.alert('Export Error', e.message || 'Failed to export CSV');
    } finally {
      setExporting(false);
    }
  }, [filteredProducts]);

  const handleExportPDF = useCallback(async () => {
    if (filteredProducts.length === 0) {
      Alert.alert('No Data', 'No products to export.');
      return;
    }
    setExporting(true);
    try {
      const headers = ['Name', 'Category', 'Price', 'Status', 'Stock'];
      const rows = filteredProducts.map((p) => [
        p.name,
        p.category?.name ?? 'N/A',
        fmtMoney(p.price),
        p.status === 'active' ? 'Active' : 'Draft',
        String(totalStock(p)),
      ]);
      const html = buildHTMLTable(
        'Merchant Products Report',
        `${filteredProducts.length} products`,
        headers,
        rows
      ) + `
      <div style="margin-top:24px">
        <div class="summary-card">
          <div class="label">Active</div>
          <div class="value">${productStats.active}</div>
        </div>
        <div class="summary-card">
          <div class="label">Draft</div>
          <div class="value">${productStats.draft}</div>
        </div>
        <div class="summary-card">
          <div class="label">Out of Stock</div>
          <div class="value">${productStats.outOfStock}</div>
        </div>
      </div>`;
      await exportPDF(html, 'Merchant Products Report');
    } catch (e: any) {
      Alert.alert('Export Error', e.message || 'Failed to export PDF');
    } finally {
      setExporting(false);
    }
  }, [filteredProducts, productStats]);

  const renderProduct = ({ item }: { item: ProductWithRelations }) => {
    const thumb = item.images?.[0]?.image_url;
    return (
      <View style={styles.productCard}>
        <View style={styles.productRow}>
          <View style={styles.productThumb}>
            {thumb ? (
              <View style={styles.thumbPlaceholder}>
                <ImageIcon size={20} color={colors.neutral[400]} />
              </View>
            ) : (
              <View style={styles.thumbPlaceholder}>
                <Package size={20} color={colors.neutral[400]} />
              </View>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.productName} numberOfLines={2}>
              {item.name}
            </Text>
            <Text style={styles.productPrice}>{fmtMoney(item.price)}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
              {item.category ? (
                <View style={styles.categoryBadge}>
                  <Tag size={10} color={colors.primary[700]} />
                  <Text style={styles.categoryText}>{item.category.name}</Text>
                </View>
              ) : null}
              <View
                style={[
                  styles.stockBadge,
                  totalStock(item) <= 0 ? styles.stockBadgeEmpty : styles.stockBadgeOk,
                ]}
              >
                <Text
                  style={[
                    styles.stockBadgeText,
                    { color: totalStock(item) <= 0 ? colors.error[600] : colors.success[700] },
                  ]}
                >
                  {totalStock(item) <= 0 ? 'Out of stock' : `${totalStock(item)} in stock`}
                </Text>
              </View>
            </View>
          </View>
          <View
            style={[
              styles.statusBadge,
              item.status === 'active' ? styles.statusActive : styles.statusDraft,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                { color: item.status === 'active' ? colors.success[700] : colors.neutral[600] },
              ]}
            >
              {item.status === 'active' ? 'Active' : 'Draft'}
            </Text>
          </View>
        </View>

        {item.description ? (
          <Text style={styles.productDesc} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}

        <View style={styles.productActions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.editBtn]}
            onPress={() => openEdit(item)}
          >
            <Pencil size={16} color={colors.primary[600]} />
            <Text style={[styles.actionBtnText, { color: colors.primary[600] }]}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.deleteBtn]}
            onPress={() => handleDelete(item)}
          >
            <Trash2 size={16} color={colors.error[500]} />
            <Text style={[styles.actionBtnText, { color: colors.error[500] }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ── Access guard ──────────────────────────────────────────────
  if (!user || !isMerchant) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Products</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.accessGuard}>
          <Shield size={64} color={colors.neutral[300]} />
          <Text style={styles.accessTitle}>Merchant Access Required</Text>
          <Text style={styles.accessMsg}>
            You need merchant privileges to manage products.
          </Text>
          <View style={{ marginTop: spacing.lg, width: '100%' }}>
            <Button title="Back to Home" onPress={() => router.replace('/(tabs)/index')} fullWidth />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Loading ────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Products</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={styles.loadingText}>Loading products…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Error ──────────────────────────────────────────────────────
  if (error && products.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Products</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorMsg}>{error}</Text>
          <View style={{ marginTop: spacing.lg }}>
            <Button title="Retry" onPress={load} variant="outline" />
          </View>
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
        <Text style={styles.title}>My Products</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={handleExportCSV}
            disabled={exporting || filteredProducts.length === 0}
          >
            <Download size={20} color={colors.primary[600]} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={handleExportPDF}
            disabled={exporting || filteredProducts.length === 0}
          >
            <FileText size={20} color={colors.primary[600]} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={openAdd}>
            <Plus size={24} color={colors.primary[600]} />
          </TouchableOpacity>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      ) : null}

      {/* Search bar */}
      <View style={styles.searchBarRow}>
        <View style={styles.searchInputWrap}>
          <Search size={18} color={colors.neutral[400]} />
          <TextInputArabic
            style={styles.searchInput}
            placeholder="Search by name, SKU, or category…"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={16} color={colors.neutral[400]} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          style={[styles.filterToggleBtn, activeFilterCount > 0 && styles.filterToggleBtnActive]}
          onPress={() => setFiltersVisible((v) => !v)}
        >
          <SlidersHorizontal size={18} color={activeFilterCount > 0 ? colors.white : colors.primary[600]} />
          {activeFilterCount > 0 ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      {/* Filter panel */}
      {filtersVisible ? (
        <View style={styles.filterPanel}>
          <Text style={styles.filterGroupLabel}>Status</Text>
          <View style={styles.filterChipRow}>
            {(['all', 'active', 'draft'] as const).map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.filterChip, statusFilter === s && styles.filterChipActive]}
                onPress={() => setStatusFilter(s)}
              >
                <Text style={[styles.filterChipText, statusFilter === s && styles.filterChipTextActive]}>
                  {s === 'all' ? 'All' : s === 'active' ? 'Active' : 'Draft'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.filterGroupLabel}>Stock</Text>
          <View style={styles.filterChipRow}>
            {(['all', 'in_stock', 'out_of_stock'] as const).map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.filterChip, stockFilter === s && styles.filterChipActive]}
                onPress={() => setStockFilter(s)}
              >
                <Text style={[styles.filterChipText, stockFilter === s && styles.filterChipTextActive]}>
                  {s === 'all' ? 'All' : s === 'in_stock' ? 'In Stock' : 'Out of Stock'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {categories.length > 0 ? (
            <>
              <Text style={styles.filterGroupLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipRow}>
                <TouchableOpacity
                  style={[styles.filterChip, categoryFilter === 'all' && styles.filterChipActive]}
                  onPress={() => setCategoryFilter('all')}
                >
                  <Text style={[styles.filterChipText, categoryFilter === 'all' && styles.filterChipTextActive]}>All</Text>
                </TouchableOpacity>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.filterChip, categoryFilter === cat.id && styles.filterChipActive]}
                    onPress={() => setCategoryFilter(cat.id)}
                  >
                    <Text style={[styles.filterChipText, categoryFilter === cat.id && styles.filterChipTextActive]}>
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          ) : null}

          <Text style={styles.filterGroupLabel}>Price Range</Text>
          <View style={styles.priceRangeRow}>
            <TextInputArabic
              style={styles.priceInput}
              placeholder="Min"
              value={priceMin}
              onChangeText={setPriceMin}
              keyboardType="decimal-pad"
            />
            <Text style={styles.priceRangeDash}>—</Text>
            <TextInputArabic
              style={styles.priceInput}
              placeholder="Max"
              value={priceMax}
              onChangeText={setPriceMax}
              keyboardType="decimal-pad"
            />
          </View>

          {activeFilterCount > 0 ? (
            <TouchableOpacity style={styles.clearFiltersBtn} onPress={clearFilters}>
              <Text style={styles.clearFiltersText}>Clear all filters</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <FlatList
        data={filteredProducts}
        keyExtractor={(item) => item.id}
        renderItem={renderProduct}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          products.length > 0 ? (
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{productStats.total}</Text>
                <Text style={styles.summaryLabel}>Showing</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={[styles.summaryValue, { color: colors.success[700] }]}>{productStats.active}</Text>
                <Text style={styles.summaryLabel}>Active</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={[styles.summaryValue, { color: colors.neutral[500] }]}>{productStats.draft}</Text>
                <Text style={styles.summaryLabel}>Draft</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={[styles.summaryValue, { color: colors.error[600] }]}>{productStats.outOfStock}</Text>
                <Text style={styles.summaryLabel}>Out of Stock</Text>
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={
          products.length === 0 ? (
            <View style={styles.emptyState}>
              <Package size={56} color={colors.neutral[300]} />
              <Text style={styles.emptyTitle}>No products yet</Text>
              <Text style={styles.emptyMsg}>
                Tap the + button to add your first product.
              </Text>
              <View style={{ marginTop: spacing.lg, width: '100%' }}>
                <Button title="Add Product" onPress={openAdd} fullWidth />
              </View>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Search size={56} color={colors.neutral[300]} />
              <Text style={styles.emptyTitle}>No matching products</Text>
              <Text style={styles.emptyMsg}>
                Try adjusting your search or filters.
              </Text>
              <TouchableOpacity style={{ marginTop: spacing.lg }} onPress={() => { setSearchQuery(''); clearFilters(); }}>
                <Text style={{ color: colors.primary[600], fontWeight: '600' }}>Clear search & filters</Text>
              </TouchableOpacity>
            </View>
          )
        }
      />


      {/* ── Add/Edit Modal ─────────────────────────────────────────── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !saving && setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingId ? 'Edit Product' : 'Add Product'}
              </Text>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => !saving && setModalVisible(false)}
              >
                <X size={20} color={colors.neutral[500]} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Name */}
              <Text style={styles.fieldLabel}>Product Name *</Text>
              <TextInputArabic
                style={styles.input}
                placeholder="Enter product name"
                value={form.name}
                onChangeText={(v) => setForm({ ...form, name: v })}
                editable={!saving}
              />

              {/* Price */}
              <Text style={styles.fieldLabel}>السعر (ل.س) *</Text>
              <TextInputArabic
                style={styles.input}
                placeholder="0.00"
                value={form.price}
                onChangeText={(v) => setForm({ ...form, price: v })}
                keyboardType="decimal-pad"
                editable={!saving}
              />

              {/* Description */}
              <Text style={styles.fieldLabel}>Description</Text>
              <TextInputArabic
                style={[styles.input, styles.textArea]}
                placeholder="Describe your product…"
                value={form.description}
                onChangeText={(v) => setForm({ ...form, description: v })}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                editable={!saving}
              />

              {/* Category / Department */}
              <Text style={styles.fieldLabel}>القسم والتصنيف</Text>
              <TouchableOpacity
                style={styles.categoryPickerBtn}
                onPress={() => setCategoryPickerOpen(true)}
                disabled={saving}
              >
                <Tag size={16} color={colors.primary[600]} />
                <Text style={styles.categoryPickerBtnText} numberOfLines={1}>
                  {form.category_id
                    ? getCategoryPathLabel(categories, form.category_id)
                    : 'اختر القسم والتصنيف المناسب للمنتج'}
                </Text>
              </TouchableOpacity>
              <Text style={styles.hint}>
                يمكنك إضافة المنتج تحت أي قسم متوفر (ملابس، إلكترونيات، منزل...) وتحت أي تصنيف
                فرعي داخله. الألوان والمقاسات أدناه اختيارية — اتركها فارغة للمنتجات التي لا
                تحتاج مقاسات أو ألوان (مثل الإلكترونيات).
              </Text>

              {/* Available Colors */}
              <View style={styles.variantsSectionHeader}>
                <Text style={styles.fieldLabel}>
                  <Palette size={14} color={colors.text} /> الألوان المتوفرة (اختياري)
                </Text>
                <Text style={styles.variantsHint}>
                  اختر الألوان إن كان المنتج يتوفر بأكثر من لون، وإلا تجاوز هذا الحقل.
                </Text>
              </View>
              <View style={styles.colorGrid}>
                {COLOR_PALETTE.map((opt) => {
                  const selected = form.colors.some((c) => c.name === opt.name);
                  return (
                    <TouchableOpacity
                      key={opt.name}
                      style={styles.colorChip}
                      onPress={() => toggleColor(opt)}
                      disabled={saving}
                    >
                      <View
                        style={[
                          styles.colorSwatch,
                          { backgroundColor: opt.hex },
                          selected && styles.colorSwatchSelected,
                          opt.hex.toUpperCase() === '#FFFFFF' && styles.colorSwatchBorder,
                        ]}
                      >
                        {selected ? (
                          <Check
                            size={16}
                            color={isLightColor(opt.hex) ? colors.text : colors.white}
                            strokeWidth={3}
                          />
                        ) : null}
                      </View>
                      <Text
                        style={[styles.colorChipLabel, selected && styles.colorChipLabelActive]}
                        numberOfLines={1}
                      >
                        {opt.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Available Sizes (shared across all colors) */}
              <View style={styles.variantsSectionHeader}>
                <Text style={styles.fieldLabel}>
                  <Ruler size={14} color={colors.text} /> المقاسات المتوفرة (اختياري)
                </Text>
                <Text style={styles.variantsHint}>
                  These sizes apply to every color selected above.
                </Text>
              </View>
              <View style={styles.sizeGrid}>
                {QUICK_SIZES.map((s) => {
                  const selected = form.sizes.includes(s);
                  return (
                    <TouchableOpacity
                      key={s}
                      style={[styles.categoryChip, selected && styles.categoryChipActive]}
                      onPress={() => toggleSize(s)}
                      disabled={saving}
                    >
                      <Text
                        style={[
                          styles.categoryChipText,
                          selected && styles.categoryChipTextActive,
                        ]}
                      >
                        {s}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {form.sizes
                  .filter((s) => !QUICK_SIZES.includes(s))
                  .map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.categoryChip, styles.categoryChipActive]}
                      onPress={() => toggleSize(s)}
                      disabled={saving}
                    >
                      <Text style={[styles.categoryChipText, styles.categoryChipTextActive]}>
                        {s}
                      </Text>
                    </TouchableOpacity>
                  ))}
              </View>
              <View style={styles.customSizeRow}>
                <TextInputArabic
                  style={[styles.input, styles.customSizeInput]}
                  placeholder="Custom size (e.g. 42)"
                  value={customSize}
                  onChangeText={setCustomSize}
                  editable={!saving}
                  onSubmitEditing={addCustomSize}
                />
                <TouchableOpacity
                  style={styles.customSizeAddBtn}
                  onPress={addCustomSize}
                  disabled={saving || !customSize.trim()}
                >
                  <Plus size={18} color={colors.white} />
                </TouchableOpacity>
              </View>

              {/* Stock per color & size */}
              {form.colors.length > 0 && form.sizes.length > 0 ? (
                <>
                  <Text style={styles.fieldLabel}>Stock Quantity</Text>
                  {form.colors.map((c) => (
                    <View key={c.name} style={styles.stockCard}>
                      <View style={styles.stockCardHeader}>
                        <View style={[styles.stockColorDot, { backgroundColor: c.hex }]} />
                        <Text style={styles.stockColorName}>{c.name}</Text>
                      </View>
                      <View style={styles.stockSizesRow}>
                        {form.sizes.map((s) => (
                          <View key={s} style={styles.stockSizeBox}>
                            <Text style={styles.stockSizeLabel}>{s}</Text>
                            <TextInputArabic
                              style={styles.stockSizeInput}
                              value={form.stock[stockKey(c.name, s)] ?? '0'}
                              onChangeText={(v) => updateStock(c.name, s, v)}
                              keyboardType="number-pad"
                              editable={!saving}
                              placeholder="0"
                            />
                          </View>
                        ))}
                      </View>
                    </View>
                  ))}
                </>
              ) : form.colors.length > 0 || form.sizes.length > 0 ? (
                <Text style={styles.variantsHint}>
                  Select at least one color and one size to set stock quantities.
                </Text>
              ) : null}

              {/* صور المنتج — عدّة صور مع اختيار الصورة الرئيسية */}
              <ProductImagesEditor
                images={form.images}
                onChange={(images) => setForm({ ...form, images })}
                disabled={saving}
              />

              {/* Status */}
              <Text style={styles.fieldLabel}>Status</Text>
              <View style={styles.statusToggleRow}>
                <TouchableOpacity
                  style={[
                    styles.statusToggle,
                    form.status === 'active' && styles.statusToggleActive,
                  ]}
                  onPress={() => setForm({ ...form, status: 'active' })}
                  disabled={saving}
                >
                  <Text
                    style={[
                      styles.statusToggleText,
                      form.status === 'active' && styles.statusToggleTextActive,
                    ]}
                  >
                    Active
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.statusToggle,
                    form.status === 'draft' && styles.statusToggleActive,
                  ]}
                  onPress={() => setForm({ ...form, status: 'draft' })}
                  disabled={saving}
                >
                  <Text
                    style={[
                      styles.statusToggleText,
                      form.status === 'draft' && styles.statusToggleTextActive,
                    ]}
                  >
                    Draft
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Actions */}
              <View style={styles.modalActions}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Cancel"
                    onPress={() => setModalVisible(false)}
                    variant="outline"
                    disabled={saving}
                    fullWidth
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title={editingId ? 'Update' : 'Create'}
                    onPress={handleSave}
                    loading={saving}
                    fullWidth
                  />
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <CategoryPickerModal
        visible={categoryPickerOpen}
        categories={categories}
        value={form.category_id || null}
        onSelect={(id) => setForm((f) => ({ ...f, category_id: id ?? '' }))}
        onClose={() => setCategoryPickerOpen(false)}
        title="اختر قسم وتصنيف المنتج"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.h4,
    color: colors.text,
    fontWeight: '700',
  },
  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  // Access guard
  accessGuard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  accessTitle: {
    ...typography.h3,
    color: colors.text,
    marginTop: spacing.md,
  },
  accessMsg: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  // Error
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  errorEmoji: { fontSize: 48 },
  errorTitle: {
    ...typography.h3,
    color: colors.text,
  },
  errorMsg: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: colors.error[50],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    margin: spacing.md,
    borderWidth: 1,
    borderColor: colors.error[100],
  },
  errorBannerText: {
    ...typography.bodySmall,
    color: colors.error[700],
  },
  // Header
  headerRight: { flexDirection: 'row', gap: 4 },
  // Search & filters
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
  },
  filterToggleBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterToggleBtnActive: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.error[600],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterBadgeText: {
    fontSize: 10,
    color: colors.white,
    fontWeight: '700',
  },
  filterPanel: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  filterGroupLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  filterChipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    backgroundColor: colors.neutral[100],
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  filterChipText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.white,
    fontWeight: '600',
  },
  priceRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  priceInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.background,
  },
  priceRangeDash: {
    ...typography.body,
    color: colors.neutral[400],
  },
  clearFiltersBtn: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  clearFiltersText: {
    ...typography.bodySmall,
    color: colors.error[600],
    fontWeight: '600',
  },
  // Summary
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.sm,
    alignItems: 'center',
    ...shadows.sm,
  },
  summaryValue: {
    ...typography.h4,
    color: colors.text,
    fontWeight: '700',
  },
  summaryLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  // Stock badge
  stockBadge: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  stockBadgeOk: { backgroundColor: colors.success[50] },
  stockBadgeEmpty: { backgroundColor: colors.error[50] },
  stockBadgeText: {
    ...typography.caption,
    fontWeight: '600',
  },
  // Empty
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.h4,
    color: colors.text,
  },
  emptyMsg: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  // Product card
  productCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  productThumb: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  thumbPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.neutral[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  productName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
    flexShrink: 1,
  },
  productPrice: {
    ...typography.h4,
    color: colors.primary[700],
    fontWeight: '700',
    marginTop: 2,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
    backgroundColor: colors.primary[50],
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  categoryText: {
    ...typography.caption,
    color: colors.primary[700],
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  statusActive: {
    backgroundColor: colors.success[50],
  },
  statusDraft: {
    backgroundColor: colors.neutral[100],
  },
  statusText: {
    ...typography.caption,
    fontWeight: '600',
  },
  productDesc: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  productActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
  },
  editBtn: {
    backgroundColor: colors.primary[50],
  },
  deleteBtn: {
    backgroundColor: colors.error[50],
  },
  actionBtnText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  modalTitle: {
    ...typography.h4,
    color: colors.text,
    fontWeight: '700',
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutral[100],
  },
  // Form fields
  fieldLabel: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.background,
    marginBottom: spacing.sm,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  uploadPreviewText: {
    ...typography.bodySmall,
    color: colors.success[700],
    fontWeight: '500',
    flex: 1,
  },
  uploadPlaceholder: {
    ...typography.body,
    color: colors.neutral[400],
    flex: 1,
  },
  configWarning: {
    ...typography.caption,
    color: colors.warning[600],
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
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
  },
  categoryPickerBtnText: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    fontWeight: '600',
  },
  // Category chips
  categoryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  categoryChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.neutral[100],
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChipActive: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  categoryChipText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  categoryChipTextActive: {
    color: colors.white,
    fontWeight: '600',
  },
  // Status toggle
  statusToggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statusToggle: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.neutral[100],
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
  },
  statusToggleActive: {
    backgroundColor: colors.primary[50],
    borderColor: colors.primary[600],
  },
  statusToggleText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  statusToggleTextActive: {
    color: colors.primary[700],
  },
  // Modal actions
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  // Colors & Sizes
  variantsSectionHeader: {
    marginTop: spacing.md,
  },
  variantsHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  // Color palette grid
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  colorChip: {
    alignItems: 'center',
    width: 60,
  },
  colorSwatch: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchSelected: {
    borderColor: colors.primary[600],
  },
  colorSwatchBorder: {
    borderColor: colors.border,
  },
  colorChipLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  colorChipLabelActive: {
    color: colors.primary[700],
    fontWeight: '600',
  },
  // Size grid
  sizeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  customSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  customSizeInput: {
    flex: 1,
    marginBottom: spacing.sm,
  },
  customSizeAddBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  // Stock per color card
  stockCard: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  stockCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  stockColorDot: {
    width: 18,
    height: 18,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stockColorName: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  stockSizesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  stockSizeBox: {
    alignItems: 'center',
    width: 64,
  },
  stockSizeLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 4,
    fontWeight: '600',
  },
  stockSizeInput: {
    width: '100%',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: 8,
    textAlign: 'center',
    ...typography.bodySmall,
    color: colors.text,
    backgroundColor: colors.surface,
  },
});
