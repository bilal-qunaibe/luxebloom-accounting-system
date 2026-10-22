import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { auth } from './firebase'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { callAction } from './lib/db'
import { Menu, X } from 'lucide-react' // استيراد أيقونات القائمة للجوال

// استيراد صفحات النظام
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import Sales from './pages/Sales'
import Purchases from './pages/Purchases'
import Reports from './pages/Reports'
import Accounting from './pages/Accounting'
import Customers from './pages/Customers'
import Suppliers from './pages/Suppliers'
import Expenses from './pages/Expenses'
import Partners from './pages/Partners'
import SettingsPage from './pages/Settings'

// المساعد الذكي
import AssistantPanel from './components/AssistantPanel'

// استدعاء القائمة الجانبية
import Sidebar from './components/Sidebar'

// مكون حماية الصفحات: تسجيل دخول + التأكد إن الحساب إله صلاحية على LuxeBloom
// التحقق بيصير مرة وحدة لكل جلسة، مش مع كل تنقل بين الصفحات
let verifiedUid: string | null = null

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'loading' | 'ok' | 'out'>(
    auth.currentUser && auth.currentUser.uid === verifiedUid ? 'ok' : 'loading'
  )
  const navigate = useNavigate()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) { verifiedUid = null; setState('out'); return }
      if (currentUser.uid === verifiedUid) { setState('ok'); return }
      try {
        await callAction('session.init')
        verifiedUid = currentUser.uid
        setState('ok')
      } catch (err: any) {
        await signOut(auth)
        navigate('/login', { replace: true, state: { error: err.message } })
      }
    })
    return () => unsubscribe()
  }, [navigate])

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-[#2B3A32] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#C5CBAF] border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return state === 'ok' ? children : <Navigate to="/login" />
}

// 🌟 المكون السحري المحدث ليناسب الجوال واللابتوب
function MainLayout({ children }: { children: React.ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const location = useLocation()

  // إغلاق القائمة تلقائياً عند تغيير الصفحة من الجوال
  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [location.pathname])

  return (
    <div className="flex h-screen bg-[#0a0a0c] overflow-hidden text-white" dir="rtl">
      
      {/* خلفية سوداء ضبابية للجوال لما تفتح القائمة */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* القائمة الجانبية مع أنيميشن الدخول والخروج للجوال */}
      <div className={`fixed inset-y-0 right-0 z-50 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* زر إغلاق القائمة (يظهر فقط في الجوال جوا القائمة) */}
        <button 
          onClick={() => setIsMobileMenuOpen(false)}
          className="absolute top-4 left-4 p-2 bg-red-500/10 text-red-400 rounded-lg lg:hidden hover:bg-red-500/20 z-50 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        <Sidebar />
      </div>
      
      {/* محتوى الصفحات */}
      <main className="flex-1 flex flex-col w-full h-full overflow-hidden">
        {/* هيدر مخصص للجوال يظهر فيه زر القائمة (الهامبرغر) */}
        <div className="lg:hidden flex items-center justify-between p-4 border-b border-white/5 bg-[#2B3A32]">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-[#C5CBAF] tracking-widest uppercase">LUXEBLOOM</h2>
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(true)} 
            className="p-2 bg-[#C5CBAF]/10 text-[#C5CBAF] rounded-lg hover:bg-[#C5CBAF]/20 transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar relative">
          {children}
        </div>
      </main>

      <AssistantPanel />
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      {/* صفحة تسجيل الدخول */}
      <Route path="/login" element={<Login />} />

      {/* باقي الصفحات المغلفة بـ MainLayout الجديد */}
      <Route path="/" element={<ProtectedRoute><MainLayout><Dashboard /></MainLayout></ProtectedRoute>} />
      <Route path="/inventory" element={<ProtectedRoute><MainLayout><Inventory /></MainLayout></ProtectedRoute>} />
      <Route path="/sales" element={<ProtectedRoute><MainLayout><Sales /></MainLayout></ProtectedRoute>} />
      <Route path="/purchases" element={<ProtectedRoute><MainLayout><Purchases /></MainLayout></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><MainLayout><Reports /></MainLayout></ProtectedRoute>} />
      <Route path="/accounting" element={<ProtectedRoute><MainLayout><Accounting /></MainLayout></ProtectedRoute>} />
      <Route path="/customers" element={<ProtectedRoute><MainLayout><Customers /></MainLayout></ProtectedRoute>} />
      <Route path="/suppliers" element={<ProtectedRoute><MainLayout><Suppliers /></MainLayout></ProtectedRoute>} />
      <Route path="/expenses" element={<ProtectedRoute><MainLayout><Expenses /></MainLayout></ProtectedRoute>} />
      <Route path="/partners" element={<ProtectedRoute><MainLayout><Partners /></MainLayout></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><MainLayout><SettingsPage /></MainLayout></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}