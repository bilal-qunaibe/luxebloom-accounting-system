import { useState, useEffect, useMemo } from 'react'
import { Plus, Handshake, Edit2, Ban, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { callAction, fetchAllDocs, isCancelled, byNewest, money, PAYMENT_METHODS, CURRENCIES, useDataRefresh } from '@/lib/db'

// الشركاء: حساب جاري لكل شريك (إيداعات وسحوبات) مربوط بالقيود

export default function Partners() {
  const [partners, setPartners] = useState<any[]>([])
  const [txs, setTxs] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editing, setEditing] = useState<any | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [txFor, setTxFor] = useState<{ partner: any; kind: 'WITHDRAWAL' | 'CONTRIBUTION' } | null>(null)

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [p, t] = await Promise.all([fetchAllDocs('partners'), fetchAllDocs('partnerTransactions')])
      setPartners(p)
      setTxs(t.sort(byNewest))
    } catch (error) {
      console.error('خطأ في جلب الشركاء:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])
  useDataRefresh(fetchData)

  // الرصيد الجاري: الإيداعات ناقص السحوبات
  const balances = useMemo(() => {
    const map: Record<string, { in: number; out: number }> = {}
    for (const t of txs) {
      if (isCancelled(t)) continue
      map[t.partnerId] = map[t.partnerId] || { in: 0, out: 0 }
      if (t.kind === 'CONTRIBUTION') map[t.partnerId].in += Number(t.amount) || 0
      else map[t.partnerId].out += Number(t.amount) || 0
    }
    return map
  }, [txs])

  const cancelTx = async (t: any) => {
    const reason = window.prompt(`سبب إلغاء الحركة ${t.number}؟`)
    if (reason === null) return
    try {
      await callAction('document.reverse', { kind: 'partnerTx', id: t.id, reason })
      fetchData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-title text-amber-400">الشركاء</h1>
          <p className="text-white/50 text-sm mt-1">رأس المال، السحوبات والدفعات لكل شريك</p>
        </div>
        <button
          onClick={() => { setEditing(null); setIsFormOpen(true) }}
          className="glass-button flex items-center justify-center gap-2 w-full sm:w-auto !bg-amber-500/20 !text-amber-400 hover:!bg-amber-500/30 !border-amber-500/30"
        >
          <Plus className="w-4 h-4" /> إضافة شريك
        </button>
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="glass-panel border-white/10 max-w-md w-[95vw]">
          <DialogHeader>
            <DialogTitle className="text-white text-right">{editing ? 'تعديل بيانات الشريك' : 'شريك جديد'}</DialogTitle>
          </DialogHeader>
          {isFormOpen && <PartnerForm initial={editing} onSuccess={() => { setIsFormOpen(false); fetchData() }} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!txFor} onOpenChange={(o) => !o && setTxFor(null)}>
        <DialogContent className="glass-panel border-white/10 max-w-md w-[95vw]">
          <DialogHeader>
            <DialogTitle className="text-white text-right">
              {txFor?.kind === 'WITHDRAWAL' ? `دفعة للشريك ${txFor?.partner.name}` : `إيداع من الشريك ${txFor?.partner.name}`}
            </DialogTitle>
          </DialogHeader>
          {txFor && <PartnerTxForm partner={txFor.partner} kind={txFor.kind} onSuccess={() => { setTxFor(null); fetchData() }} />}
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="text-center py-8 text-white/50">جاري التحميل...</div>
      ) : partners.length === 0 ? (
        <div className="glass-card p-8 text-center text-white/40">ما في شركاء مسجلين. أضف الشركاء عشان تقدر تسجل دفعاتهم وسحوباتهم.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {partners.map(p => {
            const b = balances[p.id] || { in: 0, out: 0 }
            return (
              <div key={p.id} className="glass-card p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-amber-500/15 flex items-center justify-center">
                      <Handshake className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <p className="font-bold text-white">{p.name}</p>
                      <p className="text-xs text-white/50">{Number(p.sharePercent) > 0 ? `نسبة الشراكة ${p.sharePercent}%` : 'نسبة غير محددة'}</p>
                    </div>
                  </div>
                  <button onClick={() => { setEditing(p); setIsFormOpen(true) }} className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center hover:bg-white/[0.1]">
                    <Edit2 className="w-3.5 h-3.5 text-white/60" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="glass p-2 rounded-lg"><p className="text-[10px] text-white/40">إيداعات</p><p className="text-sm text-emerald-400 font-medium">{money(b.in)}</p></div>
                  <div className="glass p-2 rounded-lg"><p className="text-[10px] text-white/40">سحوبات</p><p className="text-sm text-red-400 font-medium">{money(b.out)}</p></div>
                  <div className="glass p-2 rounded-lg"><p className="text-[10px] text-white/40">الصافي</p><p className="text-sm text-amber-400 font-bold">{money(b.in - b.out)}</p></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setTxFor({ partner: p, kind: 'WITHDRAWAL' })} className="flex items-center justify-center gap-1 text-xs py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20">
                    <ArrowUpCircle className="w-4 h-4" /> دفعة للشريك
                  </button>
                  <button onClick={() => setTxFor({ partner: p, kind: 'CONTRIBUTION' })} className="flex items-center justify-center gap-1 text-xs py-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20">
                    <ArrowDownCircle className="w-4 h-4" /> إيداع من الشريك
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="glass-card overflow-x-auto">
        <div className="p-4"><h3 className="section-title">سجل الحركات</h3></div>
        <table className="table-glass min-w-[700px]">
          <thead>
            <tr><th>الرقم</th><th>التاريخ</th><th>الشريك</th><th>النوع</th><th>المبلغ</th><th>ملاحظات</th><th></th></tr>
          </thead>
          <tbody>
            {txs.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-6 text-white/40">لا يوجد حركات</td></tr>
            ) : txs.map(t => (
              <tr key={t.id} className={isCancelled(t) ? 'opacity-40' : ''}>
                <td className="font-mono text-amber-400">{t.number}</td>
                <td>{new Date(t.createdAt).toLocaleDateString('ar-PS')}</td>
                <td>{t.partnerName}</td>
                <td>{t.kind === 'WITHDRAWAL' ? <span className="text-red-400">دفعة/سحب</span> : <span className="text-emerald-400">إيداع</span>}{isCancelled(t) && <span className="badge-danger mr-2">ملغاة</span>}</td>
                <td>
                  {money(t.amount)}
                  {t.currency && t.currency !== 'ILS' && <div className="text-[10px] text-white/40">{t.originalAmount} {CURRENCIES.find(c => c.value === t.currency)?.label} × {t.rate}</div>}
                </td>
                <td className="text-white/60 text-sm">{t.notes || '-'}{t.origin === 'assistant' && <span className="text-[10px] text-white/40 mr-1">(عبر المساعد)</span>}</td>
                <td>
                  {!isCancelled(t) && (
                    <button onClick={() => cancelTx(t)} title="إلغاء" className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center hover:bg-red-500/20">
                      <Ban className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PartnerForm({ initial, onSuccess }: { initial: any | null; onSuccess: () => void }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    phone: initial?.phone || '',
    sharePercent: String(initial?.sharePercent ?? ''),
    notes: initial?.notes || '',
  })
  const [isPending, setIsPending] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsPending(true)
    try {
      await callAction('partner.save', { id: initial?.id, ...form, sharePercent: Number(form.sharePercent) || 0 })
      onSuccess()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 mt-4">
      <input required placeholder="اسم الشريك" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="glass-input w-full" />
      <div className="grid grid-cols-2 gap-3">
        <input placeholder="رقم الهاتف" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="glass-input w-full" dir="ltr" />
        <input type="number" min="0" max="100" placeholder="نسبة الشراكة %" value={form.sharePercent} onChange={(e) => setForm({ ...form, sharePercent: e.target.value })} className="glass-input w-full" />
      </div>
      <input placeholder="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="glass-input w-full" />
      <button type="submit" disabled={isPending} className="glass-button w-full">{isPending ? 'جاري الحفظ...' : 'حفظ'}</button>
    </form>
  )
}

function PartnerTxForm({ partner, kind, onSuccess }: { partner: any; kind: 'WITHDRAWAL' | 'CONTRIBUTION'; onSuccess: () => void }) {
  const [form, setForm] = useState({
    amount: '',
    currency: 'ILS',
    paymentMethod: 'CASH',
    date: new Date().toLocaleDateString('en-CA'),
    notes: '',
  })
  const [isPending, setIsPending] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsPending(true)
    try {
      await callAction('partner.transaction', { partnerId: partner.id, kind, ...form, amount: Number(form.amount) })
      onSuccess()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 mt-4">
      <div className="grid grid-cols-2 gap-3">
        <input required type="number" min="0.01" step="0.01" placeholder="المبلغ" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="glass-input w-full font-bold" />
        <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="glass-input w-full">
          {CURRENCIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} className="glass-input w-full">
          {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="glass-input w-full" />
      </div>
      <input placeholder="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="glass-input w-full" />
      {form.currency !== 'ILS' && <p className="text-xs text-white/50">بتنحسب بالشيكل حسب سعر الصرف بالإعدادات.</p>}
      <button type="submit" disabled={isPending} className="glass-button w-full">{isPending ? 'جاري الحفظ...' : 'تأكيد'}</button>
    </form>
  )
}
