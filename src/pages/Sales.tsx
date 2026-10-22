import { useState, useEffect } from 'react'
import { Plus, Search, Eye, X, ChevronDown, Ban } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { callAction, fetchAllDocs, isCancelled, byNewest, PAYMENT_METHODS, useDataRefresh } from '@/lib/db'

export default function Sales() {
  const [search, setSearch] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [invoices, setInvoices] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [customers, setCustomers] = useState<any[]>([])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [allProds, allSales, allCustomers] = await Promise.all([
        fetchAllDocs('products'),
        fetchAllDocs('sales'),
        fetchAllDocs('customers'),
      ])
      setProducts(allProds)
      setInvoices(allSales)
      setCustomers(allCustomers)
    } catch (error) {
      console.error("خطأ في الجلب:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = async (inv: any) => {
    const reason = window.prompt(`سبب إلغاء الفاتورة ${inv.invoiceNo}؟ (رح ترجع الكميات للمخزون وينعمل قيد عكسي)`)
    if (reason === null) return
    try {
      await callAction('document.reverse', { kind: 'sale', id: inv.id, reason })
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
    .filter(inv => inv.invoiceNo?.toLowerCase().includes(search.toLowerCase()) || inv.customerName?.includes(search))
    .sort(byNewest);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-title">المبيعات</h1>
          <p className="text-white/50 text-sm mt-1">فواتير البيع ونقاط البيع</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <button className="glass-button flex items-center justify-center gap-2 w-full sm:w-auto">
              <Plus className="w-4 h-4" /> فاتورة بيع جديدة
            </button>
          </DialogTrigger>
          <DialogContent className="glass-panel border-white/10 max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-white text-right">فاتورة بيع جديدة</DialogTitle>
            </DialogHeader>
            <SalesInvoiceForm 
              onSuccess={() => { setIsDialogOpen(false); fetchData(); }} 
              products={products} 
              customers={customers}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="glass p-4 rounded-xl">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input type="text" placeholder="البحث برقم الفاتورة أو العميل..." value={search} onChange={(e) => setSearch(e.target.value)} className="glass-input w-full pr-10" />
        </div>
      </div>

      <div className="glass-card overflow-x-auto">
        <table className="table-glass min-w-[800px]">
          <thead>
            <tr>
              <th>رقم الفاتورة</th>
              <th>العميل</th>
              <th>التاريخ</th>
              <th>الإجمالي (المبيعات)</th>
              <th>صافي الربح</th>
              <th>المدفوع</th>
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
                  <td className="font-mono text-gold-400">{inv.invoiceNo}</td>
                  <td>{inv.customerName || 'عميل نقدي'}</td>
                  <td>{new Date(inv.createdAt).toLocaleDateString('ar-PS')}</td>
                  <td className="text-gold-400 font-medium">{Number(inv.totalRevenue || 0).toLocaleString()} ₪</td>
                  <td className="text-emerald-400 font-medium">{Number(inv.netProfit || 0).toLocaleString()} ₪</td>
                  <td>{Number(inv.paid || 0).toLocaleString()} ₪</td>
                  <td>{isCancelled(inv) ? <span className="badge-danger">ملغاة</span> : <span className="badge-success">مؤكدة</span>}</td>
                  <td className="flex items-center gap-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <button className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center hover:bg-white/[0.1] transition-colors">
                          <Eye className="w-3.5 h-3.5 text-white/60" />
                        </button>
                      </DialogTrigger>
                      <DialogContent className="glass-panel border-white/10 max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle className="text-white text-right">تفاصيل الفاتورة {inv.invoiceNo}</DialogTitle>
                        </DialogHeader>
                        <InvoiceDetails invoice={inv} />
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

function SalesInvoiceForm({ onSuccess, products, customers }: { onSuccess: () => void, products: any[], customers: any[] }) {
  const [isPending, setIsPending] = useState(false)
  const [items, setItems] = useState<Array<{ 
    itemType: string; 
    productId: string; 
    name: string; 
    size: string; 
    quantity: number; 
    purchasePrice: number; 
    unitPrice: number; 
    total: number 
  }>>([])
  
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [customerId, setCustomerId] = useState('')
  const [notes, setNotes] = useState('')
  const [paid, setPaid] = useState(0)

  const [openDropdownIdx, setOpenDropdownIdx] = useState<number | null>(null)
  const [productSearchTerm, setProductSearchTerm] = useState('')

  const addItem = () => {
    setItems([...items, { itemType: '', productId: '', name: '', size: '', quantity: 1, purchasePrice: 0, unitPrice: 0, total: 0 }])
  }

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items]
    newItems[index] = { ...newItems[index], [field]: value }
    
    if (field === 'itemType') {
      newItems[index].productId = ''
      newItems[index].name = ''
      newItems[index].size = ''
      newItems[index].purchasePrice = 0
      newItems[index].unitPrice = 0
      newItems[index].total = 0
    }
    
    if (field === 'productId') {
      const product = products.find((p: any) => p.id === value)
      if (product) {
        newItems[index].name = product.name
        newItems[index].purchasePrice = Number(product.purchasePrice) || 0 
        newItems[index].unitPrice = Number(product.salePrice) || 0
        newItems[index].size = '' 
        newItems[index].itemType = product.itemType || newItems[index].itemType 
      }
    }
    
    newItems[index].total = newItems[index].quantity * newItems[index].unitPrice
    setItems(newItems)
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const totalRevenue = items.reduce((sum, item) => sum + item.total, 0)
  const totalCost = items.reduce((sum, item) => sum + (item.quantity * item.purchasePrice), 0)

  useEffect(() => {
    setPaid(totalRevenue)
  }, [totalRevenue])

  const handleSubmit = async () => {
    if (items.length === 0) return alert("الرجاء إضافة منتجات للفاتورة")
    if (items.some(i => !i.productId)) return alert("الرجاء تحديد المنتج في جميع الصفوف")
    
    const missingSize = items.some(item => {
      const prod = products.find(p => p.id === item.productId)
      const hasSizes = prod?.variants && prod.variants.length > 0;
      return hasSizes && !item.size 
    })
    if (missingSize) return alert("الرجاء تحديد المقاس لجميع المنتجات التي تمتلك مقاسات!")

    // فحص توفر الكميات قبل الإرسال
    for (const item of items) {
      const prod = products.find(p => p.id === item.productId)
      if (prod) {
        const hasSizes = prod.variants && prod.variants.length > 0;
        if (hasSizes && item.size) {
          const variant = prod.variants.find((v: any) => v.size === item.size)
          if (!variant || Number(variant.quantity) < item.quantity) {
            return alert(`الكمية المطلوبة للمقاس (${item.size}) من المنتج [${item.name}] غير متوفرة! المتاح: ${variant?.quantity || 0}`)
          }
        } else if (Number(prod.quantity) < item.quantity) {
          return alert(`الكمية المطلوبة من المنتج [${item.name}] غير متوفرة! المتاح في المخزون: ${prod.quantity || 0}`)
        }
      }
    }
    
    if (paid > totalRevenue) return alert("المبلغ المدفوع أكبر من قيمة الفاتورة")
    if (paid < totalRevenue && !customerId) return alert("في مبلغ متبقي، اختار العميل عشان ينسجل عليه كدين")

    setIsPending(true)
    try {
      // السيرفر بيخصم المخزون ويعمل القيود ويسجل الدين بعملية وحدة
      await callAction('sale.create', {
        items: items.map(i => ({ productId: i.productId, size: i.size, quantity: i.quantity, unitPrice: i.unitPrice })),
        customerId: customerId || undefined,
        paid,
        paymentMethod,
        notes,
      })
      onSuccess()
    } catch (error: any) {
      console.error("Error creating sale: ", error)
      alert(error.message || "حدث خطأ أثناء حفظ الفاتورة")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm text-white/60 mb-1">العميل</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="glass-input w-full">
            <option value="">عميل نقدي</option>
            {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` - ${c.phone}` : ''}</option>)}
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
          <label className="text-sm font-medium text-white">المنتجات المختارة</label>
          <button onClick={addItem} className="text-sm bg-gold-500/20 text-gold-400 hover:bg-gold-500/30 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors">
            <Plus className="w-4 h-4" /> إضافة منتج
          </button>
        </div>
        
        <div className="space-y-3 max-h-[45vh] overflow-y-auto overflow-x-auto pr-2 custom-scrollbar">
          <div className="min-w-[700px] pb-2">
            {items.map((item, index) => {
              const selectedProduct = products.find(p => p.id === item.productId)
              const hasSizes = selectedProduct?.variants && selectedProduct.variants.length > 0
              const availableSizes = selectedProduct?.variants || []
              
              const availableProductsList = products.filter(p => 
                (item.itemType ? p.itemType === item.itemType : true) && Number(p.quantity) > 0 && p.isActive !== false
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

                    {/* قائمة المنتجات مع بحث ذكي */}
                    <div className={hasSizes ? "col-span-3 relative" : "col-span-5 relative"}>
                      <label className="text-[10px] text-white/40 mb-1 block">المنتج</label>
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
                                    <span className="text-white/40 text-[10px]">متوفر: {p.quantity}</span>
                                  </div>
                              ))}
                              {availableProductsList.filter(p => p.name.includes(productSearchTerm)).length === 0 && (
                                <div className="p-2 text-xs text-white/40 text-center">لا يوجد نتائج</div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* خيار المقاس: إلزامي للمنتجات التي تمتلك مقاسات */}
                    {hasSizes && (
                      <div className="col-span-2">
                        <label className="text-[10px] text-gold-400 mb-1 block">المقاس (إلزامي)</label>
                        <select value={item.size} onChange={(e) => updateItem(index, 'size', e.target.value)} className="glass-input w-full text-xs border-gold-500/50" required>
                          <option value="">اختر مقاس</option>
                          {availableSizes
                            .filter((v: any) => Number(v.quantity) > 0)
                            .map((v: any, i: number) => (
                              <option key={i} value={v.size}>مقاس {v.size} (متوفر: {v.quantity})</option>
                            ))}
                        </select>
                      </div>
                    )}

                    {/* الكمية */}
                    <div className="col-span-2">
                      <label className="text-[10px] text-white/40 mb-1 block">الكمية</label>
                      <input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)} className="glass-input w-full text-xs text-center" />
                    </div>

                    {/* سعر البيع للقطعة */}
                    <div className="col-span-2">
                      <label className="text-[10px] text-white/40 mb-1 block">السعر للقطعة</label>
                      <input type="number" value={item.unitPrice} onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value) || 0)} className="glass-input w-full text-xs" />
                    </div>

                    {/* الإجمالي والمسح */}
                    <div className="col-span-1 flex items-center justify-end gap-2 pb-1">
                      <span className="text-sm font-medium text-gold-400 min-w-[3rem] text-center">{item.total} ₪</span>
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
          <label className="block text-sm text-white/60 mb-1">المبلغ المدفوع</label>
          <input type="number" value={paid} onChange={(e) => setPaid(parseFloat(e.target.value) || 0)} className="glass-input w-full text-emerald-400 font-bold" />
        </div>
      </div>

      <div className="glass p-5 rounded-xl border border-gold-500/20 flex flex-col sm:flex-row items-center justify-between mt-6 bg-gradient-to-l from-gold-500/10 to-transparent">
        <div>
          <p className="text-sm text-white/60">الإجمالي النهائي</p>
          <p className="text-3xl font-bold text-gold-400">{totalRevenue.toLocaleString()} شيكل</p>
          {(totalRevenue - paid) > 0 && <p className="text-sm text-red-400 mt-1">المتبقي على العميل: {(totalRevenue - paid).toLocaleString()} شيكل {!customerId && '(اختار العميل)'}</p>}
          {items.length > 0 && <p className="text-xs text-emerald-400/80 mt-1">الربح المتوقع: {(totalRevenue - totalCost).toLocaleString()} شيكل</p>}
        </div>
        <button onClick={handleSubmit} className="glass-button w-full sm:w-auto px-8 py-3 text-lg mt-4 sm:mt-0" disabled={isPending || items.length === 0}>
          {isPending ? 'جاري الحفظ والخصم...' : 'تأكيد وحفظ الفاتورة'}
        </button>
      </div>
    </div>
  )
}

