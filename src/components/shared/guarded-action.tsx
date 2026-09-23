"use client"

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { BusyOverlay } from "@/components/shared/busy-overlay"

export type ConfirmOptions = {
  title: string
  description?: ReactNode
  confirmLabel: string
  /** Rejections, returns and removals — styled so they don't read as "OK". */
  destructive?: boolean
}

/**
 * One way for every write on the application page to behave: ask first, then
 * cover the screen until the page in front of the clerk reflects what was
 * just recorded.
 *
 *   const guard = useGuardedAction()
 *
 *   async function handleSave() {
 *     if (!(await guard.confirm({ title, confirmLabel }))) return
 *     guard.start("Saving…")
 *     const result = await save()
 *     if (result.error) {
 *       guard.stop()
 *       setError(result.error)
 *       return
 *     }
 *     guard.finish() // refreshes; the overlay stays until it lands
 *   }
 *
 *   return <>…{guard.element}</>
 *
 * `element` holds both the confirmation dialog and the overlay. When the
 * action lives inside another dialog, render them apart: `confirmDialog`
 * inside that dialog's content, so the confirmation opens as a nested dialog
 * rather than as a click outside the first one, and `overlay` outside it, so
 * it outlasts the form closing on success. Keep the outer dialog from closing
 * while `busy` — the overlay sits outside it, and a click on it reads as a
 * click outside.
 */
export type GuardedAction = ReturnType<typeof useGuardedAction>

export function useGuardedAction() {
  const router = useRouter()
  // Held apart from `open` so the wording stays put while the dialog animates
  // closed.
  const [asking, setAsking] = useState(false)
  const [pending, setPending] = useState<ConfirmOptions | null>(null)
  const resolveRef = useRef<((ok: boolean) => void) | null>(null)

  const [active, setActive] = useState(false)
  const [label, setLabel] = useState("Working…")
  // router.refresh() re-renders on the server; the transition is what says
  // when that has actually landed.
  const [refreshing, startRefresh] = useTransition()

  function settle(ok: boolean) {
    resolveRef.current?.(ok)
    resolveRef.current = null
    setAsking(false)
  }

  function confirm(options: ConfirmOptions): Promise<boolean> {
    // A second ask while one is open answers the first with a no.
    resolveRef.current?.(false)
    setPending(options)
    setAsking(true)
    return new Promise((resolve) => {
      resolveRef.current = resolve
    })
  }

  function start(busyLabel: string) {
    setLabel(busyLabel)
    setActive(true)
  }

  function stop() {
    setActive(false)
  }

  // Run once the refreshed page has arrived — for a form that swaps itself out
  // on save, which would otherwise take the overlay down with it early.
  const afterRefreshRef = useRef<(() => void) | null>(null)

  /**
   * Hands the overlay over to the refresh. `active` drops only once the
   * transition owns the wait, so there is no frame where the page is live
   * again but still showing the state the action replaced.
   */
  function finish(afterRefresh?: () => void) {
    afterRefreshRef.current = afterRefresh ?? null
    startRefresh(() => {
      router.refresh()
    })
    setActive(false)
  }

  const busy = active || refreshing

  useEffect(() => {
    if (busy || !afterRefreshRef.current) return
    const run = afterRefreshRef.current
    afterRefreshRef.current = null
    run()
  }, [busy])

  const confirmDialog = (
    <Dialog
      open={asking}
      onOpenChange={(open) => {
        if (!open) settle(false)
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{pending?.title}</DialogTitle>
          {pending?.description && (
            <DialogDescription>{pending.description}</DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => settle(false)}>
            Cancel
          </Button>
          <Button
            variant={pending?.destructive ? "destructive" : "default"}
            onClick={() => settle(true)}
          >
            {pending?.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  const overlay = busy && (
    <BusyOverlay label={label} detail="Please wait — this is being recorded." />
  )

  const element = (
    <>
      {confirmDialog}
      {overlay}
    </>
  )

  return {
    confirm,
    start,
    stop,
    finish,
    busy,
    element,
    confirmDialog,
    overlay,
  }
}
