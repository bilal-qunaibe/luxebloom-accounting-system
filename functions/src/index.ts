import Anthropic from '@anthropic-ai/sdk'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { defineSecret, defineString } from 'firebase-functions/params'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { runAssistant, type ChatMessage } from './assistant/run.js'
import { resolveMember, runAction } from './domain/actions.js'
import { AppError } from './domain/core.js'
import { FirestoreStore } from './store.js'

initializeApp()
const store = new FirestoreStore(getFirestore())

const REGION = 'us-central1'
const OWNER_EMAILS = defineString('LUXE_OWNER_EMAILS', {
  description: 'إيميلات أصحاب الحساب المسموح لهم يدخلوا النظام (مفصولة بفاصلة)',
})
const ASSISTANT_MODEL = defineString('LUXE_ASSISTANT_MODEL', { default: 'claude-sonnet-5-5' })
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')

const ownerEmails = () =>
  OWNER_EMAILS.value()
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)

function toHttpsError(err: unknown): HttpsError {
  if (err instanceof HttpsError) return err
  if (err instanceof AppError) {
    const code = { invalid: 'invalid-argument', 'not-found': 'not-found', denied: 'permission-denied', conflict: 'aborted' } as const
    return new HttpsError(code[err.code], err.message)
  }
  logger.error('luxebloom: unexpected error', err)
  return new HttpsError('internal', 'صار خطأ غير متوقع، جرب مرة ثانية')
}

// كل عمليات الكتابة بالنظام بتمر من هون
export const luxeAction = onCall({ region: REGION, memory: '256MiB', timeoutSeconds: 120 }, async req => {
  try {
    const ctx = await resolveMember(store, req.auth ? { uid: req.auth.uid, email: req.auth.token.email } : undefined, ownerEmails())
    const { type, payload, origin } = (req.data || {}) as { type?: string; payload?: unknown; origin?: string }
    if (type === 'session.init') return { role: ctx.role, email: ctx.email }
    ctx.origin = origin === 'assistant' ? 'assistant' : 'ui'
    const result = await runAction(store, ctx, String(type || ''), payload ?? {})
    logger.info('luxebloom: action', { type, uid: ctx.uid, origin: ctx.origin })
    return result
  } catch (err) {
    throw toHttpsError(err)
  }
})

// المساعد: بيفهم الطلب وبيرجع بطاقات للتأكيد، وما بيكتب إشي بنفسه
export const luxeAssistant = onCall(
  { region: REGION, memory: '512MiB', timeoutSeconds: 120, secrets: [ANTHROPIC_API_KEY] },
  async req => {
    try {
      const ctx = await resolveMember(store, req.auth ? { uid: req.auth.uid, email: req.auth.token.email } : undefined, ownerEmails())
      ctx.origin = 'assistant'
      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() })
      const messages = ((req.data || {}).messages || []) as ChatMessage[]
      return await runAssistant({ store, ctx, client, model: ASSISTANT_MODEL.value(), messages })
    } catch (err: any) {
      if (err?.status === 401) throw new HttpsError('failed-precondition', 'مفتاح Claude API غير صحيح')
      if (err?.status === 429 || err?.status === 529) throw new HttpsError('resource-exhausted', 'المساعد مضغوط هلأ، جرب بعد شوي')
      throw toHttpsError(err)
    }
  },
)
