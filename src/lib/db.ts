import { useEffect, useRef } from 'react'
import { httpsCallable } from 'firebase/functions'
import { auth, firebaseConfig, functions } from '../firebase'

// طبقة البيانات الموحدة للنظام
// القراءة: Firestore REST مع توكن تسجيل الدخول (نفس الطريق اللي ماشي مع مزود الإنترنت)
// الكتابة: كلها عن طريق الدالة السحابية luxeAction

const BASE_URL = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`

function parseValue(v: any): any {
  if (!v || typeof v !== 'object') return null
  if ('stringValue' in v) return v.stringValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return Number(v.doubleValue)
  if ('booleanValue' in v) return v.booleanValue
  if ('nullValue' in v) return null
  if ('timestampValue' in v) return v.timestampValue
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(parseValue)
  if ('mapValue' in v) return parseFields(v.mapValue.fields || {})
  return null
}

function parseFields(fields: Record<string, any>) {
  const out: Record<string, any> = {}
  for (const key in fields) out[key] = parseValue(fields[key])
  return out
}

export function parseFirestoreDoc(doc: any) {
  return { id: String(doc.name).split('/').pop(), ...parseFields(doc.fields || {}) }
}

async function authHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser
  if (!user) throw new Error('انتهت الجلسة، سجل دخول من جديد')
  return { Authorization: `Bearer ${await user.getIdToken()}` }
}

// جلب كل مستندات الكوليكشن (بصفحات)
export async function fetchAllDocs<T = any>(collectionName: string): Promise<T[]> {
  const headers = await authHeaders()
  let all: any[] = []
  let pageToken = ''
  do {
    const url = `${BASE_URL}/${collectionName}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`
    const res = await fetch(url, { headers })
    if (res.status === 404) break
    if (res.status === 403) throw new Error('ما عندك صلاحية تقرأ هاي البيانات')
    if (!res.ok) throw new Error('فشل جلب البيانات')
    const data = await res.json()
    if (data.documents) all = all.concat(data.documents.map(parseFirestoreDoc))
    pageToken = data.nextPageToken || ''
  } while (pageToken)
  return all
}

export async function fetchDoc<T = any>(collectionName: string, id: string): Promise<T | null> {
  const res = await fetch(`${BASE_URL}/${collectionName}/${id}`, { headers: await authHeaders() })
  if (res.status === 404) return null
  if (!res.ok) throw new Error('فشل جلب البيانات')
  return parseFirestoreDoc(await res.json()) as T
}

function errorMessage(err: any) {
  const msg = String(err?.message || '')
  if (err?.code === 'functions/unavailable' || msg === 'Failed to fetch') return 'في مشكلة اتصال، تأكد من الإنترنت وجرب مرة ثانية'
  if (err?.code === 'functions/deadline-exceeded') return 'العملية طولت، تأكد إذا انحفظت قبل ما تعيدها'
  return msg || 'صار خطأ، جرب مرة ثانية'
}

const actionFn = httpsCallable(functions, 'luxeAction', { timeout: 120_000 })

// أي عملية حفظ/تعديل/إلغاء
export async function callAction<T = any>(type: string, payload: unknown = {}, origin: 'ui' | 'assistant' = 'ui'): Promise<T> {
  try {
    const res = await actionFn({ type, payload, origin })
    return res.data as T
  } catch (err) {
    throw new Error(errorMessage(err))
  }
}

const assistantFn = httpsCallable(functions, 'luxeAssistant', { timeout: 120_000 })

export interface Proposal {
  id: string
  action: string
  payload: unknown
  preview: { title: string; lines: string[]; total?: string; warnings: string[] }
}

export async function askAssistant(messages: Array<{ role: 'user' | 'assistant'; content: string }>) {
  try {
    const res = await assistantFn({ messages })
    return res.data as { reply: string; proposals: Proposal[] }
  } catch (err) {
    throw new Error(errorMessage(err))
  }
}

// ---------- مساعدات العرض ----------

export const isCancelled = (doc: { status?: string }) => doc?.status === 'CANCELLED'

export const money = (n: unknown) => `${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-US')} ₪`

export const PAYMENT_METHODS = [
  { value: 'CASH', label: 'نقدي' },
  { value: 'BANK_TRANSFER', label: 'تحويل بنكي' },
  { value: 'CREDIT_CARD', label: 'بطاقة ائتمان' },
]

export const CURRENCIES = [
  { value: 'ILS', label: 'شيكل' },
  { value: 'USD', label: 'دولار' },
  { value: 'JOD', label: 'دينار' },
]

export const EXPENSE_CATEGORIES = [
  'رواتب وأجور',
  'فواتير (كهرباء، ماء، إنترنت)',
  'إيجار المحل',
  'صيانة وتصليحات',
  'ضيافة ونثريات',
  'تسويق وإعلانات',
  'شحن وتوصيل',
  'مشتريات ومستلزمات',
  'مصاريف أخرى',
]

export const byNewest = (a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()

// لما المساعد يحفظ عملية، الصفحة المفتوحة بتحدّث حالها
const CHANGED_EVENT = 'luxe:data-changed'

export const notifyDataChanged = () => window.dispatchEvent(new Event(CHANGED_EVENT))

export function useDataRefresh(refresh: () => void) {
  const ref = useRef(refresh)
  ref.current = refresh
  useEffect(() => {
    const handler = () => ref.current()
    window.addEventListener(CHANGED_EVENT, handler)
    return () => window.removeEventListener(CHANGED_EVENT, handler)
  }, [])
}
