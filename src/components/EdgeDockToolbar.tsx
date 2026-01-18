import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'

export interface EdgeDockToolbarAction {
  id: string
  icon: ReactNode
  title: string
  onClick: () => void
  disabled?: boolean
}

interface EdgeDockToolbarProps {
  actions: EdgeDockToolbarAction[]
  storageKey: string
  containerRef?: RefObject<HTMLElement>
  defaultTop?: number
}

const HANDLE_WIDTH = 18
const EDGE_PADDING = 8
const COLLAPSE_DELAY_MS = 450

export function EdgeDockToolbar({ actions, storageKey, containerRef, defaultTop = 12 }: Readonly<EdgeDockToolbarProps>) {
  const toolbarRef = useRef<HTMLDivElement>(null)
  const collapseTimerRef = useRef<number | null>(null)
  const dragOffsetYRef = useRef(0)

  const [top, setTop] = useState(() => {
    const raw = localStorage.getItem(storageKey)
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) ? n : defaultTop
  })

  const [expanded, setExpanded] = useState(false)
  const [dragging, setDragging] = useState(false)

  const clampTop = useMemo(() => {
    return (nextTop: number) => {
      const containerRect = containerRef?.current?.getBoundingClientRect()
      const toolbarHeight = toolbarRef.current?.getBoundingClientRect().height ?? 0

      const minTop = EDGE_PADDING
      const maxTop = Math.max(
        EDGE_PADDING,
        (containerRect?.height ?? window.innerHeight) - toolbarHeight - EDGE_PADDING
      )

      return Math.max(minTop, Math.min(maxTop, nextTop))
    }
  }, [containerRef])

  useEffect(() => {
    localStorage.setItem(storageKey, String(top))
  }, [storageKey, top])

  useEffect(() => {
    return () => {
      if (collapseTimerRef.current) {
        window.clearTimeout(collapseTimerRef.current)
        collapseTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!dragging) return

    const handlePointerMove = (e: PointerEvent) => {
      const containerRect = containerRef?.current?.getBoundingClientRect()
      const baseTop = containerRect?.top ?? 0
      const nextTop = e.clientY - baseTop - dragOffsetYRef.current
      setTop(clampTop(nextTop))
    }

    const handlePointerUp = () => {
      setDragging(false)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [clampTop, containerRef, dragging])

  const scheduleCollapse = () => {
    if (collapseTimerRef.current) window.clearTimeout(collapseTimerRef.current)
    collapseTimerRef.current = window.setTimeout(() => {
      if (!dragging) setExpanded(false)
    }, COLLAPSE_DELAY_MS)
  }

  const cancelCollapse = () => {
    if (collapseTimerRef.current) {
      window.clearTimeout(collapseTimerRef.current)
      collapseTimerRef.current = null
    }
  }

  const beginDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()

    cancelCollapse()
    setExpanded(true)
    setDragging(true)

    const containerRect = containerRef?.current?.getBoundingClientRect()
    const baseTop = containerRect?.top ?? 0
    dragOffsetYRef.current = e.clientY - baseTop - top

    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  return (
    <div
      ref={toolbarRef}
      onMouseEnter={() => {
        cancelCollapse()
        setExpanded(true)
      }}
      onMouseLeave={() => {
        scheduleCollapse()
      }}
      style={{
        position: 'absolute',
        top,
        right: 0,
        zIndex: 3,
        display: 'flex',
        alignItems: 'stretch',
        transform: expanded ? 'translateX(0)' : `translateX(calc(100% - ${HANDLE_WIDTH}px))`,
        transition: 'transform 160ms ease',
        borderRadius: '10px 0 0 10px',
        background: 'rgba(0,0,0,0.55)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRight: 'none',
        backdropFilter: 'blur(6px)',
        pointerEvents: 'auto'
      }}
    >
      <div
        onPointerDown={beginDrag}
        title="拖曳上下移動"
        style={{
          width: `${HANDLE_WIDTH}px`,
          minWidth: `${HANDLE_WIDTH}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: dragging ? 'grabbing' : 'grab',
          color: 'rgba(255,255,255,0.9)',
          userSelect: 'none'
        }}
      >
        ⋮
      </div>

      <div style={{ display: 'flex', gap: '6px', padding: '6px 8px 6px 6px' }}>
        {actions.map(action => (
          <button
            key={action.id}
            onClick={(e) => {
              e.stopPropagation()
              action.onClick()
            }}
            disabled={action.disabled}
            style={{
              background: 'rgba(255,255,255,0.12)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '6px',
              padding: '4px 8px',
              fontSize: '12px',
              cursor: action.disabled ? 'not-allowed' : 'pointer',
              opacity: action.disabled ? 0.55 : 1,
              whiteSpace: 'nowrap'
            }}
            title={action.title}
          >
            {action.icon}
          </button>
        ))}
      </div>
    </div>
  )
}
