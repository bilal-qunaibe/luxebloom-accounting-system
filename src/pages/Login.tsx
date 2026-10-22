import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../firebase'
import { useLocation, useNavigate } from 'react-router-dom'
import { Lock, Mail } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const location = useLocation()
  const [error, setError] = useState<string>((location.state as any)?.error || '')
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    
    try {
      await signInWithEmailAndPassword(auth, email, password)
      navigate('/') 
    } catch (err: any) {
      console.error(err)
      setError('البريد الإلكتروني أو كلمة المرور غير صحيحة!')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    // الخلفية أخذت نفس اللون الزيتي الغامق الخاص باللوجو
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#2B3A32]">
      
      {/* تأثيرات إضاءة خفيفة بنفس اللون الفاتح الخاص باللوجو */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#C5CBAF]/10 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-black/20 blur-[120px] rounded-full pointer-events-none"></div>

      <div className="glass-panel w-full max-w-md p-8 sm:p-10 rounded-3xl border border-[#C5CBAF]/10 relative z-10 shadow-2xl shadow-black/40 backdrop-blur-xl bg-[#2B3A32]/50">
        
        <div className="text-center mb-8">
          {/* عرض اللوجو الخاص بك */}
          <div className="relative w-48 h-auto mx-auto mb-2 flex items-center justify-center">
            <img 
              src="/download.jpeg" 
              alt="LUXEBLOOM Logo" 
              className="w-full h-full object-contain mix-blend-screen drop-shadow-xl rounded-xl"
            />
          </div>
          
          <p className="text-[#C5CBAF]/70 text-sm tracking-wide mt-2">
            بوابة الدخول للنظام الإداري
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-[#C5CBAF]/80 mb-2 uppercase tracking-wider">
              البريد الإلكتروني
            </label>
            <div className="relative">
              <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C5CBAF]/40" />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pr-11 pl-4 py-3 bg-black/20 border border-[#C5CBAF]/10 rounded-xl text-[#C5CBAF] placeholder:text-[#C5CBAF]/30 focus:outline-none focus:border-[#C5CBAF]/50 focus:bg-black/30 transition-all" 
                placeholder="admin@luxebloom.com" 
                required 
                dir="ltr"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#C5CBAF]/80 mb-2 uppercase tracking-wider">
              كلمة المرور
            </label>
            <div className="relative">
              <Lock className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C5CBAF]/40" />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pr-11 pl-4 py-3 bg-black/20 border border-[#C5CBAF]/10 rounded-xl text-[#C5CBAF] placeholder:text-[#C5CBAF]/30 focus:outline-none focus:border-[#C5CBAF]/50 focus:bg-black/30 transition-all" 
                placeholder="••••••••" 
                required 
                dir="ltr"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs text-center font-medium">
              {error}
            </div>
          )}

          {/* الزر أخذ اللون الفاتح تبع اللوجو، والنص صار باللون الغامق عشان يبرز */}
          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full py-4 mt-4 bg-[#C5CBAF] hover:bg-[#b5bc9a] text-[#2B3A32] text-sm font-bold tracking-wider uppercase rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-70 shadow-lg shadow-[#C5CBAF]/10"
          >
            {isLoading ? (
              <span className="w-5 h-5 border-2 border-[#2B3A32]/30 border-t-[#2B3A32] rounded-full animate-spin"></span>
            ) : (
              'تسجيل الدخول'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}