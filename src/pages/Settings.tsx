import { useState, useEffect } from 'react'
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth'
import { auth } from '../firebase'
import { callAction, fetchDoc, money } from '@/lib/db'
import { Settings, Database, Shield, Palette, Bell, Save, CheckCircle2 } from 'lucide-react'

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general')
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // --- حالات (States) الإعدادات العامة ---
  const [storeName, setStoreName] = useState('لوكس بلوم')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [currency, setCurrency] = useState('ILS')
  const [dateFormat, setDateFormat] = useState('gregorian') // ميلادي افتراضي

  // --- أسعار الصرف (بتنستخدم بأي عملية بالدولار أو الدينار) ---
  const [rates, setRates] = useState({ USD: '3.7', JOD: '5.2' })

  // --- حالات المظهر ---
  const [theme, setTheme] = useState('dark')

  // --- حالات الإشعارات ---
  const [notifications, setNotifications] = useState({
    lowStock: true,
    debts: true,
    dailyReport: false,
    recurring: true
  })

  // جلب الإعدادات المحفوظة من فايربيس أول ما تفتح الصفحة
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data: any = await fetchDoc('settings', 'system')
        if (data) {
          if (data.general) {
            setStoreName(data.general.storeName || 'لوكس بلوم')
            setPhone(data.general.phone || '')
            setEmail(data.general.email || '')
            setAddress(data.general.address || '')
            setCurrency(data.general.currency || 'ILS')
            setDateFormat(data.general.dateFormat || 'gregorian')
          }
          if (data.appearance) {
            setTheme(data.appearance.theme || 'dark')
          }
          if (data.notifications) {
            setNotifications({ ...notifications, ...data.notifications })
          }
          if (data.rates) {
            setRates({ USD: String(data.rates.USD ?? '3.7'), JOD: String(data.rates.JOD ?? '5.2') })
          }
        }
      } catch (error) {
        console.error("Error loading settings:", error)
      }
    }
    loadSettings()
  }, [])

  // تطبيق السمة (Theme) على كامل الموقع فور تغييرها
  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light')
      document.documentElement.classList.remove('dark')
      document.documentElement.setAttribute('data-theme', 'light')
    } else {
      document.documentElement.classList.add('dark')
      document.documentElement.classList.remove('light')
      document.documentElement.setAttribute('data-theme', 'dark')
    }
  }, [theme])

  // حفظ الإعدادات في فايربيس
  const handleSave = async () => {
    setIsSaving(true)
    try {
      const usd = Number(rates.USD), jod = Number(rates.JOD)
      if (!(usd > 0) || !(jod > 0)) throw new Error('أسعار الصرف لازم تكون أرقام أكبر من صفر')
      await callAction('settings.update', {
        general: { storeName, phone, email, address, currency, dateFormat },
        appearance: { theme: theme as 'dark' | 'light' },
        notifications,
        rates: { USD: usd, JOD: jod },
      })
      
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (error) {
      console.error("Error saving settings:", error)
      alert((error as any)?.message || "حدث خطأ أثناء الحفظ")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">الإعدادات</h1>
          <p className="text-white/50 text-sm mt-1">إعدادات النظام والتفضيلات</p>
        </div>
        <button onClick={handleSave} disabled={isSaving} className="glass-button flex items-center gap-2">
          {isSaving ? (
            <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
          ) : saved ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {isSaving ? 'جاري الحفظ...' : saved ? 'تم الحفظ بنجاح!' : 'حفظ الإعدادات'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-card p-4 col-span-1 h-fit">
          <div className="space-y-1">
            {[
              { id: 'general', label: 'عام', icon: Settings },
              { id: 'appearance', label: 'المظهر', icon: Palette },
              { id: 'database', label: 'ترحيل البيانات', icon: Database },
              { id: 'security', label: 'الأمان', icon: Shield },
              { id: 'notifications', label: 'الإشعارات', icon: Bell },
            ].map((item) => {
              const Icon = item.icon
              return (
                <button 
                  key={item.id} 
                  onClick={() => setActiveTab(item.id)} 
                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-all ${activeTab === item.id ? 'bg-gold-500/20 text-gold-400' : 'text-white/60 hover:bg-white/[0.04]'}`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="glass-card p-6 col-span-1 md:col-span-3 min-h-[400px]">
          
          {/* 1. إعدادات عامة */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              <h3 className="section-title">إعدادات عامة</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-white/60 mb-1">اسم المتجر</label>
                  <input value={storeName} onChange={(e) => setStoreName(e.target.value)} className="glass-input w-full" placeholder="اسم متجرك..." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-white/60 mb-1">الهاتف</label>
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} className="glass-input w-full" placeholder="رقم الهاتف..." />
                  </div>
                  <div>
                    <label className="block text-sm text-white/60 mb-1">البريد الإلكتروني</label>
                    <input value={email} onChange={(e) => setEmail(e.target.value)} className="glass-input w-full" placeholder="البريد الإلكتروني..." />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-1">العنوان</label>
                  <input value={address} onChange={(e) => setAddress(e.target.value)} className="glass-input w-full" placeholder="عنوان المتجر..." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-white/60 mb-1">العملة الافتراضية</label>
                    <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="glass-input w-full">
                      <option value="ILS">شيكل (₪)</option>
                      <option value="USD">دولار أمريكي ($)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-white/60 mb-1">تنسيق التاريخ</label>
                    <select value={dateFormat} onChange={(e) => setDateFormat(e.target.value)} className="glass-input w-full">
                      <option value="gregorian">ميلادي</option>
                      <option value="hijri">هجري</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-white/60 mb-1">سعر الدولار بالشيكل</label>
                    <input type="number" step="0.01" min="0" value={rates.USD} onChange={(e) => setRates({ ...rates, USD: e.target.value })} className="glass-input w-full" />
                  </div>
                  <div>
                    <label className="block text-sm text-white/60 mb-1">سعر الدينار بالشيكل</label>
                    <input type="number" step="0.01" min="0" value={rates.JOD} onChange={(e) => setRates({ ...rates, JOD: e.target.value })} className="glass-input w-full" />
                  </div>
                </div>
                <p className="text-xs text-white/40">أي مصروف أو شراء أو حركة شريك بعملة ثانية بتتحول للشيكل بهاد السعر، إلا إذا حددت سعر غيره بالعملية.</p>
              </div>
            </div>
          )}

          {/* 2. المظهر */}
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <h3 className="section-title">إعدادات المظهر</h3>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm text-white/60 mb-3">السمة (فاتح / داكن)</label>
                  <div className="flex gap-4">
                    <div 
                      onClick={() => setTheme('dark')} 
                      className={`glass p-4 rounded-lg cursor-pointer text-center w-32 transition-all ${theme === 'dark' ? 'border-2 border-gold-500 bg-white/[0.05]' : 'border border-white/[0.06] hover:bg-white/[0.02]'}`}
                    >
                      <div className="w-8 h-8 rounded-full bg-[#0a0e1a] mx-auto mb-2 border border-white/20" />
                      <p className="text-xs font-bold text-white/90">داكن</p>
                    </div>
                    <div 
                      onClick={() => setTheme('light')} 
                      className={`glass p-4 rounded-lg cursor-pointer text-center w-32 transition-all opacity-80 hover:opacity-100 ${theme === 'light' ? 'border-2 border-gold-500 bg-white/[0.05]' : 'border border-white/[0.06]'}`}
                    >
                      <div className="w-8 h-8 rounded-full bg-white mx-auto mb-2 border border-gray-300" />
                      <p className="text-xs font-bold text-white/90">فاتح</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. ترحيل البيانات القديمة للدفاتر */}
          {activeTab === 'database' && <MigrationPanel />}

          {/* 4. الأمان */}
          {activeTab === 'security' && <PasswordPanel />}

          {/* 5. الإشعارات */}
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <h3 className="section-title">تفضيلات الإشعارات</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 rounded-lg glass border border-white/[0.04]">
                  <div>
                    <p className="text-sm font-bold text-white/90">تنبيه المخزون المنخفض</p>
                    <p className="text-xs text-white/50 mt-0.5">إشعار فوري عندما يقل أي منتج عن الحد الأدنى</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={notifications.lowStock} onChange={(e) => setNotifications({...notifications, lowStock: e.target.checked})} />
                    <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gold-500"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg glass border border-white/[0.04]">
                  <div>
                    <p className="text-sm font-bold text-white/90">تنبيه الذمم والديون</p>
                    <p className="text-xs text-white/50 mt-0.5">إشعار عندما تقترب فترة استحقاق الديون للعملاء أو الموردين</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={notifications.debts} onChange={(e) => setNotifications({...notifications, debts: e.target.checked})} />
                    <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gold-500"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg glass border border-white/[0.04]">
                  <div>
                    <p className="text-sm font-bold text-white/90">تقرير يومي مسائي</p>
                    <p className="text-xs text-white/50 mt-0.5">ملخص يومي بالمبيعات والمصاريف والأرباح بنهاية كل يوم</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={notifications.dailyReport} onChange={(e) => setNotifications({...notifications, dailyReport: e.target.checked})} />
                    <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gold-500"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg glass border border-white/[0.04]">
                  <div>
                    <p className="text-sm font-bold text-white/90">تنبيه المصاريف المتكررة</p>
                    <p className="text-xs text-white/50 mt-0.5">إشعار لتذكيرك قبل موعد دفع الإيجار والرواتب والمصاريف المتكررة</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={notifications.recurring} onChange={(e) => setNotifications({...notifications, recurring: e.target.checked})} />
                    <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gold-500"></div>
                  </label>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ترحيل الفواتير والمصاريف والديون القديمة لقيود محاسبية (بيتنفذ مرة وحدة وآمن للتكرار)
function MigrationPanel() {
  const [result, setResult] = useState<any>(null)
  const [isRunning, setIsRunning] = useState(false)

  const run = async (dryRun: boolean) => {
    if (!dryRun && !window.confirm('رح ينعمل قيد لكل فاتورة ومصروف ودين قديم. متأكد؟')) return
    setIsRunning(true)
    try {
      setResult(await callAction('migration.run', { dryRun }))
    } catch (err: any) {
      alert(err.message)
    } finally {
      setIsRunning(false)
    }
  }

  const s = result?.summary
  return (
    <div className="space-y-6">
      <h3 className="section-title">ترحيل البيانات القديمة للدفاتر</h3>
      <p className="text-sm text-white/60 leading-relaxed">
        الفواتير والمصاريف اللي انسجلت قبل التحديث ما إلها قيود محاسبية. هاي الأداة بتعمل قيد لكل وحدة منهم، وبتسجل ديون العملاء والموردين كأرصدة افتتاحية،
        وبتطابق حساب المخزون مع قيمة البضاعة الفعلية. ما بتغير ولا رقم بالفواتير نفسها، وإذا انعادت ما بتكرر إشي.
      </p>
      <div className="flex gap-3">
        <button onClick={() => run(true)} disabled={isRunning} className="glass-button-secondary px-4 py-2 rounded-lg">{isRunning ? 'جاري الفحص...' : 'معاينة'}</button>
        {s && result.dryRun && s.entries > 0 && (
          <button onClick={() => run(false)} disabled={isRunning} className="glass-button px-4 py-2">تنفيذ الترحيل ({s.entries} قيد)</button>
        )}
      </div>
      {s && (
        <div className="glass p-5 rounded-lg space-y-2 text-sm">
          <p className="font-bold text-white mb-2">{result.dryRun ? 'نتيجة المعاينة (ما انحفظ إشي)' : 'تم الترحيل ✓'}</p>
          <Row label={`مبيعات قديمة (${s.sales.count})`} value={`${money(s.sales.revenue)} — منها غير مدفوع ${money(s.sales.unpaid)}`} />
          <Row label={`مشتريات قديمة (${s.purchases.count})`} value={`${money(s.purchases.total)} — منها غير مدفوع ${money(s.purchases.unpaid)}`} />
          <Row label={`مصاريف قديمة (${s.expenses.count})`} value={money(s.expenses.total)} />
          <Row label={`ديون عملاء (${s.customerDebts.count})`} value={money(s.customerDebts.total)} />
          <Row label={`ديون موردين (${s.supplierDebts.count})`} value={money(s.supplierDebts.total)} />
          <Row label="قيمة المخزون الفعلية" value={money(s.inventory.actualValue)} />
          <Row label="تسوية المخزون" value={money(s.inventory.adjustment)} />
          <Row label="عدد القيود" value={String(s.entries)} />
          {s.sales.unpaid > 0 && s.customerDebts.total > 0 && (
            <p className="text-xs text-amber-400 pt-2">انتبه: في مبالغ غير مدفوعة بفواتير قديمة وكمان ديون مسجلة يدوياً على العملاء. إذا هم نفس الديون، عدّل واحد منهم قبل التنفيذ عشان ما تنحسب مرتين.</p>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-white/[0.06] py-1.5">
      <span className="text-white/60">{label}</span>
      <span className="text-white/90">{value}</span>
    </div>
  )
}

function PasswordPanel() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [isSaving, setIsSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg('')
    if (form.next.length < 8) return setMsg('كلمة المرور الجديدة لازم تكون 8 أحرف على الأقل')
    if (form.next !== form.confirm) return setMsg('التأكيد مش مطابق')
    const user = auth.currentUser
    if (!user?.email) return
    setIsSaving(true)
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, form.current))
      await updatePassword(user, form.next)
      setForm({ current: '', next: '', confirm: '' })
      setMsg('تم تغيير كلمة المرور ✓')
    } catch {
      setMsg('كلمة المرور الحالية غير صحيحة')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 max-w-md">
      <h3 className="section-title">تغيير كلمة المرور</h3>
      <input type="password" required placeholder="كلمة المرور الحالية" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} className="glass-input w-full" />
      <input type="password" required placeholder="كلمة المرور الجديدة" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} className="glass-input w-full" />
      <input type="password" required placeholder="تأكيد كلمة المرور" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} className="glass-input w-full" />
      {msg && <p className="text-sm text-gold-400">{msg}</p>}
      <button type="submit" disabled={isSaving} className="glass-button">{isSaving ? 'جاري الحفظ...' : 'تغيير كلمة المرور'}</button>
    </form>
  )
}
