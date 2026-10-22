import { useState, useEffect, useMemo } from 'react'
import { Plus, BookOpen, TrendingUp, TrendingDown, Scale, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { callAction, fetchAllDocs, isCancelled, useDataRefresh } from '@/lib/db'
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'


export default function Accounting() {
  const [activeTab, setActiveTab] = useState('accounts')
  const [accounts, setAccounts] = useState<any[]>([])
  const [journalEntries, setJournalEntries] = useState<any[]>([])
  const [sales, setSales] = useState<any[]>([])
  const [expenses, setExpenses] = useState<any[]>([])
  
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isJournalOpen, setIsJournalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [accData, jeData, salesData, expData] = await Promise.all([
        fetchAllDocs('accounts'),
        fetchAllDocs('journalEntries'),
        fetchAllDocs('sales'),
        fetchAllDocs('expenses')
      ])

      setAccounts(accData)
      setJournalEntries(jeData.sort((a:any, b:any) => String(b.entryNo || '').localeCompare(String(a.entryNo || '')) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
      setSales(salesData)
      setExpenses(expData)
    } catch (error) {
      console.error("خطأ في جلب البيانات المحاسبية:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])
  useDataRefresh(fetchData)

  const reverseEntry = async (entry: any) => {
    if (!window.confirm(`إلغاء القيد ${entry.entryNo}؟ رح ينعمل قيد عكسي.`)) return
    try {
      await callAction('document.reverse', { kind: 'journal', id: entry.id })
      fetchData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  // الربح = المبيعات - تكلفة البضاعة المباعة - المصاريف (المشتريات بتدخل المخزون مش مصروف)
  const liveSales = sales.filter(s => !isCancelled(s))
  const autoRevenue = liveSales.reduce((sum, s) => sum + (Number(s.totalRevenue) || Number(s.total) || 0), 0)
  const autoCost = liveSales.reduce((sum, s) => sum + (Number(s.totalCost) || 0), 0)
  const autoExpenses = expenses.filter(e => !isCancelled(e)).reduce((sum, e) => sum + (Number(e.amount) || Number(e.total) || 0), 0)
  const totalOut = autoCost + autoExpenses
  const autoNetProfit = autoRevenue - totalOut

  const chartData = [
    { name: 'الإيرادات', value: autoRevenue },
    { name: 'تكلفة البضاعة', value: autoCost },
    { name: 'المصاريف', value: autoExpenses },
    { name: 'صافي الربح', value: autoNetProfit },
  ]

  const accountsWithBalance = useMemo(() => {
    return accounts.map(acc => {
      let balance = Number(acc.openingBalance) || 0;
      journalEntries.forEach(entry => {
        (entry.items || []).forEach((item: any) => {
          if (item.debitAccountId === acc.id) {
            balance += ['ASSET', 'EXPENSE'].includes(acc.type) ? Number(item.debit || 0) : -Number(item.debit || 0);
          }
          if (item.creditAccountId === acc.id) {
            balance += ['ASSET', 'EXPENSE'].includes(acc.type) ? -Number(item.credit || 0) : Number(item.credit || 0);
          }
        })
      })
      return { ...acc, currentBalance: balance }
    })
  }, [accounts, journalEntries])

  const assetAccounts = accountsWithBalance.filter(a => a.type === 'ASSET')
  const liabilityAccounts = accountsWithBalance.filter(a => a.type === 'LIABILITY')
  const equityAccounts = accountsWithBalance.filter(a => a.type === 'EQUITY')
  const revenueAccounts = accountsWithBalance.filter(a => a.type === 'REVENUE')
  const expenseAccounts = accountsWithBalance.filter(a => a.type === 'EXPENSE')

  const financialStatements = useMemo(() => {
    const revenue = revenueAccounts.reduce((sum, a) => sum + a.currentBalance, 0)
    const exps = expenseAccounts.reduce((sum, a) => sum + a.currentBalance, 0)
    const assets = assetAccounts.reduce((sum, a) => sum + a.currentBalance, 0)
    const liabilities = liabilityAccounts.reduce((sum, a) => sum + a.currentBalance, 0)
    const equity = equityAccounts.reduce((sum, a) => sum + a.currentBalance, 0)
    return {
      incomeStatement: { revenue, expenses: exps, netProfit: revenue - exps },
      balanceSheet: { assets, liabilities, equity, totalLiabilitiesAndEquity: liabilities + equity }
    }
  }, [accountsWithBalance])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="page-title">المحاسبة</h1><p className="text-white/50 text-sm mt-1">القيود المحاسبية والكشوفات المالية</p></div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-5 border-r-2 border-r-emerald-500/50">
          <div className="flex items-center gap-3"><TrendingUp className="w-5 h-5 text-emerald-400" /><div><p className="text-xs text-white/50">إجمالي المبيعات</p><p className="text-xl font-bold text-emerald-400">{autoRevenue.toLocaleString()} ₪</p></div></div>
        </div>
        <div className="glass-card p-5 border-r-2 border-r-red-500/50">
          <div className="flex items-center gap-3"><TrendingDown className="w-5 h-5 text-red-400" /><div><p className="text-xs text-white/50">تكلفة البضاعة + المصاريف</p><p className="text-xl font-bold text-red-400">{totalOut.toLocaleString()} ₪</p></div></div>
        </div>
        <div className="glass-card p-5 border-r-2 border-r-gold-500/50">
          <div className="flex items-center gap-3"><Scale className="w-5 h-5 text-gold-400" /><div><p className="text-xs text-white/50">صافي الربح الفعلي</p><p className="text-xl font-bold text-gold-400">{autoNetProfit.toLocaleString()} ₪</p></div></div>
        </div>
        <div className="glass-card p-5 border-r-2 border-r-blue-500/50">
          <div className="flex items-center gap-3"><BookOpen className="w-5 h-5 text-blue-400" /><div><p className="text-xs text-white/50">إجمالي الأصول (شجرة)</p><p className="text-xl font-bold text-blue-400">{financialStatements.balanceSheet.assets.toLocaleString()} ₪</p></div></div>
        </div>
      </div>

      <div className="glass-card p-6">
        <h3 className="section-title mb-4">ملخص الأداء المالي</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" /><XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" fontSize={12} /><YAxis stroke="rgba(255,255,255,0.3)" fontSize={11} /><Tooltip contentStyle={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} /><Bar dataKey="value" fill="#D4AF37" radius={[8, 8, 0, 0]} /></BarChart>
        </ResponsiveContainer>
      </div>

      <div className="glass p-1 rounded-xl flex gap-1 overflow-x-auto custom-scrollbar">
        {[ { id: 'accounts', label: 'شجرة الحسابات' }, { id: 'journal', label: 'قيود اليومية' }, { id: 'statements', label: 'القوائم المالية' } ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-gold-500/20 text-gold-400' : 'text-white/50 hover:text-white/70'}`}>{tab.label}</button>
        ))}
      </div>

      {activeTab === 'accounts' && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title">شجرة الحسابات</h3>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild><button className="glass-button-secondary text-xs flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> حساب جديد</button></DialogTrigger>
              <DialogContent className="glass-panel border-white/10 max-w-lg"><DialogHeader><DialogTitle className="text-white text-right">حساب جديد</DialogTitle></DialogHeader><AccountForm onSuccess={() => { setIsDialogOpen(false); fetchData(); }} /></DialogContent>
            </Dialog>
          </div>
          {accounts.length === 0 ? (
            <div className="text-center py-8 text-white/40 border border-white/5 rounded-lg border-dashed">
              شجرة الحسابات فارغة! اضغط على "حساب جديد" لإضافة حسابات (مثل: الصندوق، البنك، إلخ).
            </div>
          ) : (
            <div className="space-y-4">
              <AccountGroup title="الأصول" accounts={assetAccounts} color="text-blue-400" />
              <AccountGroup title="الخصوم" accounts={liabilityAccounts} color="text-red-400" />
              <AccountGroup title="حقوق الملكية" accounts={equityAccounts} color="text-purple-400" />
              <AccountGroup title="الإيرادات" accounts={revenueAccounts} color="text-emerald-400" />
              <AccountGroup title="المصروفات" accounts={expenseAccounts} color="text-amber-400" />
            </div>
          )}
        </div>
      )}

      {activeTab === 'journal' && (
        <div className="glass-card overflow-hidden">
          <div className="p-4 flex items-center justify-between">
            <h3 className="section-title">قيود اليومية</h3>
            <Dialog open={isJournalOpen} onOpenChange={setIsJournalOpen}>
              <DialogTrigger asChild><button className="glass-button text-xs flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> قيد جديد</button></DialogTrigger>
              <DialogContent className="glass-panel border-white/10 max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle className="text-white text-right">قيد محاسبي جديد</DialogTitle></DialogHeader><JournalEntryForm onSuccess={() => { setIsJournalOpen(false); fetchData(); }} accounts={accounts} /></DialogContent>
            </Dialog>
          </div>
          <div className="overflow-x-auto">
            <table className="table-glass min-w-[700px]">
              <thead><tr><th>رقم القيد</th><th>التاريخ</th><th>الوصف</th><th>مدين</th><th>دائن</th><th>الحالة</th><th></th></tr></thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="text-center py-8 text-white/50">جاري التحميل...</td></tr>
                ) : journalEntries.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-white/40">لا توجد قيود مسجلة</td></tr>
                ) : (
                  journalEntries.map((entry: any) => (
                    <tr key={entry.id} className={entry.status === 'REVERSED' ? 'opacity-50' : ''}>
                      <td className="font-mono text-gold-400">{entry.entryNo}</td>
                      <td>{new Date(entry.date || entry.createdAt).toLocaleDateString('ar-PS')}</td>
                      <td>{entry.description}</td>
                      <td className="text-emerald-400">{Number(entry.totalDebit || 0).toLocaleString()} ₪</td>
                      <td className="text-red-400">{Number(entry.totalCredit || 0).toLocaleString()} ₪</td>
                      <td>
                        {entry.status === 'REVERSED' ? <span className="badge-danger">ملغي</span> : <span className="badge-success">مرحل</span>}
                        {entry.source?.type && entry.source.type !== 'manual' && <span className="text-[10px] text-white/40 mr-2">تلقائي</span>}
                      </td>
                      <td>
                        {entry.status !== 'REVERSED' && (!entry.source?.type || entry.source.type === 'manual') && (
                          <button onClick={() => reverseEntry(entry)} className="text-[11px] px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20">إلغاء</button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'statements' && (
        <div className="space-y-4">
          <div className="glass-card p-6">
            <h3 className="section-title mb-4">قائمة الدخل (من القيود)</h3>
            <div className="space-y-2">
              <div className="flex justify-between py-2 border-b border-white/[0.06]"><span className="text-white/70">الإيرادات</span><span className="text-emerald-400 font-medium">{financialStatements.incomeStatement.revenue.toLocaleString()} ₪</span></div>
              <div className="flex justify-between py-2 border-b border-white/[0.06]"><span className="text-white/70">المصروفات</span><span className="text-red-400 font-medium">{financialStatements.incomeStatement.expenses.toLocaleString()} ₪</span></div>
              <div className="flex justify-between py-3 border-t-2 border-gold-500/30 mt-2"><span className="text-white font-bold">صافي الربح / الخسارة</span><span className={`font-bold text-lg ${financialStatements.incomeStatement.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{financialStatements.incomeStatement.netProfit.toLocaleString()} ₪</span></div>
            </div>
          </div>
          <div className="glass-card p-6">
            <h3 className="section-title mb-4">الميزانية العمومية (من القيود)</h3>
            <div className="space-y-2">
              <div className="flex justify-between py-2 border-b border-white/[0.06]"><span className="text-white/70">إجمالي الأصول</span><span className="text-blue-400 font-medium">{financialStatements.balanceSheet.assets.toLocaleString()} ₪</span></div>
              <div className="flex justify-between py-2 border-b border-white/[0.06]"><span className="text-white/70">إجمالي الخصوم</span><span className="text-red-400 font-medium">{financialStatements.balanceSheet.liabilities.toLocaleString()} ₪</span></div>
              <div className="flex justify-between py-2 border-b border-white/[0.06]"><span className="text-white/70">حقوق الملكية</span><span className="text-purple-400 font-medium">{financialStatements.balanceSheet.equity.toLocaleString()} ₪</span></div>
              <div className="flex justify-between py-3 border-t-2 border-gold-500/30 mt-2"><span className="text-white font-bold">إجمالي الخصوم + حقوق الملكية</span><span className="text-gold-400 font-bold text-lg">{financialStatements.balanceSheet.totalLiabilitiesAndEquity.toLocaleString()} ₪</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AccountGroup({ title, accounts, color }: { title: string, accounts: any[], color: string }) {
  if (accounts.length === 0) return null
  return (
    <div>
      <h4 className={`text-sm font-medium ${color} mb-2`}>{title}</h4>
      <div className="space-y-1">
        {accounts.map((account: any) => (
          <div key={account.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
            <div className="flex items-center gap-2"><span className="text-xs font-mono text-white/40">{account.code}</span><span className="text-sm text-white/80">{account.name}</span></div>
            <span className={`text-sm font-medium ${color}`}>{Number(account.currentBalance || 0).toLocaleString()} ₪</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AccountForm({ onSuccess }: { onSuccess: () => void }) {
  const [formData, setFormData] = useState({ code: '', name: '', type: 'ASSET', openingBalance: 0 })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); 
    setIsSubmitting(true)
    try {
      await callAction('account.create', { ...formData, openingBalance: Number(formData.openingBalance) || 0 })
      onSuccess() 
    } catch (error: any) { 
      console.error(error)
      alert(error.message || "حدث خطأ أثناء حفظ الحساب")
    } finally { 
      setIsSubmitting(false) 
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 mt-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className="block text-sm text-white/60 mb-1">الكود</label><input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} className="glass-input w-full" required /></div>
        <div><label className="block text-sm text-white/60 mb-1">الاسم</label><input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="glass-input w-full" required placeholder="مثال: الصندوق" /></div>
      </div>
      <div><label className="block text-sm text-white/60 mb-1">النوع</label><select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })} className="glass-input w-full"><option value="ASSET">أصول</option><option value="LIABILITY">خصوم</option><option value="EQUITY">حقوق ملكية</option><option value="REVENUE">إيرادات</option><option value="EXPENSE">مصروفات</option></select></div>
      <div><label className="block text-sm text-white/60 mb-1">الرصيد الافتتاحي</label><input type="number" step="0.01" value={formData.openingBalance} onChange={(e) => setFormData({ ...formData, openingBalance: parseFloat(e.target.value) || 0 })} className="glass-input w-full" required /></div>
      <div className="pt-4 border-t border-white/10 mt-2">
        <button type="submit" className="glass-button w-full" disabled={isSubmitting}>{isSubmitting ? 'جاري الحفظ...' : 'حفظ الحساب'}</button>
      </div>
    </form>
  )
}

function JournalEntryForm({ onSuccess, accounts }: { onSuccess: () => void, accounts: any[] }) {
  const [formData, setFormData] = useState({ entryNo: '', description: '', reference: '' })
  const [items, setItems] = useState([{ debitAccountId: '', creditAccountId: '', debit: 0, credit: 0 }])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const totalDebit = items.reduce((sum, item) => sum + (Number(item.debit) || 0), 0)
  const totalCredit = items.reduce((sum, item) => sum + (Number(item.credit) || 0), 0)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      // السيرفر بيتحقق من توازن القيد ووجود الحسابات وبيعطيه رقم تسلسلي
      await callAction('journal.create', {
        entryNo: formData.entryNo,
        description: formData.description,
        reference: formData.reference,
        items: items.map(i => ({
          debitAccountId: i.debitAccountId || undefined,
          creditAccountId: i.creditAccountId || undefined,
          debit: Number(i.debit) || 0,
          credit: Number(i.credit) || 0,
        })),
      })
      onSuccess()
    } catch (error: any) { 
      console.error(error)
      alert(error.message || "حدث خطأ أثناء الحفظ")
    } finally { 
      setIsSubmitting(false) 
    }
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className="block text-sm text-white/60 mb-1">رقم القيد</label><input value={formData.entryNo} onChange={(e) => setFormData({ ...formData, entryNo: e.target.value })} className="glass-input w-full" placeholder={`JE-${Date.now().toString().slice(-6)}`} /></div>
        <div><label className="block text-sm text-white/60 mb-1">المرجع</label><input value={formData.reference} onChange={(e) => setFormData({ ...formData, reference: e.target.value })} className="glass-input w-full" placeholder="اختياري..." /></div>
      </div>
      <div><label className="block text-sm text-white/60 mb-1">البيان / الوصف</label><input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="glass-input w-full" placeholder="وصف العملية المحاسبية..." required /></div>
      
      <div className="bg-black/20 p-3 rounded-xl border border-white/5 space-y-3 max-h-[40vh] overflow-y-auto custom-scrollbar">
        {items.map((item, i) => (
          <div key={i} className="glass p-3 rounded-lg grid grid-cols-1 sm:grid-cols-4 gap-2 relative">
            <div className="sm:col-span-2 space-y-2">
              <select value={item.debitAccountId} onChange={(e) => { const n = [...items]; n[i].debitAccountId = e.target.value; setItems(n); }} className="glass-input w-full text-xs border-emerald-500/30"><option value="">حساب المدين (من ح/)</option>{accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
              <select value={item.creditAccountId} onChange={(e) => { const n = [...items]; n[i].creditAccountId = e.target.value; setItems(n); }} className="glass-input w-full text-xs border-red-500/30"><option value="">حساب الدائن (إلى ح/)</option>{accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            </div>
            <div className="sm:col-span-2 space-y-2">
              <input type="number" value={item.debit} onChange={(e) => { const n = [...items]; n[i].debit = parseFloat(e.target.value) || 0; setItems(n); }} className="glass-input w-full text-xs text-emerald-400" placeholder="المبلغ المدين" />
              <input type="number" value={item.credit} onChange={(e) => { const n = [...items]; n[i].credit = parseFloat(e.target.value) || 0; setItems(n); }} className="glass-input w-full text-xs text-red-400" placeholder="المبلغ الدائن" />
            </div>
            {items.length > 1 && (
              <button onClick={() => { const n = items.filter((_, idx) => idx !== i); setItems(n); }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"><X className="w-3 h-3" /></button>
            )}
          </div>
        ))}
        <button onClick={() => setItems([...items, { debitAccountId: '', creditAccountId: '', debit: 0, credit: 0 }])} className="text-xs text-gold-400 flex items-center gap-1 mt-2 hover:text-gold-300"><Plus className="w-3 h-3" /> إضافة سطر قيد</button>
      </div>

      <div className="flex items-center justify-between glass p-3 rounded-lg border border-white/10">
        <div className="text-sm"><span className="text-white/60">إجمالي المدين: </span><span className="text-emerald-400 font-bold">{totalDebit.toLocaleString()}</span></div>
        <div className="text-sm"><span className="text-white/60">إجمالي الدائن: </span><span className="text-red-400 font-bold">{totalCredit.toLocaleString()}</span></div>
      </div>
      
      <div className="pt-4 border-t border-white/10">
        <button onClick={handleSubmit} className="glass-button w-full" disabled={isSubmitting || totalDebit !== totalCredit || totalDebit === 0}>
          {isSubmitting ? 'جاري الترحيل...' : totalDebit !== totalCredit ? 'القيد غير متوازن!' : 'حفظ وترحيل القيد'}
        </button>
      </div>
    </div>
  )
}