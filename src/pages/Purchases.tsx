import { useState, useEffect } from 'react'
import { Plus, Search, Eye, X, ChevronDown, Ban } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { callAction, fetchAllDocs, isCancelled, byNewest, PAYMENT_METHODS, CURRENCIES, useDataRefresh } from '@/lib/db'

export default function Purchases() {
  const [search, setSearch] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [invoices, setInvoices] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [suppliers, setSuppliers] = useState<any[]>([])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [allProds, allPurchases, allSuppliers] = await Promise.all([
        fetchAllDocs('products'),
        fetchAllDocs('purchases'),
        fetchAllDocs('suppliers'),
      ])
      setProducts(allProds)
      setInvoices(allPurchases)
      setSuppliers(allSuppliers)
    } catch (error) {
      console.error("خطأ في الجلب:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = async (inv: any) => {
    const reason = window.prompt(`سبب إلغاء فاتورة الشراء ${inv.invoiceNo}؟ (رح تنخصم الكميات من المخزون وينعمل قيد عكسي)`)
    if (reason === null) return
    try {
      await callAction('document.reverse', { kind: 'purchase', id: inv.id, reason })
      fetchData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])
  useDataRefresh(fetchData)

  const filteredInvoices = invoices
    .filter(inv => inv.invoiceNo?.toLowerCase().includes(search.toLowerCase()) || inv.supplierName?.includes(search))
    .sort(byNewest);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-title">المشتريات</h1>
          <p className="text-white/50 text-sm mt-1">فواتير الشراء وإدخال المخزون</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <button className="glass-button flex items-center justify-center gap-2 w-full sm:w-auto">
              <Plus className="w-4 h-4" /> فاتورة شراء جديدة
            </button>
          </DialogTrigger>
          <DialogContent className="glass-panel border-white/10 max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-white text-right">إدخال فاتورة مشتريات (تزويد المخزون)</DialogTitle>
            </DialogHeader>
            <PurchaseInvoiceForm 
              onSuccess={() => { setIsDialogOpen(false); fetchData(); }} 
              products={products} 
              suppliers={suppliers}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="glass p-4 rounded-xl">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input type="text" placeholder="البحث برقم الفاتورة أو المورد..." value={search} onChange={(e) => setSearch(e.target.value)} className="glass-input w-full pr-10" />
        </div>
      </div>

      <div className="glass-card overflow-x-auto">
        <table className="table-glass min-w-[800px]">
          <thead>
            <tr>
              <th>رقم الفاتورة</th>
              <th>المورد</th>
              <th>التاريخ</th>
              <th>إجمالي التكلفة</th>
              <th>المدفوع</th>
              <th>المتبقي (دين)</th>
              <th>الحالة</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="text-center py-8 text-white/50">جاري تحميل الفواتير...</td></tr>
            ) : filteredInvoices.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-white/40">لا توجد فواتير مطابقة</td></tr>
            ) : (
              filteredInvoices.map((inv: any) => (
                <tr key={inv.id} className={isCancelled(inv) ? 'opacity-50' : ''}>
                  <td className="font-mono text-emerald-400">{inv.invoiceNo}</td>
                  <td>{inv.supplierName || 'مورد عام'}</td>
                  <td>{new Date(inv.createdAt).toLocaleDateString('ar-PS')}</td>
                  <td className="text-gold-400 font-medium">{Number(inv.totalCost || 0).toLocaleString()} ₪</td>
                  <td>{Number(inv.paid || 0).toLocaleString()} ₪</td>
                  <td className={(inv.totalCost - inv.paid) > 0 ? 'text-red-400' : 'text-emerald-400'}>
                    {Number((inv.totalCost || 0) - (inv.paid || 0)).toLocaleString()} ₪
                  </td>
                  <td>{isCancelled(inv) ? <span className="badge-danger">ملغاة</span> : <span className="badge-success">مستلمة</span>}</td>
                  <td className="flex items-center gap-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <button className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center hover:bg-white/[0.1] transition-colors">
                          <Eye className="w-3.5 h-3.5 text-white/60" />
                        </button>
                      </DialogTrigger>
                      <DialogContent className="glass-panel border-white/10 max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle className="text-white text-right">تفاصيل فاتورة الشراء {inv.invoiceNo}</DialogTitle>
                        </DialogHeader>
                        <PurchaseDetails invoice={inv} />
                      </DialogContent>
                    </Dialog>
                    {!isCancelled(inv) && (
                      <button onClick={() => handleCancel(inv)} title="إلغاء الفاتورة" className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center hover:bg-red-500/20 transition-colors">
                        <Ban className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    )}
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

function PurchaseInvoiceForm({ onSuccess, products, suppliers }: { onSuccess: () => void, products: any[], suppliers: any[] }) {
  const [isPending, setIsPending] = useState(false)
  const [items, setItems] = useState<Array<{ 
    itemType: string; 
    productId: string; 
    name: string; 
    size: string; 
    quantity: number; 
    unitCost: number; 
    total: number 
  }>>([])
  
  const [supplierName, setSupplierName] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [currency, setCurrency] = useState('ILS')
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [notes, setNotes] = useState('')
  const [paid, setPaid] = useState(0)

  const [openDropdownIdx, setOpenDropdownIdx] = useState<number | null>(null)
  const [productSearchTerm, setProductSearchTerm] = useState('')

  const addItem = () => {
    setItems([...items, { itemType: '', productId: '', name: '', size: '', quantity: 1, unitCost: 0, total: 0 }])
  }

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items]
    newItems[index] = { ...newItems[index], [field]: value }
    
    if (field === 'itemType') {
      newItems[index].productId = ''
      newItems[index].name = ''
      newItems[index].size = ''
      newItems[index].unitCost = 0
      newItems[index].total = 0
    }
    
    if (field === 'productId') {
      const product = products.find((p: any) => p.id === value)
      if (product) {
        newItems[index].name = product.name
        newItems[index].unitCost = Number(product.purchasePrice) || 0 // نسحب التكلفة القديمة للتسهيل
        newItems[index].size = '' 
        newItems[index].itemType = product.itemType || newItems[index].itemType 
      }
    }
    
    newItems[index].total = newItems[index].quantity * newItems[index].unitCost
    setItems(newItems)
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const totalCost = items.reduce((sum, item) => sum + item.total, 0)

  // التحديث التلقائي للمدفوع فقط إذا كان يساوي الإجمالي القديم (للتسهيل)
  useEffect(() => {
    setPaid(totalCost)
  }, [totalCost])

  const handleSubmit = async () => {
    if (items.length === 0) return alert("الرجاء إضافة منتجات للفاتورة")
    if (items.some(i => !i.productId)) return alert("الرجاء تحديد المنتج في جميع الصفوف")
    
    // التحقق من تحديد المقاس للمنتجات التي تمتلك مقاسات
    const missingSize = items.some(item => {
      const prod = products.find(p => p.id === item.productId)
      const hasSizes = prod?.variants && prod.variants.length > 0;
      return hasSizes && !item.size 
    })
    if (missingSize) return alert("الرجاء تحديد المقاس لجميع المنتجات التي تمتلك مقاسات!")
    
    if (paid > totalCost) return alert("المبلغ المدفوع أكبر من قيمة الفاتورة")
    if (paid < totalCost && !supplierId) return alert("في مبلغ متبقي للمورد، اختاره من القائمة عشان ينسجل الدين")

    setIsPending(true)
    try {
      // السيرفر بيزيد المخزون ويحدث متوسط التكلفة ويعمل القيد بعملية وحدة
      await callAction('purchase.create', {
        items: items.map(i => ({ productId: i.productId, size: i.size, quantity: i.quantity, unitCost: i.unitCost })),
        supplierId: supplierId || undefined,
        supplierName,
        paid,
        currency,
        paymentMethod,
        notes,
      })
      onSuccess()
    } catch (error: any) {
      console.error("Error creating purchase: ", error)
      alert(error.message || "حدث خطأ أثناء حفظ الفاتورة")
    } finally {
      setIsPending(false)
    }
  }

  const currencyLabel = CURRENCIES.find(c => c.value === currency)?.label || 'شيكل'

  return (
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm text-white/60 mb-1">المورد</label>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="glass-input w-full">
            <option value="">مورد غير مسجل</option>
            {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}{s.company ? ` - ${s.company}` : ''}</option>)}
          </select>
          {!supplierId && (
            <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className="glass-input w-full mt-2" placeholder="اسم المورد (اختياري)" />
          )}
        </div>
        <div>
          <label className="block text-sm text-white/60 mb-1">عملة الفاتورة</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="glass-input w-full">
            {CURRENCIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-white/60 mb-1">طريقة الدفع</label>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="glass-input w-full">
            {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-white/60 mb-1">ملاحظات الفاتورة</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="glass-input w-full" placeholder="ملاحظات..." />
        </div>
      </div>

      <div className="border border-white/10 rounded-xl p-4 bg-black/20">
        <div className="flex items-center justify-between mb-4">
          <label className="text-sm font-medium text-white">المنتجات (توريد للمخزون)</label>
          <button onClick={addItem} className="text-sm bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors">
            <Plus className="w-4 h-4" /> إضافة منتج للفاتورة
          </button>
        </div>
        
        <div className="space-y-3 max-h-[45vh] overflow-y-auto overflow-x-auto pr-2 custom-scrollbar">
          <div className="min-w-[700px] pb-2">
            {items.map((item, index) => {
              const selectedProduct = products.find(p => p.id === item.productId)
              const hasSizes = selectedProduct?.variants && selectedProduct.variants.length > 0
              const availableSizes = selectedProduct?.variants || []
              
              const availableProductsList = products.filter(p => 
                (item.itemType ? p.itemType === item.itemType : true)
              )

              return (
                <div key={index} className="glass p-3 rounded-lg border border-white/5 relative mb-2">
                  <div className="grid grid-cols-12 gap-3 items-end">
                    
                    {/* فلتر النوع المحدث */}
                    <div className="col-span-2">
                      <label className="text-[10px] text-white/40 mb-1 block">المعدن / الفئة</label>
                      <select value={item.itemType} onChange={(e) => updateItem(index, 'itemType', e.target.value)} className="glass-input w-full text-xs">
                        <option value="">الكل</option>
                        <option value="SILVER">فضة</option>
                        <option value="STEEL">ستانليس</option>
                        <option value="OTHER">أخرى (ساعات وعلب)</option>
                      </select>
                    </div>

                    <div className={hasSizes ? "col-span-3 relative" : "col-span-5 relative"}>
                      <label className="text-[10px] text-white/40 mb-1 block">المنتج (اختر لتزويد الكمية)</label>
                      <div className="relative">
                        <div 
                          className="glass-input w-full text-xs flex justify-between items-center cursor-pointer hover:bg-white/5"
                          onClick={() => { setOpenDropdownIdx(openDropdownIdx === index ? null : index); setProductSearchTerm(''); }}
                        >
                          <span className="truncate">{item.name || 'ابحث واضغط هنا...'}</span>
                          <ChevronDown className="w-3 h-3 text-white/40" />
                        </div>
                        
                        {openDropdownIdx === index && (
                          <div className="absolute z-50 top-full left-0 right-0 mt-1 glass-panel border border-white/10 rounded-lg max-h-48 flex flex-col overflow-hidden">
                            <input 
                              autoFocus
                              type="text" 
                              placeholder="ابحث عن منتج..." 
                              className="bg-transparent border-b border-white/10 p-2 text-xs text-white outline-none"
                              value={productSearchTerm}
                              onChange={(e) => setProductSearchTerm(e.target.value)}
                            />
                            <div className="overflow-y-auto">
                              {availableProductsList
                                .filter(p => p.name.toLowerCase().includes(productSearchTerm.toLowerCase()) || p.code?.includes(productSearchTerm))
                                .map(p => (
                                  <div 
                                    key={p.id} 
                                    className="p-2 text-xs hover:bg-white/10 cursor-pointer flex justify-between items-center"
                                    onClick={() => { updateItem(index, 'productId', p.id); setOpenDropdownIdx(null); }}
                                  >
                                    <span>{p.name}</span>
                                    <span className="text-white/40 text-[10px]">حالي: {p.quantity}</span>
                                  </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {hasSizes && (
                      <div className="col-span-2">
                        <label className="text-[10px] text-emerald-400 mb-1 block">المقاس (للتزويد)</label>
                        <select value={item.size} onChange={(e) => updateItem(index, 'size', e.target.value)} className="glass-input w-full text-xs border-emerald-500/50" required>
                          <option value="">اختر مقاس</option>
                          {availableSizes.map((v: any, i: number) => (
                              <option key={i} value={v.size}>مقاس {v.size}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="col-span-2">
                      <label className="text-[10px] text-white/40 mb-1 block">الكمية (الداخلة)</label>
                      <input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)} className="glass-input w-full text-xs text-center border-emerald-500/30" />
                    </div>

                    <div className="col-span-2">
                      <label className="text-[10px] text-white/40 mb-1 block">تكلفة القطعة ({currencyLabel})</label>
                      <input type="number" value={item.unitCost} onChange={(e) => updateItem(index, 'unitCost', parseFloat(e.target.value) || 0)} className="glass-input w-full text-xs" />
                    </div>

                    <div className="col-span-1 flex items-center justify-end gap-2 pb-1">
                      <span className="text-sm font-medium text-emerald-400 min-w-[3rem] text-center">{item.total} ₪</span>
                      <button onClick={() => removeItem(index)} className="w-7 h-7 flex-shrink-0 rounded bg-red-500/10 flex items-center justify-center hover:bg-red-500/20 transition-colors">
                        <X className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>

                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-white/60 mb-1">المبلغ المدفوع للمورد</label>
          <input type="number" value={paid} onChange={(e) => setPaid(parseFloat(e.target.value) || 0)} className="glass-input w-full text-emerald-400 font-bold" />
        </div>
      </div>

      <div className="glass p-5 rounded-xl border border-emerald-500/20 flex flex-col sm:flex-row items-center justify-between mt-6 bg-gradient-to-l from-emerald-500/10 to-transparent">
        <div>
          <p className="text-sm text-white/60">إجمالي فاتورة الشراء</p>
          <p className="text-3xl font-bold text-emerald-400">{totalCost.toLocaleString()} {currencyLabel}</p>
          {currency !== 'ILS' && <p className="text-xs text-white/50 mt-1">بتنحسب بالشيكل حسب سعر الصرف بالإعدادات</p>}
          {(totalCost - paid) > 0 && <p className="text-sm text-red-400 mt-1">الدين المتبقي للمورد: {(totalCost - paid).toLocaleString()} {currencyLabel}</p>}
        </div>
        <button onClick={handleSubmit} className="glass-button w-full sm:w-auto px-8 py-3 text-lg mt-4 sm:mt-0 !bg-emerald-600 hover:!bg-emerald-500" disabled={isPending || items.length === 0}>
          {isPending ? 'جاري الإدخال للمخزون...' : 'تأكيد وإدخال للمخزون'}
        </button>
      </div>
    </div>
  )
}

function PurchaseDetails({ invoice }: { invoice: any }) {
  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="glass p-3 rounded-lg">
          <p className="text-xs text-white/50">رقم الفاتورة</p>
          <p className="text-sm font-medium text-emerald-400">{invoice.invoiceNo}</p>
        </div>
        <div className="glass p-3 rounded-lg">
          <p className="text-xs text-white/50">تاريخ الشراء</p>
          <p className="text-sm font-medium text-white/90">{new Date(invoice.createdAt).toLocaleString('ar-PS')}</p>
        </div>
        <div className="glass p-3 rounded-lg col-span-2">
          <p className="text-xs text-white/50">المورد</p>
          <p className="text-sm font-medium text-white/90">{invoice.supplierName || 'مورد عام'}</p>
        </div>
      </div>

      <div className="glass-card overflow-x-auto">
        <table className="table-glass min-w-[500px]">
          <thead>
            <tr>
              <th>المنتج المورد</th>
              <th className="text-center">الكمية المدخلة</th>
              <th className="text-center">تكلفة القطعة</th>
              <th className="text-left">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items?.map((item: any, idx: number) => (
              <tr key={idx}>
                <td>
                  <div className="flex flex-col">
                    <span className="font-medium text-white">{item.name}</span>
                    <span className="text-[11px] text-white/50 mt-1">
                      النوع: {item.itemType === 'SILVER' ? 'فضة' : item.itemType === 'STEEL' ? 'ستانليس' : 'غير محدد'} 
                      {item.size && ` | المقاس: ${item.size}`}
                    </span>
                  </div>
                </td>
                <td className="text-center text-emerald-400 font-bold">+{item.quantity}</td>
                <td className="text-center text-white/90">{Number(item.unitCost || 0).toLocaleString()} ₪</td>
                <td className="text-left text-white font-medium">{Number(item.total || 0).toLocaleString()} ₪</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="glass p-4 rounded-lg space-y-3 border border-white/5">
        <div className="flex justify-between text-lg font-bold">
          <span className="text-white">إجمالي التكلفة</span>
          <span className="text-emerald-400">{Number(invoice.totalCost || 0).toLocaleString()} شيكل</span>
        </div>
        <div className="flex justify-between text-sm pt-2 border-t border-white/10">
          <span className="text-white/60">المدفوع للمورد</span>
          <span className="text-white/90">{Number(invoice.paid || 0).toLocaleString()} شيكل</span>
        </div>
        {(Number(invoice.totalCost) - Number(invoice.paid)) > 0 && (
          <div className="flex justify-between text-sm pt-1">
            <span className="text-white/60">الدين المتبقي للمورد</span>
            <span className="text-red-400">{Number((invoice.totalCost || 0) - (invoice.paid || 0)).toLocaleString()} شيكل</span>
          </div>
        )}
      </div>
    </div>
  )
}