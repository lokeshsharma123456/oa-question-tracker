import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check, ChevronRight, Circle, Cloud, CloudOff, Download, FileText, HardDrive,
  LogIn, LogOut, Menu, Moon, Search, Sun, Upload, X,
} from 'lucide-react'
import { marked } from 'marked'
import type { User } from '@supabase/supabase-js'
import questionData from './data/questions.json'
import { supabase } from './lib/supabase'
import './App.css'

type Question = {
  id: string
  company: string
  companyKey: string
  title: string
  type: string
  difficulty: string
  topics: string[]
  techniques: string[]
  dataStructures: string[]
  capturedAt: string | null
  timeComplexity: string | null
  spaceComplexity: string | null
  markdown: string
}

type Progress = { solved: Record<string, boolean>; notes: Record<string, string> }
type StatusFilter = 'all' | 'solved' | 'unsolved'
type SyncState = 'local' | 'loading' | 'synced' | 'error'

const questions = questionData as Question[]
const emptyProgress: Progress = { solved: {}, notes: {} }

function readProgress(): Progress {
  try {
    const saved = localStorage.getItem('oa-progress-v1')
    if (!saved) return emptyProgress
    const parsed = JSON.parse(saved) as Partial<Progress>
    return { solved: parsed.solved ?? {}, notes: parsed.notes ?? {} }
  } catch {
    return emptyProgress
  }
}

function stripMathMarkers(value: string | null) {
  return value?.replaceAll('$', '') ?? 'Not documented'
}

function formatPlainTranscription(text: string, title: string) {
  const sectionHeading = /^(problem|function(?: description)?|input(?: format)?|output(?: format)?|returns?|constraints|notes|examples?|example \d+|sample input(?: \d+)?|sample output(?: \d+)?|explanation(?: \d+)?|starter code)$/i
  let skippedTitle = false

  return text.split(/\r?\n/).map((line) => {
    const trimmed = line.trim()
    if (!skippedTitle && trimmed.toLowerCase() === title.toLowerCase()) {
      skippedTitle = true
      return ''
    }
    if (sectionHeading.test(trimmed)) return `### ${trimmed}`
    return line.replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  }).join('\n')
}

