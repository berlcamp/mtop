"use client"

import { useState, useTransition } from "react"
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
import { FileText } from "lucide-react"
import { verifyDocument, updateDocumentRemarks } from "@/lib/actions/documents"

const DOCUMENT_LABELS: Record<string, string> = {
  application_form: "Application Form",
  ctms_clearance: "CTMS Clearance",
  lto_or: "LTO Official Receipt",
  voters_certificate: "Voter's Certificate",
  barangay_certification: "Barangay Certification",
  barangay_endorsement: "Barangay Endorsement",
  ctc: "Community Tax Certificate (CTC)",
  police_clearance: "Police Clearance",
  drivers_license: "Driver's License",
  affidavit_no_franchise: "Affidavit of No Franchise",
}

interface Document {
  id: string
  document_type: string
  is_verified: boolean
  verified_by: string | null
  verified_at: string | null
  remarks: string | null
  file_url: string | null
}

interface DocumentChecklistProps {
  documents: Document[]
  applicationId: string
  canVerify: boolean
}

export function DocumentChecklist({
  documents,
  applicationId,
  canVerify,
}: DocumentChecklistProps) {
  const verifiedCount = documents.filter((d) => d.is_verified).length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Document Verification
        </CardTitle>
        <CardDescription>
          <span className="font-medium">
            {verifiedCount}/{documents.length}
          </span>{" "}
          documents verified
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Progress bar */}
        <div className="mb-4">
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{
                width: `${documents.length > 0 ? (verifiedCount / documents.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        <div className="space-y-3">
          {documents.map((doc) => (
            <DocumentRow
              key={doc.id}
              document={doc}
              applicationId={applicationId}
              canVerify={canVerify}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function DocumentRow({
  document,
  applicationId,
  canVerify,
}: {
  document: Document
  applicationId: string
  canVerify: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [remarksValue, setRemarksValue] = useState(document.remarks ?? "")
  const [remarksTimeout, setRemarksTimeout] = useState<NodeJS.Timeout | null>(
    null
  )

  function handleVerify(checked: boolean) {
    startTransition(async () => {
      await verifyDocument(document.id, applicationId, checked)
    })
  }

  function handleRemarksChange(value: string) {
    setRemarksValue(value)

    // Debounce save
    if (remarksTimeout) clearTimeout(remarksTimeout)
    const timeout = setTimeout(() => {
      startTransition(async () => {
        await updateDocumentRemarks(document.id, applicationId, value)
      })
    }, 800)
    setRemarksTimeout(timeout)
  }

  return (
    <div className="rounded-lg border px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {canVerify ? (
            <>
              <Checkbox
                checked={document.is_verified}
                onCheckedChange={(checked) => handleVerify(checked as boolean)}
                disabled={isPending}
              />
              <Label className="text-sm cursor-pointer">
                {DOCUMENT_LABELS[document.document_type] ??
                  document.document_type}
              </Label>
            </>
          ) : (
            <span className="text-sm">
              {DOCUMENT_LABELS[document.document_type] ??
                document.document_type}
            </span>
          )}
        </div>
        <Badge
          variant={document.is_verified ? "default" : "secondary"}
          className="text-xs"
        >
          {document.is_verified ? "Verified" : "Pending"}
        </Badge>
      </div>

      {/* Remarks input — only show if user can verify */}
      {canVerify && (
        <Input
          placeholder="Remarks (optional)"
          value={remarksValue}
          onChange={(e) => handleRemarksChange(e.target.value)}
          className="text-xs h-7"
          disabled={isPending}
        />
      )}

      {/* Show remarks read-only for non-verifiers */}
      {!canVerify && document.remarks && (
        <p className="text-xs text-muted-foreground pl-7">
          {document.remarks}
        </p>
      )}
    </div>
  )
}
