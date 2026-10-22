import { useState, useEffect, useMemo } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import {
  Package, Users, Building2, AlertTriangle, TrendingUp, TrendingDown, ShoppingBag, Receipt, DollarSign, LogOut, Calendar
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

import { fetchAllDocs, isCancelled, useDataRefresh } from '@/lib/db'

// أضفنا لون جديد (للعلب والساعات) في الرسم البياني
const COLORS = ['#C5CBAF', '#2B3A32', '#d4af37', '#E8E8E8', '#A9A9A9']

export default function Dashboard() {
  const [products, setProducts] = useState<any[]>([])
  const [sales, setSales] = useState<any[]>([])
  const [purchases, setPurchases] = useState<any[]>([])
  const [expenses, setExpenses] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  
  const [dateFilter, setDateFilter] = useState('all') 

  const fetchData = async () => {
    setIsLoading(true)
    try {
      // سحب لا نهائي متوازي لجميع البيانات لضمان دقة الإحصائيات
      const [prodDocs, salesDocs, purDocs, expDocs, custDocs, suppDocs] = await Promise.all([
        fetchAllDocs('products'),
        fetchAllDocs('sales'),
        fetchAllDocs('purchases'),
        fetchAllDocs('expenses'),
        fetchAllDocs('customers'),
        fetchAllDocs('suppliers')
      ]);

      setProducts(prodDocs);
      setSales(salesDocs.sort((a:any, b:any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setPurchases(purDocs);
      setExpenses(expDocs);
      setCustomers(custDocs);
      setSuppliers(suppDocs);

    } catch (error) {
      console.error("خطأ في جلب بيانات لوحة التحكم:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])
  useDataRefresh(fetchData)

  const filterByDate = (items: any[]) => {
    if (dateFilter === 'all') return items;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today); monthAgo.setMonth(monthAgo.getMonth() - 1);

    return items.filter(item => {
      if (!item.createdAt) return false;
      const itemDate = new Date(item.createdAt);
      if (dateFilter === 'today') return itemDate >= today;
      if (dateFilter === 'yesterday') return itemDate >= yesterday && itemDate < today;
      if (dateFilter === 'week') return itemDate >= weekAgo;
      if (dateFilter === 'month') return itemDate >= monthAgo;
      return true;
    });
  }

  const filteredData = useMemo(() => {
    return {
      sales: filterByDate(sales.filter(s => !isCancelled(s))),
      purchases: filterByDate(purchases.filter(p => !isCancelled(p))),
      expenses: filterByDate(expenses.filter(e => !isCancelled(e))),
    }
  }, [sales, purchases, expenses, dateFilter])

  const stats = useMemo(() => {
    const totalSales = filteredData.sales.reduce((sum, s) => sum + (Number(s.totalRevenue) || Number(s.total) || 0), 0)
    const totalPurchases = filteredData.purchases.reduce((sum, p) => sum + (Number(p.totalCost) || Number(p.total) || 0), 0)
    const totalExpenses = filteredData.expenses.reduce((sum, e) => sum + (Number(e.amount) || Number(e.total) || 0), 0)
    // الربح الصافي = المبيعات - تكلفة البضاعة المباعة - المصاريف
    const costOfSales = filteredData.sales.reduce((sum, s) => sum + (Number(s.totalCost) || 0), 0)
    const netProfit = totalSales - costOfSales - totalExpenses
    
    const customerDebts = customers.reduce((sum, c) => sum + (Number(c.debt) || 0), 0)
    const supplierDebts = suppliers.reduce((sum, s) => sum + (Number(s.debt) || 0), 0)
    const lowStockProducts = products.filter(p => (Number(p.quantity) || 0) <= (Number(p.minQuantity) || 5)).length

    return { totalProducts: products.length, totalCustomers: customers.length, totalSuppliers: suppliers.length, lowStockProducts, totalSales, totalPurchases, totalExpenses, netProfit, customerDebts, supplierDebts }
  }, [products, filteredData, customers, suppliers])

  const chartItems = useMemo(() => {
    const dateMap: Record<string, any> = {};
    
    const processItems = (items: any[], type: 'مبيعات' | 'مشتريات' | 'مصاريف', amountKey: string) => {
      items.forEach(item => {
        if (!item.createdAt) return;
        const d = new Date(item.createdAt);
        const dateStr = d.toLocaleDateString('ar-PS', { month: 'short', day: 'numeric' });
        
        if (!dateMap[dateStr]) {
          dateMap[dateStr] = { date: dateStr, مبيعات: 0, مشتريات: 0, مصاريف: 0, sortDate: d.getTime() };
        }
        dateMap[dateStr][type] += (Number(item[amountKey]) || Number(item.total) || 0);
      });
    };

    processItems(filteredData.sales, 'مبيعات', 'totalRevenue');
    processItems(filteredData.purchases, 'مشتريات', 'totalCost');
    processItems(filteredData.expenses, 'مصاريف', 'amount');

    return Object.values(dateMap).sort((a: any, b: any) => a.sortDate - b.sortDate);
  }, [filteredData])

  // 🌟 تحديث دائرة الإحصائيات لتشمل "الساعات والعلب"
  const pieData = useMemo(() => {
    const silverProducts = products.filter(p => p.itemType === 'SILVER').length
    const steelProducts = products.filter(p => p.itemType === 'STEEL').length
    const otherProducts = products.filter(p => p.itemType === 'OTHER').length
    
    const data = [];
    if (silverProducts > 0) data.push({ name: 'منتجات الفضة', value: silverProducts });
    if (steelProducts > 0) data.push({ name: 'منتجات الستانليس', value: steelProducts });
    if (otherProducts > 0) data.push({ name: 'ساعات وعلب', value: otherProducts }); // إضافة الفئة الجديدة للدائرة
    
    if (data.length === 0) data.push({ name: 'لا توجد منتجات', value: 1 });

    return data;
  }, [products])

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <div className="w-12 h-12 border-4 border-[#C5CBAF] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-white/60 font-medium">جاري تحميل لوحة التحكم...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-title text-2xl font-bold text-white mb-1">لوحة التحكم</h1>
          <p className="text-white/50 text-sm">نظرة عامة على أداء المتجر</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="relative flex items-center bg-black/20 border border-[#C5CBAF]/20 rounded-lg p-1">
            <Calendar className="absolute right-3 w-4 h-4 text-[#C5CBAF]/60" />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="pl-4 pr-10 py-1.5 bg-transparent text-sm text-[#C5CBAF] focus:outline-none appearance-none cursor-pointer"
              dir="rtl"
            >
              <option value="all" className="bg-[#2B3A32]">كل الأوقات</option>
              <option value="today" className="bg-[#2B3A32]">اليوم</option>
              <option value="yesterday" className="bg-[#2B3A32]">الأمس</option>
              <option value="week" className="bg-[#2B3A32]">آخر 7 أيام</option>
              <option value="month" className="bg-[#2B3A32]">آخر شهر</option>
            </select>
          </div>

          <button 
            onClick={() => signOut(auth)}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all"
            title="تسجيل الخروج"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm font-medium">خروج</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card bg-gradient-to-br from-[#C5CBAF]/20 to-[#C5CBAF]/5 border border-white/[0.05] p-5 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-white/[0.05] flex items-center justify-center text-[#C5CBAF]"><Package className="w-5 h-5" /></div>
          </div>
          <p className="text-2xl font-bold text-white">{stats.totalProducts.toLocaleString()}</p>
          <p className="text-xs text-white/50 mt-1">إجمالي المنتجات بالمخزون</p>
        </div>
        <div className="stat-card bg-gradient-to-br from-white/10 to-white/5 border border-white/[0.05] p-5 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-white/[0.05] flex items-center justify-center text-white/80"><Users className="w-5 h-5" /></div>
          </div>
          <p className="text-2xl font-bold text-white">{stats.totalCustomers.toLocaleString()}</p>
          <p className="text-xs text-white/50 mt-1">العملاء المسجلين</p>
        </div>
        <div className="stat-card bg-gradient-to-br from-silver-400/20 to-silver-500/10 border border-white/[0.05] p-5 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-white/[0.05] flex items-center justify-center text-silver-400"><Building2 className="w-5 h-5" /></div>
          </div>
          <p className="text-2xl font-bold text-white">{stats.totalSuppliers.toLocaleString()}</p>
          <p className="text-xs text-white/50 mt-1">الموردين والشركات</p>
        </div>
        <div className="stat-card bg-gradient-to-br from-red-500/20 to-red-600/10 border border-white/[0.05] p-5 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-white/[0.05] flex items-center justify-center text-red-400"><AlertTriangle className="w-5 h-5" /></div>
            {stats.lowStockProducts > 0 && <span className="badge-danger text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-400">تنبيه نفاد</span>}
          </div>
          <p className="text-2xl font-bold text-white">{stats.lowStockProducts.toLocaleString()}</p>
          <p className="text-xs text-white/50 mt-1">منتجات أوشكت على النفاد</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-5 border-b-2 border-b-[#C5CBAF]/50 bg-black/20 rounded-xl">
          <div className="flex items-center gap-3 mb-2"><div className="w-8 h-8 rounded-lg bg-[#C5CBAF]/10 flex items-center justify-center"><DollarSign className="w-4 h-4 text-[#C5CBAF]" /></div><span className="text-sm text-white/60">المبيعات ({dateFilter === 'all' ? 'الكلي' : 'للفترة'})</span></div>
          <p className="text-xl font-bold text-[#C5CBAF]">{stats.totalSales.toLocaleString()} ₪</p>
        </div>
        <div className="glass-card p-5 border-b-2 border-b-white/20 bg-black/20 rounded-xl">
          <div className="flex items-center gap-3 mb-2"><div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center"><ShoppingBag className="w-4 h-4 text-white/80" /></div><span className="text-sm text-white/60">المشتريات ({dateFilter === 'all' ? 'الكلي' : 'للفترة'})</span></div>
          <p className="text-xl font-bold text-white/90">{stats.totalPurchases.toLocaleString()} ₪</p>
        </div>
        <div className="glass-card p-5 border-b-2 border-b-red-500/30 bg-black/20 rounded-xl">
          <div className="flex items-center gap-3 mb-2"><div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center"><Receipt className="w-4 h-4 text-red-400" /></div><span className="text-sm text-white/60">المصاريف ({dateFilter === 'all' ? 'الكلي' : 'للفترة'})</span></div>
          <p className="text-xl font-bold text-red-400">{stats.totalExpenses.toLocaleString()} ₪</p>
        </div>
        <div className="glass-card p-5 border-b-2 border-b-emerald-500/30 bg-black/20 rounded-xl">
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${stats.netProfit >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
              {stats.netProfit >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
            </div>
            <span className="text-sm text-white/60">صافي الربح ({dateFilter === 'all' ? 'الكلي' : 'للفترة'})</span>
          </div>
          <p className={`text-xl font-bold ${stats.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{stats.netProfit.toLocaleString()} ₪</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-card p-4 sm:p-6 lg:col-span-2 overflow-x-auto bg-black/20 rounded-xl border border-white/5">
          <h3 className="section-title mb-4 text-lg font-medium text-white/90">الحركة المالية ({dateFilter === 'all' ? 'كل الأوقات' : 'للفترة المحددة'})</h3>
          <div className="min-w-[500px]">
            {chartItems.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartItems}>
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#C5CBAF" stopOpacity={0.3} /><stop offset="95%" stopColor="#C5CBAF" stopOpacity={0} /></linearGradient>
                    <linearGradient id="purchaseGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#E8E8E8" stopOpacity={0.2} /><stop offset="95%" stopColor="#E8E8E8" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(197,203,175,0.05)" />
                  <XAxis dataKey="date" stroke="rgba(197,203,175,0.4)" fontSize={11} />
                  <YAxis stroke="rgba(197,203,175,0.4)" fontSize={11} />
                  <Tooltip contentStyle={{ background: '#2B3A32', border: '1px solid rgba(197,203,175,0.1)', borderRadius: '8px', color: '#C5CBAF', fontSize: '12px' }} />
                  <Area isAnimationActive={false} type="monotone" dataKey="مبيعات" stroke="#C5CBAF" fillOpacity={1} fill="url(#salesGrad)" strokeWidth={2} />
                  <Area isAnimationActive={false} type="monotone" dataKey="مشتريات" stroke="#E8E8E8" fillOpacity={1} fill="url(#purchaseGrad)" strokeWidth={2} />
                  <Area isAnimationActive={false} type="monotone" dataKey="مصاريف" stroke="#ef4444" fill="transparent" strokeWidth={2} strokeDasharray="5 5" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
               <div className="h-[280px] flex items-center justify-center text-white/30 text-sm">لا توجد حركات مالية في هذه الفترة</div>
            )}
          </div>
        </div>

        <div className="glass-card p-4 sm:p-6 bg-black/20 rounded-xl border border-white/5">
          <h3 className="section-title mb-4 text-lg font-medium text-white/90">توزيع المنتجات</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie isAnimationActive={false} data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="value">
                {pieData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#2B3A32', border: '1px solid rgba(197,203,175,0.1)', borderRadius: '8px', color: '#C5CBAF' }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 mt-2">
            {pieData.map((entry, index) => (
              entry.name !== 'لا توجد منتجات' && (
                <div key={entry.name} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[index] }} />
                  <span className="text-xs text-white/60">{entry.name}: {entry.value}</span>
                </div>
              )
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}