function questionContent(question: Question) {
  const cleaned = question.markdown
    .replace(/^#\s+[^\r\n]+\r?\n/, '')
    .replace(/^## Source(?: image)?\s*$[\s\S]*?(?=^##\s|(?![\s\S]))/mi, '')
    .trim()

  const exactSection = cleaned.match(/^## Exact transcription\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/mi)
  if (!exactSection) return cleaned

  const exactBody = exactSection[1].trim()
  const plainText = exactBody.match(/^```text\s*\r?\n([\s\S]*?)\r?\n```$/i)
  if (!plainText) return `## Exact transcription\n\n${exactBody}`

  return `## Exact transcription\n\n${formatPlainTranscription(plainText[1], question.title)}`
}

function App() {
  const [progress, setProgress] = useState<Progress>(readProgress)
  const [user, setUser] = useState<User | null>(null)
  const [syncState, setSyncState] = useState<SyncState>('loading')
  const [authOpen, setAuthOpen] = useState(false)
  const [authEmail, setAuthEmail] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [authSending, setAuthSending] = useState(false)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [difficulty, setDifficulty] = useState('all')
  const [company, setCompany] = useState('all')
  const [topic, setTopic] = useState('all')
  const [selected, setSelected] = useState<Question | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('oa-theme') ?? 'dark')
  const importRef = useRef<HTMLInputElement>(null)
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())

  useEffect(() => localStorage.setItem('oa-progress-v1', JSON.stringify(progress)), [progress])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('oa-theme', theme)
  }, [theme])
  useEffect(() => {
    document.body.style.overflow = selected ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [selected])
  useEffect(() => {
    async function loadCloudProgress(userId: string) {
      setSyncState('loading')
      const { data, error } = await supabase
        .from('question_progress')
        .select('question_id, solved, notes')
        .eq('user_id', userId)

      if (error) {
        setSyncState('error')
        return
      }

      const local = readProgress()
      const cloud: Progress = { solved: {}, notes: {} }
      data.forEach((row) => {
        cloud.solved[row.question_id] = row.solved
        cloud.notes[row.question_id] = row.notes
      })
      const merged = {
        solved: { ...local.solved, ...cloud.solved },
        notes: { ...local.notes, ...cloud.notes },
      }
      setProgress(merged)

      const changedIds = new Set([...Object.keys(merged.solved), ...Object.keys(merged.notes)])
      const rows = [...changedIds]
        .filter((id) => merged.solved[id] || merged.notes[id])
        .map((id) => ({ user_id: userId, question_id: id, solved: Boolean(merged.solved[id]), notes: merged.notes[id] ?? '' }))
      if (rows.length) {
        const { error: mergeError } = await supabase.from('question_progress').upsert(rows)
        if (mergeError) {
          setSyncState('error')
          return
        }
      }
      setSyncState('synced')
    }

    supabase.auth.getSession().then(({ data }) => {
      const currentUser = data.session?.user ?? null
      setUser(currentUser)
      if (currentUser) void loadCloudProgress(currentUser.id)
      else setSyncState('local')
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (currentUser) window.setTimeout(() => void loadCloudProgress(currentUser.id), 0)
      else setSyncState('local')
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const companies = useMemo(() => {
    const groups = new Map<string, { name: string; count: number; solved: number }>()
    questions.forEach((question) => {
      const current = groups.get(question.companyKey) ?? { name: question.company, count: 0, solved: 0 }
      current.count += 1
      if (progress.solved[question.id]) current.solved += 1
      groups.set(question.companyKey, current)
    })
    return [...groups.entries()].sort((left, right) => left[1].name.localeCompare(right[1].name))
  }, [progress.solved])

  const topics = useMemo(() => {
    const counts = new Map<string, number>()
    questions.forEach((question) => question.topics.forEach((item) => counts.set(item, (counts.get(item) ?? 0) + 1)))
    return [...counts.entries()].sort((left, right) => right[1] - left[1])
  }, [])

  const filtered = useMemo(() => questions.filter((question) => {
    const isSolved = Boolean(progress.solved[question.id])
    const haystack = `${question.title} ${question.company} ${question.id} ${question.topics.join(' ')}`.toLowerCase()
    return (!deferredQuery || haystack.includes(deferredQuery))
      && (status === 'all' || (status === 'solved' ? isSolved : !isSolved))
      && (difficulty === 'all' || question.difficulty === difficulty)
      && (company === 'all' || question.companyKey === company)
      && (topic === 'all' || question.topics.includes(topic))
  }), [company, deferredQuery, difficulty, progress.solved, status, topic])

  const solvedCount = Object.values(progress.solved).filter(Boolean).length
  const completion = questions.length ? Math.round((solvedCount / questions.length) * 100) : 0
  const hasFilters = Boolean(query || status !== 'all' || difficulty !== 'all' || company !== 'all' || topic !== 'all')

  async function syncQuestion(id: string, solved: boolean, notes: string) {
    if (!user) return
    setSyncState('loading')
    const { error } = await supabase.from('question_progress').upsert({
      user_id: user.id,
      question_id: id,
      solved,
      notes,
    })
    setSyncState(error ? 'error' : 'synced')
  }

  function toggleSolved(id: string) {
    setProgress((current) => {
      const solved = !current.solved[id]
      void syncQuestion(id, solved, current.notes[id] ?? '')
      return { ...current, solved: { ...current.solved, [id]: solved } }
    })
  }

  async function sendMagicLink() {
    if (!authEmail.trim()) return
    setAuthSending(true)
    setAuthMessage('')
    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail.trim(),
      options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` },
    })
    setAuthMessage(error ? error.message : 'Check your email for the sign-in link.')
    setAuthSending(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setSyncState('local')
  }

  function resetFilters() {
    setQuery(''); setStatus('all'); setDifficulty('all'); setCompany('all'); setTopic('all')
  }

  function exportProgress() {
    const blob = new Blob(
      [JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...progress }, null, 2)],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `oa-progress-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function importProgress(file: File) {
    try {
      const incoming = JSON.parse(await file.text()) as Partial<Progress>
      if (!incoming.solved || !incoming.notes) throw new Error('Invalid progress file')
      setProgress({ solved: incoming.solved, notes: incoming.notes })
    } catch {
      window.alert('That file is not a valid OA progress backup.')
    }
  }

  return (
    <div className="app-shell">
      <aside className={sidebarOpen ? 'sidebar is-open' : 'sidebar'}>
        <div className="brand-block">
          <div className="brand-mark">OA</div>
          <div><strong>Question Desk</strong><span>Personal practice index</span></div>
          <button className="icon-button mobile-close" onClick={() => setSidebarOpen(false)} title="Close menu"><X size={18} /></button>
        </div>
        <div className="sidebar-progress">
          <div className="progress-copy"><span>Overall progress</span><strong>{completion}%</strong></div>
          <div className="progress-track"><span style={{ width: `${completion}%` }} /></div>
          <small>{solvedCount} of {questions.length} solved</small>
        </div>
        <nav className="company-nav" aria-label="Company filters">
          <p className="nav-label">Collections</p>
          <button className={company === 'all' ? 'company-link active' : 'company-link'} onClick={() => { setCompany('all'); setSidebarOpen(false) }}>
            <span>All companies</span><b>{questions.length}</b>
          </button>
          {companies.map(([key, value]) => (
            <button className={company === key ? 'company-link active' : 'company-link'} key={key} onClick={() => { setCompany(key); setSidebarOpen(false) }}>
              <span>{value.name}</span><b>{value.solved}/{value.count}</b>
            </button>
          ))}
        </nav>
        <div className="sidebar-actions">
          <button onClick={exportProgress}><Download size={16} /> Export progress</button>
          <button onClick={() => importRef.current?.click()}><Upload size={16} /> Import progress</button>
          <input ref={importRef} type="file" accept="application/json" hidden onChange={(event) => event.target.files?.[0] && importProgress(event.target.files[0])} />
          <p>{user ? 'Progress is synced to your private account.' : 'Progress stays in this browser until you sign in.'}</p>
        </div>
      </aside>

      {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close menu" />}

      <main className="main-content">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setSidebarOpen(true)} title="Open menu"><Menu size={20} /></button>
          <div className="mobile-wordmark">Question Desk</div>
          <div className={`topbar-meta sync-${syncState}`}>
            {syncState === 'error' ? <CloudOff size={14} /> : <Cloud size={14} />}
            {user ? (syncState === 'loading' ? 'Syncing...' : syncState === 'error' ? 'Sync failed' : 'Cloud synced') : 'Saved locally'}
          </div>
          {user ? (
            <button className="account-button" onClick={signOut} title="Sign out"><span>{user.email}</span><LogOut size={16} /></button>
          ) : (
            <button className="account-button" onClick={() => setAuthOpen(true)}><LogIn size={16} /><span>Sign in to sync</span></button>
          )}
          <button className="icon-button" onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} title={theme === 'dark' ? 'Use light mode' : 'Use dark mode'}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </header>

        <section className="workspace-heading">
          <div>
            <p className="eyebrow">Practice workspace</p>
            <h1>{company === 'all' ? 'All questions' : companies.find(([key]) => key === company)?.[1].name}</h1>
            <p>Search, filter, and work through your online assessment archive.</p>
          </div>
          <div className="summary-grid">
            <div><span>Questions</span><strong>{questions.length}</strong></div>
            <div><span>Solved</span><strong>{solvedCount}</strong></div>
            <div><span>Remaining</span><strong>{questions.length - solvedCount}</strong></div>
          </div>
        </section>

        <section className="controls" aria-label="Question filters">
          <div className="search-field">
            <Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, company, topic, or ID" />
            {query && <button onClick={() => setQuery('')} title="Clear search"><X size={16} /></button>}
          </div>
          <div className="status-tabs">
            {(['all', 'unsolved', 'solved'] as StatusFilter[]).map((item) => (
              <button key={item} className={status === item ? 'active' : ''} onClick={() => setStatus(item)}>{item[0].toUpperCase() + item.slice(1)}</button>
            ))}
          </div>
          <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} aria-label="Difficulty">
            <option value="all">All difficulties</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option><option value="unknown">Unknown</option>
          </select>
        </section>

        <section className="topic-strip" aria-label="Popular topic filters">
          <button className={topic === 'all' ? 'active' : ''} onClick={() => setTopic('all')}>All topics</button>
          {topics.slice(0, 12).map(([name, count]) => (
            <button className={topic === name ? 'active' : ''} key={name} onClick={() => setTopic(name)}>{name.replaceAll('-', ' ')} <span>{count}</span></button>
          ))}
        </section>

        <section className="question-panel">
          <div className="panel-head"><p><strong>{filtered.length}</strong> questions shown</p>{hasFilters && <button onClick={resetFilters}>Reset filters</button>}</div>
          <div className="question-list">
            <div className="question-row table-header"><span>Status</span><span>Question</span><span>Difficulty</span><span>Complexity</span><span aria-hidden="true" /></div>
            {filtered.map((question) => {
              const isSolved = Boolean(progress.solved[question.id])
              return (
                <article className={isSolved ? 'question-row solved' : 'question-row'} key={question.id} onClick={() => setSelected(question)}>
                  <button className={isSolved ? 'solve-toggle checked' : 'solve-toggle'} onClick={(event) => { event.stopPropagation(); toggleSolved(question.id) }} title={isSolved ? 'Mark unsolved' : 'Mark solved'}>
                    {isSolved ? <Check size={16} /> : <Circle size={16} />}
                  </button>
                  <div className="question-name">
                    <div><strong>{question.title}</strong><span>{question.id}</span></div>
                    <div className="tag-line"><span className="company-tag">{question.company}</span>{question.topics.slice(0, 3).map((item) => <span key={item}>{item.replaceAll('-', ' ')}</span>)}</div>
                  </div>
                  <span className={`difficulty ${question.difficulty}`}>{question.difficulty}</span>
                  <div className="complexity-cell"><span>{stripMathMarkers(question.timeComplexity)}</span>{question.spaceComplexity && <small>Space: {stripMathMarkers(question.spaceComplexity)}</small>}</div>
                  <ChevronRight className="row-arrow" size={18} />
                </article>
              )
            })}
          </div>
          {!filtered.length && <div className="empty-state"><Search size={28} /><h2>No matching questions</h2><p>Try clearing a filter or searching for another topic.</p><button onClick={resetFilters}>Clear all filters</button></div>}
        </section>
      </main>

      {selected && (
        <div className="detail-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}>
          <aside className="detail-drawer" aria-label={`${selected.title} details`}>
            <header className="drawer-header">
              <div><span>{selected.company} / {selected.id}</span><h2>{selected.title}</h2></div>
              <button className="icon-button" onClick={() => setSelected(null)} title="Close details"><X size={20} /></button>
            </header>
            <div className="drawer-meta"><span className={`difficulty ${selected.difficulty}`}>{selected.difficulty}</span>{selected.topics.map((item) => <span className="meta-chip" key={item}>{item.replaceAll('-', ' ')}</span>)}</div>
            <section className="problem-statement" aria-label="Question transcription">
              <div className="problem-label">Problem</div>
              <div className="markdown-body" dangerouslySetInnerHTML={{ __html: marked.parse(questionContent(selected), { breaks: true }) as string }} />
            </section>
            <div className="complexity-box">
              <div><FileText size={18} /><span>Expected time complexity</span><strong>{stripMathMarkers(selected.timeComplexity)}</strong></div>
              <div><HardDrive size={18} /><span>Expected space complexity</span><strong>{stripMathMarkers(selected.spaceComplexity)}</strong></div>
            </div>
            <button className={progress.solved[selected.id] ? 'drawer-solve solved' : 'drawer-solve'} onClick={() => toggleSolved(selected.id)}>
              {progress.solved[selected.id] ? <Check size={18} /> : <Circle size={18} />}{progress.solved[selected.id] ? 'Solved' : 'Mark as solved'}
            </button>
            <label className="notes-field">
              <span>Personal notes</span>
              <textarea
                value={progress.notes[selected.id] ?? ''}
                onChange={(event) => setProgress((current) => ({ ...current, notes: { ...current.notes, [selected.id]: event.target.value } }))}
                onBlur={() => void syncQuestion(selected.id, Boolean(progress.solved[selected.id]), progress.notes[selected.id] ?? '')}
                placeholder="Add an approach, mistake, or reminder..."
              />
            </label>
          </aside>
        </div>
      )}

      {authOpen && (
        <div className="auth-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setAuthOpen(false)}>
          <form className="auth-dialog" onSubmit={(event) => { event.preventDefault(); void sendMagicLink() }}>
            <button type="button" className="icon-button auth-close" onClick={() => setAuthOpen(false)} title="Close sign in"><X size={18} /></button>
            <Cloud size={24} />
            <h2>Sync your progress</h2>
            <p>Enter your email and use the private sign-in link we send you. Your solved questions and notes will then follow you across browsers.</p>
            <label><span>Email</span><input type="email" required value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="you@example.com" /></label>
            <button className="auth-submit" disabled={authSending}>{authSending ? 'Sending...' : 'Send sign-in link'}</button>
            {authMessage && <p className="auth-message" role="status">{authMessage}</p>}
          </form>
        </div>
      )}
    </div>
  )
}

export default App