import { useState, useEffect } from 'react'
import { Plus, Search, Eye, Phone, MapPin, Building2, Edit2, Wallet, Ban } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { callAction, fetchAllDocs, isCancelled, byNewest, money, PAYMENT_METHODS, useDataRefresh } from '@/lib/db'

// صفحة مشتركة للعملاء والموردين: البيانات، الديون، الدفعات وكشف الحساب

type Kind = 'customer' | 'supplier'

const CONFIG = {
  customer: {
    collection: 'customers',
    payments: 'customerPayments',
    invoices: 'sales',
    invoiceParty: 'customerId',
    title: 'العملاء والزبائن',
    subtitle: 'إدارة بيانات العملاء والذمم المالية',
    add: 'إضافة عميل جديد',
    formTitle: 'بيانات العميل',
    search: 'البحث باسم العميل أو رقم الهاتف...',
    total: 'إجمالي ديون العملاء بالسوق',
    debtCol: 'الرصيد (دين عليه)',
    nameCol: 'اسم العميل',
    extraCol: 'المدينة / العنوان',
    extraField: 'address' as const,
    extraLabel: 'العنوان',
    payLabel: 'قبض دفعة',
    payTitle: 'قبض دفعة من العميل',
    payKind: 'customerPayment' as const,
    payAction: 'customer.payment',
    saveAction: 'customer.save',
    openingLabel: 'دين سابق عليه (اختياري)',
    titleClass: 'page-title text-cyan-400',
    buttonClass: 'glass-button flex items-center justify-center gap-2 w-full sm:w-auto !bg-cyan-500/20 !text-cyan-400 hover:!bg-cyan-500/30 !border-cyan-500/30',
    cardClass: 'glass p-4 rounded-xl border border-cyan-500/20 bg-gradient-to-l from-cyan-500/10 to-transparent flex items-center justify-between',
    textClass: 'text-cyan-400',
    submitClass: 'glass-button !bg-cyan-600 hover:!bg-cyan-500 w-full sm:w-auto px-8',
  },
  supplier: {
    collection: 'suppliers',
    payments: 'supplierPayments',
    invoices: 'purchases',
    invoiceParty: 'supplierId',
    title: 'الموردين والشركات',
    subtitle: 'إدارة الموردين والديون المستحقة لهم',
    add: 'إضافة مورد جديد',
    formTitle: 'بيانات المورد',
    search: 'البحث باسم المورد أو الشركة...',
    total: 'إجمالي الديون للموردين',
    debtCol: 'الرصيد (دين له)',
    nameCol: 'اسم المورد / المندوب',
    extraCol: 'الشركة / المصنع',
    extraField: 'company' as const,
    extraLabel: 'الشركة',
    payLabel: 'دفع للمورد',
    payTitle: 'دفعة للمورد',
    payKind: 'supplierPayment' as const,
    payAction: 'supplier.payment',
    saveAction: 'supplier.save',
    openingLabel: 'دين سابق إله (اختياري)',
    titleClass: 'page-title text-violet-400',
    buttonClass: 'glass-button flex items-center justify-center gap-2 w-full sm:w-auto !bg-violet-500/20 !text-violet-400 hover:!bg-violet-500/30 !border-violet-500/30',
    cardClass: 'glass p-4 rounded-xl border border-violet-500/20 bg-gradient-to-l from-violet-500/10 to-transparent flex items-center justify-between',
    textClass: 'text-violet-400',
    submitClass: 'glass-button !bg-violet-600 hover:!bg-violet-500 w-full sm:w-auto px-8',
  },
}

