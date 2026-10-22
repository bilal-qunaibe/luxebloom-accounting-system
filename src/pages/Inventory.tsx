import { useState, useEffect, useMemo } from 'react'
import {
  Package, Plus, Search, Edit2, Trash2, AlertTriangle, Scale, Layers, RefreshCw
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from '@/components/ui/dialog'
import { callAction, fetchAllDocs, useDataRefresh } from '@/lib/db'

// القائمة المحدثة بالفئات الجديدة
const PRODUCT_CATEGORIES = [
  { id: '1', name: 'خاتم' }, { id: '2', name: 'سنسال' }, { id: '3', name: 'اسوارة' },
  { id: '4', name: 'حلق' }, { id: '5', name: 'طقم 3 قطع' }, { id: '6', name: 'طقم 4 قطع' },
  { id: '7', name: 'ساعة' }, { id: '8', name: 'علب وتغليفات' }
]

// كل الحفظ والحذف بيمر من السيرفر عشان المخزون والقيود يضلوا متطابقين
export default function Inventory() {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showLowStock, setShowLowStock] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<any>(null)
  const [allProducts, setAllProducts] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)

  // نظام الجلب اللانهائي الذكي
  const loadProducts = async () => {
    setIsRefreshing(true)
    try {
      setAllProducts(await fetchAllDocs('products'))
    } catch (error) {
      console.error("خطأ في جلب المنتجات:", error)
    } finally {
      setIsRefreshing(false)
    }
  }

  const loadCategories = async () => {
    try {
      setCategories(await fetchAllDocs('categories'))
    } catch (error) {
      console.error("خطأ في جلب الفئات:", error)
    }
  }

  useEffect(() => {
    loadProducts()
    loadCategories()
  }, [])
  useDataRefresh(loadProducts)

  const products = useMemo(() => {
    return allProducts.filter(p => {
      const matchSearch = search ? (p.name?.includes(search) || p.code?.includes(search)) : true
      const matchCat = categoryFilter ? p.categoryId?.toString() === categoryFilter.toString() : true
      const matchType = typeFilter ? p.itemType === typeFilter : true
      const matchStock = showLowStock ? ((p.quantity || 0) <= (p.minQuantity || 0)) : true
      return matchSearch && matchCat && matchType && matchStock
    })
  }, [allProducts, search, categoryFilter, typeFilter, showLowStock])

  const handleDelete = async (id: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذا المنتج؟')) {
      try {
        await callAction('product.delete', { id })
        loadProducts()
      } catch (error: any) {
        console.error("خطأ في الحذف:", error)
        alert(error.message || 'حدث خطأ أثناء الحذف')
      }
    }
  }

  const handleEdit = (product: any) => { setEditingProduct(product); setIsDialogOpen(true) }
  const handleDialogChange = (open: boolean) => { setIsDialogOpen(open); if (!open) setEditingProduct(null) }

  // 🌟 دمج فئات الفايربيس مع الفئات الثابتة (ساعات وعلب) بدون تكرار
  const displayCategories = [...categories, ...PRODUCT_CATEGORIES.filter(pc => !categories.some((c: any) => c.name === pc.name))];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-title">المخزون</h1>
          <p className="text-white/50 text-sm mt-1">إدارة منتجات الفضة والستانليس ستيل</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button onClick={loadProducts} className="glass-button flex items-center justify-center p-2.5" title="تحديث البيانات">
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <Dialog open={isDialogOpen} onOpenChange={handleDialogChange}>
            <DialogTrigger asChild>
              <button className="glass-button flex items-center justify-center gap-2 w-full sm:w-auto">
                <Plus className="w-4 h-4" /> منتج جديد
              </button>
            </DialogTrigger>
            <DialogContent className="glass-panel border-white/10 max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-white text-right">{editingProduct ? 'تعديل المنتج' : 'إضافة منتج جديد'}</DialogTitle>
                <DialogDescription className="hidden">نموذج لإضافة أو تعديل منتجات المخزون</DialogDescription>
              </DialogHeader>
              <AddProductForm 
                onSuccess={() => { handleDialogChange(false); loadProducts(); }} 
                categories={displayCategories} 
                initialData={editingProduct} 
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="glass p-4 rounded-xl flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input type="text" placeholder="البحث بالاسم أو الكود..." value={search} onChange={(e) => setSearch(e.target.value)} className="glass-input w-full pr-10" />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="glass-input">
          <option value="">جميع الفئات</option>
          {displayCategories.map((cat: any) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
        </select>
        {/* 🌟 إضافة فلتر "أخرى" للبحث */}
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="glass-input">
          <option value="">جميع الأنواع</option>
          <option value="SILVER">فضة</option>
          <option value="STEEL">ستانليس</option>
          <option value="OTHER">أخرى</option>
        </select>
        <button onClick={() => setShowLowStock(!showLowStock)} className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition-all ${showLowStock ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'glass-button-secondary'}`}>
          <AlertTriangle className="w-4 h-4" /> منخفض
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-4"><div className="flex items-center gap-3"><Package className="w-5 h-5 text-gold-400" /><div><p className="text-lg font-bold text-white">{products?.length || 0}</p><p className="text-xs text-white/50">إجمالي المنتجات</p></div></div></div>
        <div className="glass-card p-4"><div className="flex items-center gap-3"><Scale className="w-5 h-5 text-silver-400" /><div><p className="text-lg font-bold text-white">{products?.reduce((sum: number, p: any) => sum + (Number(p.weightGram) || 0), 0).toLocaleString()} غرام</p><p className="text-xs text-white/50">إجمالي الوزن</p></div></div></div>
        <div className="glass-card p-4"><div className="flex items-center gap-3"><Layers className="w-5 h-5 text-blue-400" /><div><p className="text-lg font-bold text-white">{products?.reduce((sum: number, p: any) => sum + (Number(p.quantity) || 0), 0).toLocaleString()}</p><p className="text-xs text-white/50">إجمالي الكمية</p></div></div></div>
        <div className="glass-card p-4"><div className="flex items-center gap-3"><AlertTriangle className="w-5 h-5 text-red-400" /><div><p className="text-lg font-bold text-white">{products?.filter((p: any) => (p.quantity || 0) <= (p.minQuantity || 0)).length || 0}</p><p className="text-xs text-white/50">منخفض المخزون</p></div></div></div>
      </div>

      <div className="glass-card overflow-x-auto">
        <table className="table-glass min-w-[800px]">
          <thead>
            <tr><th>الكود</th><th>المنتج</th><th>الفئة</th><th>النوع</th><th>الكمية والمقاسات</th><th>الوزن (غ)</th><th>سعر الشراء</th><th>سعر البيع</th><th>الحالة</th><th>الإجراءات</th></tr>
          </thead>
          <tbody>
            {products?.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-8 text-white/40">المخزون فارغ، أضف أول منتج الآن</td></tr>
            ) : (
              products?.map((product: any) => (
                <tr key={product.id}>
                  <td className="font-mono text-gold-400">{product.code}</td>
                  <td><div><p className="font-medium text-white/90 whitespace-nowrap">{product.name}</p>{product.nameEn && <p className="text-xs text-white/40 whitespace-nowrap">{product.nameEn}</p>}</div></td>
                  <td className="whitespace-nowrap">{product.category?.name || PRODUCT_CATEGORIES.find(c => c.id === product.categoryId?.toString())?.name}</td>
                  
                  {/* 🌟 عرض كلمة "أخرى" في الجدول بستايل خاص */}
                  <td>
                    <span className={`badge ${product.itemType === 'SILVER' ? 'badge-gold' : product.itemType === 'STEEL' ? 'badge-silver' : 'bg-white/10 text-white/70'} whitespace-nowrap`}>
                      {product.itemType === 'SILVER' ? 'فضة' : product.itemType === 'STEEL' ? 'ستانليس' : 'أخرى'}
                    </span>
                  </td>
                  
                  <td className={`font-medium ${(product.quantity || 0) <= (product.minQuantity || 0) ? 'text-red-400' : 'text-white/80'}`}>
                    <div className="flex flex-col gap-1">
                      <span>{product.quantity} الإجمالي</span>
                      {product.variants && product.variants.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {product.variants.map((v: any, i: number) => (v.size && Number(v.quantity) > 0 ? (<span key={i} className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-white/70 whitespace-nowrap">م {v.size} = {v.quantity}</span>) : null))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap">{product.weightGram} غ</td>
                  <td className="whitespace-nowrap">{Number(product.purchasePrice || 0).toLocaleString()} ₪</td>
                  <td className="text-gold-400 font-medium whitespace-nowrap">{Number(product.salePrice || 0).toLocaleString()} ₪</td>
                  <td>{product.isActive !== false ? <span className="badge-success whitespace-nowrap">نشط</span> : <span className="badge-danger whitespace-nowrap">معطل</span>}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleEdit(product)} className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center hover:bg-white/[0.1] transition-colors"><Edit2 className="w-3.5 h-3.5 text-white/60" /></button>
                      <button onClick={() => handleDelete(product.id)} className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center hover:bg-red-500/20 transition-colors"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AddProductForm({ onSuccess, categories, initialData }: { onSuccess: () => void, categories: any[], initialData?: any }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState<any>({
    code: '', name: '', nameEn: '', categoryId: '', itemType: 'SILVER',
    quantity: 0, weightGram: 0, minQuantity: 5, minWeight: 10,
    purchasePrice: 0, salePrice: 0, wholesalePrice: 0, purity: '925', isActive: true
  })
  
  const [variants, setVariants] = useState([{ size: '', quantity: 0 }])

  useEffect(() => {
    if (initialData) {
      setFormData({
        code: initialData.code || '', name: initialData.name || '', nameEn: initialData.nameEn || '',
        categoryId: initialData.categoryId || '', itemType: initialData.itemType || 'SILVER',
        quantity: initialData.quantity || 0, weightGram: initialData.weightGram || 0,
        minQuantity: initialData.minQuantity || 5, minWeight: initialData.minWeight || 10,
        purchasePrice: initialData.purchasePrice || 0, salePrice: initialData.salePrice || 0,
        wholesalePrice: initialData.wholesalePrice || 0, purity: initialData.purity || '925', isActive: initialData.isActive ?? true
      })
      if (initialData.variants && initialData.variants.length > 0) { setVariants(initialData.variants) } 
      else { setVariants([{ size: '', quantity: 0 }]) }
    }
  }, [initialData])

  const addVariant = () => setVariants([...variants, { size: '', quantity: 0 }])
  const updateVariant = (index: number, field: string, value: any) => {
    const newVariants = [...variants] as any
    newVariants[index][field] = field === 'quantity' ? parseInt(value) || 0 : value
    setVariants(newVariants)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); 
    setIsSubmitting(true)
    
    try {
      const cleanVariants = variants.filter(v => v.size.trim() !== '')
      const totalQty = cleanVariants.reduce((sum, v) => sum + (Number(v.quantity) || 0), 0)
      
      const finalQuantity = cleanVariants.length > 0 ? totalQty : (parseInt(String(formData.quantity)) || 0);

      const payload = {
        code: formData.code || '',
        name: formData.name || '',
        nameEn: formData.nameEn || '',
        categoryId: formData.categoryId ? formData.categoryId.toString() : '',
        itemType: formData.itemType || 'SILVER',
        quantity: finalQuantity,
        variants: cleanVariants.map(v => ({ size: v.size.trim(), quantity: parseInt(String(v.quantity)) || 0 })),
        weightGram: parseFloat(formData.weightGram) || 0,
        minQuantity: parseInt(formData.minQuantity) || 0,
        minWeight: parseFloat(formData.minWeight) || 0,
        purchasePrice: parseFloat(formData.purchasePrice) || 0,
        salePrice: parseFloat(formData.salePrice) || 0,
        wholesalePrice: parseFloat(formData.wholesalePrice) || 0,
        purity: formData.purity || '925',
        isActive: formData.isActive ?? true,
      }

      // أي تغيير بالكمية أو التكلفة بيعمل قيد تسوية للمخزون تلقائياً
      await callAction('product.save', { ...payload, id: initialData?.id })

      onSuccess()

    } catch (error: any) { 
      console.error("خطأ الحفظ:", error)
      alert(error.message || "حدث خطأ غير متوقع")
    } finally { 
      setIsSubmitting(false) 
    }
  }

  const hasVariants = variants.some(v => v.size.trim() !== '');

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} className="glass-input w-full" placeholder="الكود" required />
        <input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="glass-input w-full" placeholder="الاسم" required />
      </div>
      
      <div className="bg-white/5 p-3 rounded-lg border border-white/10">
        <label className="text-xs text-[#C5CBAF] mb-2 block">الكمية الإجمالية (في حال عدم وجود مقاسات)</label>
        <input 
          value={formData.quantity === 0 ? '' : formData.quantity} 
          type="number" 
          placeholder="أدخل الكمية هنا للسناسل والمنتجات بدون مقاس" 
          onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} 
          className={`glass-input w-full ${hasVariants ? 'opacity-50 cursor-not-allowed' : ''}`} 
          disabled={hasVariants}
          title={hasVariants ? "لا يمكنك إدخال الكمية هنا لوجود مقاسات، سيتم حسابها تلقائياً" : ""}
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs text-white/60">المقاسات والكميات (اختياري)</label>
        {variants.map((_, index) => (
          <div key={index} className="flex gap-2">
            <input value={_.size} placeholder="مقاس" onChange={(e) => updateVariant(index, 'size', e.target.value)} className="glass-input w-full" />
            <input value={_.quantity === 0 ? '' : _.quantity} type="number" placeholder="كمية" onChange={(e) => updateVariant(index, 'quantity', e.target.value)} className="glass-input w-full" />
          </div>
        ))}
        <button type="button" onClick={addVariant} className="text-[10px] text-gold-400">إضافة مقاس</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <select value={formData.categoryId} onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })} className="glass-input w-full" required>
          <option value="">الفئة</option>
          {categories.map((cat: any) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
        </select>
        
        {/* 🌟 إضافة خيار "أخرى" للمعدن في نموذج الإضافة */}
        <select value={formData.itemType} onChange={(e) => setFormData({ ...formData, itemType: e.target.value })} className="glass-input w-full">
          <option value="SILVER">فضة</option>
          <option value="STEEL">ستانليس ستيل</option>
          <option value="OTHER">أخرى (ساعات وعلب)</option>
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <input value={formData.purchasePrice || ''} type="number" step="0.01" placeholder="سعر الشراء" onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })} className="glass-input w-full" required />
        <input value={formData.salePrice || ''} type="number" step="0.01" placeholder="سعر البيع" onChange={(e) => setFormData({ ...formData, salePrice: e.target.value })} className="glass-input w-full" required />
        <input value={formData.weightGram || ''} type="number" step="0.01" placeholder="الوزن (غ)" onChange={(e) => setFormData({ ...formData, weightGram: e.target.value })} className="glass-input w-full" />
      </div>
      <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
        <input type="checkbox" checked={formData.isActive !== false} onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} />
        منتج نشط (المنتج المعطل ما بيظهر بالبيع)
      </label>
      <button type="submit" disabled={isSubmitting} className="glass-button w-full mt-4 flex justify-center items-center">
        {isSubmitting ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : initialData ? "حفظ التعديلات" : "إضافة المنتج"}
      </button>
    </form>
  )
}