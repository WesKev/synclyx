// ─── Note Types ───────────────────────────────────────────────────────────────

export type BlockType = 'text' | 'code' | 'image' | 'link' | 'video' | 'audio' | 'file'

export interface Block {
  id: string
  type: BlockType
  content: string
  meta?: Record<string, string>
  createdAt: number
}

export interface Note {
  id: string
  title: string
  blocks: Block[]
  tags: string[]
  pinned: boolean
  notebookId?: string
  templateId?: string
  linkedNotes: string[]
  createdAt: number
  updatedAt: number
  userId: string
}

export interface Notebook {
  id: string
  name: string
  color?: string
  userId: string
  createdAt: number
}

export interface Template {
  id: string
  name: string
  blocks: Block[]
  userId: string
  createdAt: number
}

// ─── Clipboard Types ───────────────────────────────────────────────────────────

export type ClipType = 'text' | 'image' | 'file' | 'link'

export interface ClipItem {
  id: string
  type: ClipType
  content: string
  preview?: string
  fileName?: string
  fileSize?: number
  source?: string
  savedToNoteId?: string
  createdAt: number
  userId: string
}

// ─── User Types ───────────────────────────────────────────────────────────────

export type UserTier = 'free' | 'pro'

export interface UserProfile {
  uid: string
  email: string
  displayName?: string
  tier: UserTier
  createdAt: number
}
