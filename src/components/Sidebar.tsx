import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Package, ShoppingCart, ShoppingBag, BarChart2, Calculator, Users, Truck, Receipt, Handshake, Settings, LogOut } from 'lucide-react'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'

export default function Sidebar() {
  const location = useLocation()
  
  // روابط صفحات النظام تبعتك
  const menuItems = [
    { name: 'لوحة التحكم', path: '/', icon: LayoutDashboard },
    { name: 'المخزون', path: '/inventory', icon: Package },
    { name: 'المبيعات', path: '/sales', icon: ShoppingCart },
    { name: 'المشتريات', path: '/purchases', icon: ShoppingBag },
    { name: 'العملاء', path: '/customers', icon: Users },
    { name: 'الموردين', path: '/suppliers', icon: Truck },
    { name: 'المصاريف', path: '/expenses', icon: Receipt },
    { name: 'الشركاء', path: '/partners', icon: Handshake },
    { name: 'المحاسبة', path: '/accounting', icon: Calculator },
    { name: 'التقارير', path: '/reports', icon: BarChart2 },
    { name: 'الإعدادات', path: '/settings', icon: Settings },
  ]

  return (
    <div className="w-64 bg-[#2B3A32] border-l border-[#C5CBAF]/10 flex flex-col h-full shadow-2xl z-20 shrink-0">
      {/* ترويسة القائمة - اللوجو أو اسم البراند */}
      <div className="p-6 flex flex-col items-center justify-center border-b border-[#C5CBAF]/10">
        <h2 className="text-2xl font-bold text-[#C5CBAF] tracking-widest uppercase mb-1">
          LUXEBLOOM
        </h2>
        <span className="text-[10px] text-[#C5CBAF]/50 tracking-wider">نظام الإدارة الشامل</span>
      </div>
      
      {/* أزرار التنقل */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = location.pathname === item.path
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                isActive 
                  ? 'bg-[#C5CBAF] text-[#2B3A32] font-bold shadow-lg shadow-[#C5CBAF]/10' 
                  : 'text-[#C5CBAF]/70 hover:bg-[#C5CBAF]/10 hover:text-[#C5CBAF]'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-sm">{item.name}</span>
            </Link>
          )
        })}
      </nav>

      {/* تذييل القائمة */}
      <div className="p-4 border-t border-[#C5CBAF]/10 text-center space-y-3">
        <button
          onClick={() => signOut(auth)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-[#C5CBAF]/60 hover:bg-red-500/10 hover:text-red-400 transition-colors text-sm"
        >
          <LogOut className="w-4 h-4" /> تسجيل الخروج
        </button>
        <p className="text-[10px] text-[#C5CBAF]/40">LUXEBLOOM V2.0 © 2026</p>
      </div>
    </div>
  )
}