"use client"

import { useState, useTransition, useRef } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ClipboardList, Paperclip, ExternalLink, X, Loader2 } from "lucide-react"
import {
  verifyRequirement,
  updateRequirementRemarks,
  updateRequirementFileUrl,
} from "@/lib/actions/requirements"
import { createClient } from "@/lib/supabase/client"
import { REQUIREMENT_KINDS, groupByKind, isBlocking } from "@/lib/requirements"
import type { ApplicationRequirementWithDetail } from "@/types/database"

interface RequirementChecklistProps {
  requirements: ApplicationRequirementWithDetail[]
  applicationId: string
  transactionName?: string
  canVerify: boolean
}

export function RequirementChecklist({
  requirements,
  applicationId,
  transactionName,
  canVerify,
}: RequirementChecklistProps) {
  // Progress counts only what actually blocks the application. Conditional
  // items ("if applicable") are shown but must never make the bar look stuck.
  const blocking = requirements.filter(isBlocking)
  const blockingDone = blocking.filter((r) => r.is_verified).length
  const optionalDone = requirements.filter(
    (r) => !isBlocking(r) && r.is_verified
  ).length

  const groups = groupByKind(requirements)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          Requirements
        </CardTitle>
        <CardDescription>
          <span className="font-medium">
            {blockingDone}/{blocking.length}
          </span>{" "}
          required items cleared
          {optionalDone > 0 && (
            <> · {optionalDone} optional item(s) also cleared</>
          )}
          {transactionName && <> · {transactionName}</>}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-5">
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{
                width: `${blocking.length > 0 ? (blockingDone / blocking.length) * 100 : 100}%`,
              }}
            />
          </div>
        </div>

        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.kind} className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">
                  {REQUIREMENT_KINDS[group.kind].label}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {REQUIREMENT_KINDS[group.kind].hint}
                </p>
              </div>

              <div className="space-y-3">
                {group.items.map((item) => (
                  <RequirementRow
                    key={item.id}
                    item={item}
                    applicationId={applicationId}
                    canVerify={canVerify}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function RequirementRow({
  item,
  applicationId,
  canVerify,
}: {
  item: ApplicationRequirementWithDetail
  applicationId: string
  canVerify: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [remarksValue, setRemarksValue] = useState(item.remarks ?? "")
  const [remarksTimeout, setRemarksTimeout] = useState<NodeJS.Timeout | null>(
    null
  )
  const [fileUrl, setFileUrl] = useState<string | null>(item.file_url)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const acceptsFile = REQUIREMENT_KINDS[item.kind].acceptsFile

  function handleVerify(checked: boolean) {
    startTransition(async () => {
      await verifyRequirement(item.id, applicationId, checked)
    })
  }

  function handleRemarksChange(value: string) {
    setRemarksValue(value)

    // Debounce save
    if (remarksTimeout) clearTimeout(remarksTimeout)
    const timeout = setTimeout(() => {
      startTransition(async () => {
        await updateRequirementRemarks(item.id, applicationId, value)
      })
    }, 800)
    setRemarksTimeout(timeout)
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadError(null)

    try {
      const supabase = createClient()
      const ext = file.name.split(".").pop()
      const path = `${applicationId}/${item.id}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from("mtop-documents")
        .upload(path, file, { upsert: true })

      if (uploadErr) {
        setUploadError(uploadErr.message)
        return
      }

      const { data } = supabase.storage
        .from("mtop-documents")
        .getPublicUrl(path)

      const publicUrl = data.publicUrl

      const result = await updateRequirementFileUrl(
        item.id,
        applicationId,
        publicUrl
      )

      if (result.error) {
        setUploadError(result.error)
        return
      }

      setFileUrl(publicUrl)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleRemoveFile() {
    setUploading(true)
    setUploadError(null)

    try {
      const result = await updateRequirementFileUrl(item.id, applicationId, null)
      if (result.error) {
        setUploadError(result.error)
        return
      }
      setFileUrl(null)
    } finally {
      setUploading(false)
    }
  }

  // The per-transaction note is the city's own wording for this item on this
  // transaction ("Both the new and the old unit"), so it wins over the
  // catalogue's generic description.
  const helper = item.note || item.description

  return (
    <div className="rounded-lg border px-4 py-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {canVerify ? (
            <>
              <Checkbox
                id={item.id}
                className="mt-0.5"
                checked={item.is_verified}
                onCheckedChange={(checked) => handleVerify(checked as boolean)}
                disabled={isPending}
              />
              <div className="min-w-0">
                <Label
                  htmlFor={item.id}
                  className="text-sm cursor-pointer leading-snug"
                >
                  {item.label}
                </Label>
                {helper && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {helper}
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="min-w-0">
              <span className="text-sm leading-snug">{item.label}</span>
              {helper && (
                <p className="text-xs text-muted-foreground mt-0.5">{helper}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {item.is_conditional && (
            <Badge variant="outline" className="text-xs">
              If applicable
            </Badge>
          )}
          <Badge
            variant={item.is_verified ? "default" : "secondary"}
            className="text-xs"
          >
            {item.is_verified ? "Cleared" : "Pending"}
          </Badge>
        </div>
      </div>

      {/* File attachment row. Only kinds that are evidenced by a file get one —
          a personal appearance or a surrendered plate is confirmed, not uploaded.
          Add/remove is gated on canVerify; everyone with view access can still
          open an already-attached file. */}
      {acceptsFile && (fileUrl || canVerify) && (
        <div className="flex items-center gap-2 pl-7">
          {fileUrl && (
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              View file
            </a>
          )}
          {canVerify && fileUrl && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-destructive"
              onClick={handleRemoveFile}
              disabled={uploading}
              title="Remove file"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
          {canVerify && !fileUrl && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={handleFileChange}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Paperclip className="mr-1 h-3 w-3" />
                )}
                {uploading ? "Uploading…" : "Attach file"}
              </Button>
            </>
          )}
        </div>
      )}

      {canVerify && uploadError && (
        <p className="text-xs text-destructive pl-7">{uploadError}</p>
      )}

      {canVerify && (
        <Input
          placeholder="Remarks (optional)"
          value={remarksValue}
          onChange={(e) => handleRemarksChange(e.target.value)}
          className="text-xs h-7"
          disabled={isPending}
        />
      )}

      {!canVerify && item.remarks && (
        <p className="text-xs text-muted-foreground pl-7">{item.remarks}</p>
      )}
    </div>
  )
}
