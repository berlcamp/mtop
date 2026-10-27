"use client"

import { useRef, useState } from "react"
import { CarFront, ImageUp, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { prepareUnitPhoto } from "@/lib/unit-photo"

export function UnitPhotoSlot({ photoUrl, canEdit, busy, onUpload, onRemove }: {
  photoUrl: string | null; canEdit: boolean; busy: boolean
  onUpload: (blob: Blob) => Promise<string | null>; onRemove: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const disabled = busy || processing

  async function picked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ""
    if (!file) return
    setProcessing(true)
    setError(null)
    try {
      const result = await onUpload(await prepareUnitPhoto(file))
      if (result) setError(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload the image.")
    } finally { setProcessing(false) }
  }

  return <div className="space-y-2">
    <Label className="text-xs text-muted-foreground">Unit</Label>
    <div className="relative aspect-[3/4] w-full max-w-64 overflow-hidden rounded-md border bg-muted">
      {photoUrl ? <button type="button" className="h-full w-full focus-visible:outline-2 focus-visible:outline-ring" onClick={() => setOpen(true)} aria-label="View Unit Photo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl} alt="Unit" className="h-full w-full object-contain" />
      </button> : <div className="flex h-full items-center justify-center"><CarFront className="h-8 w-8 text-muted-foreground/50" /></div>}
      {disabled && <div className="absolute inset-0 flex items-center justify-center bg-muted/70"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
    </div>
    {canEdit && <div className="flex flex-wrap gap-2">
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true" disabled={disabled} onChange={picked} />
      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => fileInputRef.current?.click()}><ImageUp className="h-3.5 w-3.5" />Upload Image</Button>
      {photoUrl && <Button type="button" size="sm" variant="ghost" onClick={onRemove} disabled={disabled}><Trash2 className="h-3.5 w-3.5" />Remove</Button>}
    </div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Dialog open={open && !!photoUrl} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-5xl">
        <DialogHeader><DialogTitle>Unit Photo</DialogTitle><DialogDescription className="sr-only">Full unit photograph</DialogDescription></DialogHeader>
        <div className="flex min-h-0 items-center justify-center overflow-hidden rounded-md bg-neutral-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {photoUrl && <img src={photoUrl} alt="Full unit photograph" className="max-h-[calc(100dvh-9rem)] max-w-full object-contain" />}
        </div>
      </DialogContent>
    </Dialog>
  </div>
}
