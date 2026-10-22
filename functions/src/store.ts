import type { Firestore, Transaction } from 'firebase-admin/firestore'

// طبقة تخزين بسيطة فوق Firestore
// كل منطق النظام بيمر من هون، عشان نقدر نفحصه بدون اتصال بقاعدة البيانات

export type Doc = Record<string, any>

export interface Snap {
  id: string
  exists: boolean
  data: Doc
}

export type Where = [field: string, op: '==', value: unknown]

export interface Reader {
  get(col: string, id: string): Promise<Snap>
  getMany(col: string, ids: string[]): Promise<Snap[]>
  query(col: string, where: Where[], limit?: number): Promise<Snap[]>
}

export interface Tx extends Reader {
  set(col: string, id: string, data: Doc): void
  update(col: string, id: string, data: Doc): void
  delete(col: string, id: string): void
  newId(col: string): string
}

export interface Store extends Reader {
  runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>
  list(col: string): Promise<Snap[]>
  newId(col: string): string
  batchWrite(writes: Array<{ col: string; id: string; data: Doc; merge?: boolean }>): Promise<void>
  createIfMissing(col: string, id: string, data: Doc): Promise<boolean>
}

function toSnap(s: FirebaseFirestore.DocumentSnapshot): Snap {
  return { id: s.id, exists: s.exists, data: (s.data() as Doc) || {} }
}

function buildQuery(db: Firestore, col: string, where: Where[], limit?: number) {
  let q: FirebaseFirestore.Query = db.collection(col)
  for (const [field, op, value] of where) q = q.where(field, op, value)
  if (limit) q = q.limit(limit)
  return q
}

class FirestoreTx implements Tx {
  constructor(private db: Firestore, private tx: Transaction) {}

  async get(col: string, id: string) {
    return toSnap(await this.tx.get(this.db.collection(col).doc(id)))
  }

  async getMany(col: string, ids: string[]) {
    if (ids.length === 0) return []
    const refs = ids.map(id => this.db.collection(col).doc(id))
    const snaps = await this.tx.getAll(...refs)
    return snaps.map(toSnap)
  }

  async query(col: string, where: Where[], limit?: number) {
    const res = await this.tx.get(buildQuery(this.db, col, where, limit))
    return res.docs.map(toSnap)
  }

  set(col: string, id: string, data: Doc) {
    this.tx.set(this.db.collection(col).doc(id), data)
  }

  update(col: string, id: string, data: Doc) {
    this.tx.update(this.db.collection(col).doc(id), data)
  }

  delete(col: string, id: string) {
    this.tx.delete(this.db.collection(col).doc(id))
  }

  newId(col: string) {
    return this.db.collection(col).doc().id
  }
}

export class FirestoreStore implements Store {
  constructor(private db: Firestore) {}

  runTransaction<T>(fn: (tx: Tx) => Promise<T>) {
    return this.db.runTransaction(tx => fn(new FirestoreTx(this.db, tx)))
  }

  async get(col: string, id: string) {
    return toSnap(await this.db.collection(col).doc(id).get())
  }

  async getMany(col: string, ids: string[]) {
    if (ids.length === 0) return []
    const snaps = await this.db.getAll(...ids.map(id => this.db.collection(col).doc(id)))
    return snaps.map(toSnap)
  }

  async query(col: string, where: Where[], limit?: number) {
    const res = await buildQuery(this.db, col, where, limit).get()
    return res.docs.map(toSnap)
  }

  async list(col: string) {
    const res = await this.db.collection(col).get()
    return res.docs.map(toSnap)
  }

  newId(col: string) {
    return this.db.collection(col).doc().id
  }

  async batchWrite(writes: Array<{ col: string; id: string; data: Doc; merge?: boolean }>) {
    for (let i = 0; i < writes.length; i += 400) {
      const batch = this.db.batch()
      for (const w of writes.slice(i, i + 400)) {
        batch.set(this.db.collection(w.col).doc(w.id), w.data, { merge: !!w.merge })
      }
      await batch.commit()
    }
  }

  async createIfMissing(col: string, id: string, data: Doc) {
    try {
      await this.db.collection(col).doc(id).create(data)
      return true
    } catch (err: any) {
      // 6 = ALREADY_EXISTS
      if (err?.code === 6) return false
      throw err
    }
  }
}