export default function PartyLedger({ kind }: { kind: Kind }) {
  const cfg = CONFIG[kind]
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [invoices, setInvoices] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editing, setEditing] = useState<any | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [paying, setPaying] = useState<any | null>(null)

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [list, pays, invs] = await Promise.all([
        fetchAllDocs(cfg.collection),
        fetchAllDocs(cfg.payments),
        fetchAllDocs(cfg.invoices),
      ])
      setRows(list)
      setPayments(pays)
      setInvoices(invs)
    } catch (error) {
      console.error('خطأ في الجلب:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind])
  useDataRefresh(fetchData)

  const filtered = rows
    .filter(r => r.name?.toLowerCase().includes(search.toLowerCase()) || r.phone?.includes(search) || r[cfg.extraField]?.includes(search))
    .sort(byNewest)

  const totalDebt = rows.reduce((sum, r) => sum + (Number(r.debt) || 0), 0)

  const openForm = (row: any | null) => { setEditing(row); setIsFormOpen(true) }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className={cfg.titleClass}>{cfg.title}</h1>
          <p className="text-white/50 text-sm mt-1">{cfg.subtitle}</p>
        </div>
        <button onClick={() => openForm(null)} className={cfg.buttonClass}>
          <Plus className="w-4 h-4" /> {cfg.add}
        </button>
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="glass-panel border-white/10 max-w-xl w-[95vw]">
          <DialogHeader>
            <DialogTitle className="text-white text-right">{editing ? `تعديل ${cfg.formTitle}` : cfg.formTitle}</DialogTitle>
          </DialogHeader>
          {isFormOpen && <PartyForm kind={kind} initial={editing} onSuccess={() => { setIsFormOpen(false); fetchData() }} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!paying} onOpenChange={(o) => !o && setPaying(null)}>
        <DialogContent className="glass-panel border-white/10 max-w-md w-[95vw]">
          <DialogHeader>
            <DialogTitle className="text-white text-right">{cfg.payTitle}</DialogTitle>
          </DialogHeader>
          {paying && <PaymentForm kind={kind} party={paying} onSuccess={() => { setPaying(null); fetchData() }} />}
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 glass p-4 rounded-xl relative">
          <Search className="absolute right-7 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input type="text" placeholder={cfg.search} value={search} onChange={(e) => setSearch(e.target.value)} className="glass-input w-full pr-10" />
        </div>
        <div className={cfg.cardClass}>
          <div>
            <p className="text-sm text-white/60">{cfg.total}</p>
            <p className={`text-2xl font-bold ${cfg.textClass}`}>{money(totalDebt)}</p>
          </div>
          <Wallet className={`w-6 h-6 ${cfg.textClass}`} />
        </div>
      </div>

      <div className="glass-card overflow-x-auto">
        <table className="table-glass min-w-[800px]">
          <thead>
            <tr>
              <th>{cfg.nameCol}</th>
              <th>رقم الهاتف</th>
              <th>{cfg.extraCol}</th>
              <th>تاريخ التسجيل</th>
              <th>{cfg.debtCol}</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-8 text-white/50">جاري التحميل...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-white/40">لا يوجد بيانات</td></tr>
            ) : (
              filtered.map((row: any) => (
                <tr key={row.id}>
                  <td className="font-medium text-white">{row.name}</td>
                  <td className="text-white/80 font-mono tracking-wider">{row.phone || '-'}</td>
                  <td className="text-white/60">{row[cfg.extraField] || '-'}</td>
                  <td>{row.createdAt ? new Date(row.createdAt).toLocaleDateString('ar-PS') : '-'}</td>
                  <td className={Number(row.debt) > 0 ? 'text-red-400 font-bold' : 'text-emerald-400'}>{money(row.debt)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <button title="كشف الحساب" className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center hover:bg-white/[0.1] transition-colors">
                            <Eye className={`w-3.5 h-3.5 ${cfg.textClass}`} />
                          </button>
                        </DialogTrigger>
                        <DialogContent className="glass-panel border-white/10 max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle className="text-white text-right">كشف حساب {row.name}</DialogTitle>
                          </DialogHeader>
                          <Statement
                            kind={kind}
                            party={row}
                            invoices={invoices.filter(i => i[cfg.invoiceParty] === row.id)}
                            payments={payments.filter(p => p.partyId === row.id)}
                            onChanged={fetchData}
                          />
                        </DialogContent>
                      </Dialog>
                      <button onClick={() => openForm(row)} title="تعديل" className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center hover:bg-white/[0.1] transition-colors">
                        <Edit2 className="w-3.5 h-3.5 text-white/60" />
                      </button>
                      {Number(row.debt) > 0 && (
                        <button onClick={() => setPaying(row)} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors whitespace-nowrap">
                          {cfg.payLabel}
                        </button>
                      )}
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

function PartyForm({ kind, initial, onSuccess }: { kind: Kind; initial: any | null; onSuccess: () => void }) {
  const cfg = CONFIG[kind]
  const [isPending, setIsPending] = useState(false)
  const [formData, setFormData] = useState({
    name: initial?.name || '',
    phone: initial?.phone || '',
    extra: initial?.[cfg.extraField] || '',
    notes: initial?.notes || '',
    openingDebt: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) return alert('الرجاء إدخال الاسم!')
    setIsPending(true)
    try {
      await callAction(cfg.saveAction, {
        id: initial?.id,
        name: formData.name,
        phone: formData.phone,
        [cfg.extraField]: formData.extra,
        notes: formData.notes,
        openingDebt: initial ? 0 : Number(formData.openingDebt) || 0,
      })
      onSuccess()
    } catch (error: any) {
      alert(error.message)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm text-white/60 mb-1">الاسم <span className="text-red-400">*</span></label>
          <input required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="glass-input w-full" />
        </div>
        <div>
          <label className="block text-sm text-white/60 mb-1">رقم الهاتف</label>
          <input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="glass-input w-full" dir="ltr" />
        </div>
        <div>
          <label className="block text-sm text-white/60 mb-1">{cfg.extraLabel}</label>
          <input value={formData.extra} onChange={(e) => setFormData({ ...formData, extra: e.target.value })} className="glass-input w-full" />
        </div>
        {!initial && (
          <div>
            <label className="block text-sm text-white/60 mb-1">{cfg.openingLabel}</label>
            <input type="number" min="0" step="0.01" value={formData.openingDebt} onChange={(e) => setFormData({ ...formData, openingDebt: e.target.value })} className="glass-input w-full" placeholder="0" />
          </div>
        )}
        <div className={initial ? 'sm:col-span-2' : ''}>
          <label className="block text-sm text-white/60 mb-1">ملاحظات</label>
          <input value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="glass-input w-full" />
        </div>
      </div>
      {initial && <p className="text-xs text-white/40">الدين ما بتعدل من هون، بتغير بالفواتير والدفعات بس.</p>}
      <div className="pt-4 border-t border-white/10 flex justify-end">
        <button type="submit" disabled={isPending} className={cfg.submitClass}>{isPending ? 'جاري الحفظ...' : 'حفظ'}</button>
      </div>
    </form>
  )
}

function PaymentForm({ kind, party, onSuccess }: { kind: Kind; party: any; onSuccess: () => void }) {
  const cfg = CONFIG[kind]
  const [amount, setAmount] = useState(String(party.debt || ''))
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [notes, setNotes] = useState('')
  const [isPending, setIsPending] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsPending(true)
    try {
      await callAction(cfg.payAction, { partyId: party.id, amount: Number(amount), paymentMethod, notes })
      onSuccess()
    } catch (error: any) {
      alert(error.message)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div className="glass p-3 rounded-lg flex justify-between text-sm">
        <span className="text-white/60">{party.name} — الدين الحالي</span>
        <span className="text-red-400 font-bold">{money(party.debt)}</span>
      </div>
      <div>
        <label className="block text-sm text-white/60 mb-1">المبلغ</label>
        <input required type="number" min="0.01" step="0.01" max={party.debt} value={amount} onChange={(e) => setAmount(e.target.value)} className="glass-input w-full text-emerald-400 font-bold" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="glass-input w-full">
          {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className="glass-input w-full" placeholder="ملاحظات..." />
      </div>
      <button type="submit" disabled={isPending} className="glass-button w-full">{isPending ? 'جاري الحفظ...' : 'تأكيد الدفعة'}</button>
    </form>
  )
}

function Statement({ kind, party, invoices, payments, onChanged }: { kind: Kind; party: any; invoices: any[]; payments: any[]; onChanged: () => void }) {
  const cfg = CONFIG[kind]
  const ExtraIcon = kind === 'customer' ? MapPin : Building2

  const cancelPayment = async (p: any) => {
    if (!window.confirm(`إلغاء الدفعة ${p.number}؟ الدين رح يرجع زي ما كان.`)) return
    try {
      await callAction('document.reverse', { kind: cfg.payKind, id: p.id })
      onChanged()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const rows = [
    ...invoices.map(i => ({
      id: i.id,
      date: i.createdAt,
      label: `فاتورة ${i.invoiceNo}`,
      amount: Number(kind === 'customer' ? i.totalRevenue : i.totalCost) || 0,
      remaining: Number(i.remaining) || 0,
      cancelled: isCancelled(i),
      payment: null as any,
    })),
    ...payments.map(p => ({
      id: p.id,
      date: p.createdAt,
      label: `دفعة ${p.number}${p.notes ? ` - ${p.notes}` : ''}`,
      amount: Number(p.amount) || 0,
      remaining: 0,
      cancelled: isCancelled(p),
      payment: p,
    })),
  ].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())

  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="glass p-3 rounded-lg flex items-center gap-3">
          <Phone className="w-4 h-4 text-white/60" />
          <span className="text-sm font-mono text-white/90" dir="ltr">{party.phone || 'غير محدد'}</span>
        </div>
        <div className="glass p-3 rounded-lg flex items-center gap-3">
          <ExtraIcon className="w-4 h-4 text-white/60" />
          <span className="text-sm text-white/90">{party[cfg.extraField] || 'غير محدد'}</span>
        </div>
      </div>
      {party.notes && <div className="glass p-3 rounded-lg text-sm text-white/80">{party.notes}</div>}
      {Number(party.openingDebt) > 0 && <p className="text-xs text-white/50">رصيد افتتاحي: {money(party.openingDebt)}</p>}

      <div className="glass-card overflow-x-auto">
        <table className="table-glass min-w-[500px]">
          <thead>
            <tr><th>التاريخ</th><th>البيان</th><th>المبلغ</th><th>المتبقي</th><th></th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-6 text-white/40">لا يوجد حركات مسجلة</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} className={r.cancelled ? 'opacity-40 line-through' : ''}>
                <td>{r.date ? new Date(r.date).toLocaleDateString('ar-PS') : '-'}</td>
                <td>{r.label}</td>
                <td className={r.payment ? 'text-emerald-400' : 'text-white/90'}>{money(r.amount)}</td>
                <td className={r.remaining > 0 ? 'text-red-400' : 'text-white/40'}>{r.payment ? '-' : money(r.remaining)}</td>
                <td>
                  {r.payment && !r.cancelled && (
                    <button onClick={() => cancelPayment(r.payment)} title="إلغاء الدفعة" className="w-7 h-7 rounded bg-red-500/10 flex items-center justify-center hover:bg-red-500/20">
                      <Ban className="w-3 h-3 text-red-400" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pt-4 border-t border-white/10 flex justify-between items-center">
        <span className="text-white/60">الرصيد الحالي</span>
        <span className={`text-xl font-bold ${Number(party.debt) > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{money(party.debt)}</span>
      </div>
    </div>
  )
}
