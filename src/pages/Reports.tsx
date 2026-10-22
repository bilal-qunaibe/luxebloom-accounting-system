import { useState, useEffect, useMemo } from 'react'
import { Download, Calendar } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import jsPDF from 'jspdf'

import { fetchAllDocs, isCancelled, useDataRefresh } from '@/lib/db'

export default function Reports() {
  const [activeTab, setActiveTab] = useState('sales')
  const [isLoading, setIsLoading] = useState(true)
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    endDate: new Date(),
  })

  const [allSales, setAllSales] = useState<any[]>([])
  const [allPurchases, setAllPurchases] = useState<any[]>([])
  const [allProducts, setAllProducts] = useState<any[]>([])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [salesData, purData, prodData] = await Promise.all([
        fetchAllDocs('sales'),
        fetchAllDocs('purchases'),
        fetchAllDocs('products')
      ])

      // الفواتير الملغاة ما بتدخل بالتقارير
      setAllSales(salesData.filter((d: any) => !isCancelled(d)))
      setAllPurchases(purData.filter((d: any) => !isCancelled(d)))
      setAllProducts(prodData)
    } catch (error) {
      console.error("خطأ في جلب بيانات التقارير:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])
  useDataRefresh(fetchData)

  // حسابات تقرير المبيعات
  const salesReport = useMemo(() => {
    const filtered = allSales.filter(inv => {
      const d = new Date(inv.createdAt)
      return d >= dateRange.startDate && d <= new Date(dateRange.endDate.getTime() + 86400000)
    })
    const summary = filtered.reduce((acc, inv) => {
      acc.totalAmount += Number(inv.totalRevenue) || 0 
      acc.totalPaid += Number(inv.paid) || 0
      acc.totalUnpaid += Math.max(0, (Number(inv.totalRevenue) || 0) - (Number(inv.paid) || 0))
      return acc
    }, { totalAmount: 0, totalPaid: 0, totalUnpaid: 0 })
    return { invoices: filtered, summary: { totalInvoices: filtered.length, ...summary } }
  }, [allSales, dateRange])

  // حسابات تقرير المشتريات
  const purchasesReport = useMemo(() => {
    const filtered = allPurchases.filter(inv => {
      const d = new Date(inv.createdAt)
      return d >= dateRange.startDate && d <= new Date(dateRange.endDate.getTime() + 86400000)
    })
    const summary = filtered.reduce((acc, inv) => {
      acc.totalAmount += Number(inv.totalCost) || 0 
      acc.totalPaid += Number(inv.paid) || 0
      acc.totalUnpaid += Math.max(0, (Number(inv.totalCost) || 0) - (Number(inv.paid) || 0))
      return acc
    }, { totalAmount: 0, totalPaid: 0, totalUnpaid: 0 })
    return { invoices: filtered, summary: { totalInvoices: filtered.length, ...summary } }
  }, [allPurchases, dateRange])

  // حسابات تقرير المخزون
  const inventoryReport = useMemo(() => {
    const summary = allProducts.reduce((acc, p) => {
      acc.totalQuantity += Number(p.quantity) || 0
      acc.totalWeight += Number(p.weightGram) || 0
      acc.totalValue += (Number(p.quantity) || 0) * (Number(p.purchasePrice) || 0)
      return acc
    }, { totalQuantity: 0, totalWeight: 0, totalValue: 0 })
    return { products: allProducts, summary: { totalProducts: allProducts.length, ...summary } }
  }, [allProducts])

  // داتا الرسم البياني
  const salesChartData = useMemo(() => {
    const chartMap = salesReport.invoices.reduce((acc: any, inv: any) => {
      const date = new Date(inv.createdAt).toLocaleDateString('ar-PS', { month: 'short', day: 'numeric' })
      acc[date] = (acc[date] || 0) + (Number(inv.totalRevenue) || 0)
      return acc
    }, {})
    return Object.entries(chartMap).map(([date, value]) => ({ date, value }))
  }, [salesReport.invoices])

  const exportPDF = (title: string, content: string) => {
    const doc = new jsPDF(); 
    doc.text(title, 10, 10); 
    doc.text(content, 10, 20); 
    doc.save(`${title}.pdf`)
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <div className="w-12 h-12 border-4 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-white/60 font-medium">جاري معالجة التقارير...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="page-title">التقارير</h1><p className="text-white/50 text-sm mt-1">تقارير وكشوفات شاملة</p></div>
      </div>
      
      <div className="glass p-4 rounded-xl flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-white/40" />
          <span className="text-sm text-white/60">من</span>
          <input type="date" value={dateRange.startDate.toISOString().split('T')[0]} onChange={(e) => setDateRange({ ...dateRange, startDate: new Date(e.target.value) })} className="glass-input" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-white/60">إلى</span>
          <input type="date" value={dateRange.endDate.toISOString().split('T')[0]} onChange={(e) => setDateRange({ ...dateRange, endDate: new Date(e.target.value) })} className="glass-input" />
        </div>
      </div>

      <div className="glass p-1 rounded-xl flex gap-1 overflow-x-auto custom-scrollbar">
        {[ { id: 'sales', label: 'تقرير المبيعات' }, { id: 'purchases', label: 'تقرير المشتريات' }, { id: 'inventory', label: 'تقرير المخزون' } ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 py-2.5 px-4 whitespace-nowrap rounded-lg text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-gold-500/20 text-gold-400' : 'text-white/50 hover:text-white/70'}`}>{tab.label}</button>
        ))}
      </div>

      {activeTab === 'sales' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card p-4"><p className="text-xs text-white/50">عدد الفواتير</p><p className="text-xl font-bold text-white">{salesReport.summary.totalInvoices}</p></div>
            <div className="glass-card p-4"><p className="text-xs text-white/50">الإجمالي</p><p className="text-xl font-bold text-gold-400">{salesReport.summary.totalAmount.toLocaleString()} ₪</p></div>
            <div className="glass-card p-4"><p className="text-xs text-white/50">المدفوع</p><p className="text-xl font-bold text-emerald-400">{salesReport.summary.totalPaid.toLocaleString()} ₪</p></div>
            <div className="glass-card p-4"><p className="text-xs text-white/50">الذمم (متبقي)</p><p className="text-xl font-bold text-red-400">{salesReport.summary.totalUnpaid.toLocaleString()} ₪</p></div>
          </div>
          
          {salesChartData.length > 0 && (
            <div className="glass-card p-6">
              <h3 className="section-title mb-4">رسم بياني للمبيعات</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={salesChartData}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" /><XAxis dataKey="date" stroke="rgba(255,255,255,0.3)" fontSize={11} /><YAxis stroke="rgba(255,255,255,0.3)" fontSize={11} /><Tooltip contentStyle={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} /><Bar dataKey="value" fill="#D4AF37" radius={[6, 6, 0, 0]} /></BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="glass-card overflow-hidden">
            <div className="p-4 flex items-center justify-between"><h3 className="section-title">تفاصيل الفواتير</h3><button onClick={() => exportPDF('تقرير المبيعات', 'محتوى التقرير')} className="glass-button-secondary text-xs flex items-center gap-1"><Download className="w-3.5 h-3.5" /> PDF</button></div>
            <div className="overflow-x-auto">
              <table className="table-glass min-w-[600px]">
                <thead><tr><th>الرقم</th><th>العميل</th><th>التاريخ</th><th>الإجمالي</th><th>الحالة</th></tr></thead>
                <tbody>
                  {salesReport.invoices.map((inv: any) => (<tr key={inv.id}><td className="font-mono text-gold-400">{inv.invoiceNo}</td><td>{inv.customerName || 'نقدي'}</td><td>{new Date(inv.createdAt).toLocaleDateString('ar-PS')}</td><td className="text-gold-400">{Number(inv.totalRevenue || 0).toLocaleString()} ₪</td><td><span className="badge-success">مؤكدة</span></td></tr>))}
                  {salesReport.invoices.length === 0 && <tr><td colSpan={5} className="text-center py-4 text-white/40">لا توجد مبيعات في هذه الفترة</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'purchases' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card p-4"><p className="text-xs text-white/50">عدد الفواتير</p><p className="text-xl font-bold text-white">{purchasesReport.summary.totalInvoices}</p></div>
            <div className="glass-card p-4"><p className="text-xs text-white/50">الإجمالي</p><p className="text-xl font-bold text-emerald-400">{purchasesReport.summary.totalAmount.toLocaleString()} ₪</p></div>
            <div className="glass-card p-4"><p className="text-xs text-white/50">المدفوع</p><p className="text-xl font-bold text-blue-400">{purchasesReport.summary.totalPaid.toLocaleString()} ₪</p></div>
            <div className="glass-card p-4"><p className="text-xs text-white/50">الذمم (متبقي)</p><p className="text-xl font-bold text-red-400">{purchasesReport.summary.totalUnpaid.toLocaleString()} ₪</p></div>
          </div>
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table-glass min-w-[600px]">
                <thead><tr><th>الرقم</th><th>المورد</th><th>التاريخ</th><th>الإجمالي</th></tr></thead>
                <tbody>
                  {purchasesReport.invoices.map((inv: any) => (<tr key={inv.id}><td className="font-mono text-emerald-400">{inv.invoiceNo}</td><td>{inv.supplierName}</td><td>{new Date(inv.createdAt).toLocaleDateString('ar-PS')}</td><td className="text-emerald-400">{Number(inv.totalCost || 0).toLocaleString()} ₪</td></tr>))}
                  {purchasesReport.invoices.length === 0 && <tr><td colSpan={4} className="text-center py-4 text-white/40">لا توجد مشتريات في هذه الفترة</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'inventory' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card p-4"><p className="text-xs text-white/50">إجمالي المنتجات</p><p className="text-xl font-bold text-white">{inventoryReport.summary.totalProducts}</p></div>
            <div className="glass-card p-4"><p className="text-xs text-white/50">إجمالي الكمية</p><p className="text-xl font-bold text-gold-400">{inventoryReport.summary.totalQuantity.toLocaleString()}</p></div>
            <div className="glass-card p-4"><p className="text-xs text-white/50">إجمالي الوزن</p><p className="text-xl font-bold text-silver-400">{inventoryReport.summary.totalWeight.toLocaleString()} غ</p></div>
            <div className="glass-card p-4"><p className="text-xs text-white/50">قيمة المخزون (تكلِفة)</p><p className="text-xl font-bold text-emerald-400">{inventoryReport.summary.totalValue.toLocaleString()} ₪</p></div>
          </div>
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table-glass min-w-[700px]">
                <thead><tr><th>الكود</th><th>المنتج</th><th>الكمية</th><th>الوزن</th><th>سعر الشراء</th><th>قيمة البضاعة</th></tr></thead>
                <tbody>
                  {inventoryReport.products.map((product: any) => (<tr key={product.id}><td className="font-mono text-gold-400">{product.code}</td><td>{product.name}</td><td>{product.quantity}</td><td>{product.weightGram || 0} غ</td><td>{Number(product.purchasePrice || 0).toLocaleString()} ₪</td><td className="text-emerald-400">{(Number(product.purchasePrice || 0) * Number(product.quantity || 0)).toLocaleString()} ₪</td></tr>))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}