function InvoiceDetails({ invoice }: { invoice: any }) {
  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="glass p-3 rounded-lg">
          <p className="text-xs text-white/50">رقم الفاتورة / العميل</p>
          <p className="text-sm font-medium text-gold-400">{invoice.invoiceNo}</p>
          <p className="text-xs text-white/70 mt-1">{invoice.customerName || 'عميل نقدي'}</p>
        </div>
        <div className="glass p-3 rounded-lg">
          <p className="text-xs text-white/50">تاريخ البيع</p>
          <p className="text-sm font-medium text-white/90">{new Date(invoice.createdAt).toLocaleString('ar-PS')}</p>
        </div>
      </div>

      <div className="glass-card overflow-x-auto">
        <table className="table-glass min-w-[500px]">
          <thead>
            <tr>
              <th>المنتج والتفاصيل</th>
              <th className="text-center">الكمية</th>
              <th className="text-center">سعر القطعة</th>
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
                <td className="text-center text-white/90">{item.quantity}</td>
                <td className="text-center text-white/90">{Number(item.unitPrice || 0).toLocaleString()} ₪</td>
                <td className="text-left text-gold-400 font-medium">{Number(item.total || 0).toLocaleString()} ₪</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="glass p-4 rounded-lg space-y-3">
        <div className="flex justify-between text-lg font-bold">
          <span className="text-white">إجمالي المبيعات</span>
          <span className="text-gold-400">{Number(invoice.totalRevenue || 0).toLocaleString()} شيكل</span>
        </div>
        <div className="flex justify-between text-sm pt-2 border-t border-white/10">
          <span className="text-white/60">المدفوع من العميل</span>
          <span className="text-emerald-400">{Number(invoice.paid || 0).toLocaleString()} شيكل</span>
        </div>
        {(Number(invoice.totalRevenue) - Number(invoice.paid)) > 0 && (
          <div className="flex justify-between text-sm pt-1">
            <span className="text-white/60">المتبقي كدين</span>
            <span className="text-red-400">{Number((invoice.totalRevenue || 0) - (invoice.paid || 0)).toLocaleString()} شيكل</span>
          </div>
        )}
      </div>
      
      {isCancelled(invoice) && (
        <div className="bg-red-500/10 p-3 rounded border border-red-500/20 text-sm text-red-300">
          ملغاة{invoice.cancelReason ? `: ${invoice.cancelReason}` : ''}
        </div>
      )}
      {invoice.origin === 'assistant' && <p className="text-[11px] text-white/40">أضيفت عن طريق المساعد</p>}

      <div className="bg-black/30 p-3 rounded border border-emerald-500/20 flex justify-between items-center">
        <span className="text-xs text-white/50">صافي الربح المُسجل في هذه الفاتورة:</span>
        <span className="text-sm font-bold text-emerald-400">{Number(invoice.netProfit || 0).toLocaleString()} ₪</span>
      </div>
    </div>
  )
}