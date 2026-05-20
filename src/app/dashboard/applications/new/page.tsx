"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertCircle, Search, Plus, ArrowLeft } from "lucide-react"
import {
  newFranchiseApplicationSchema,
  renewalApplicationSchema,
  type NewFranchiseApplicationFormValues,
  type RenewalApplicationFormValues,
} from "@/lib/schemas/mtop"
import {
  createNewFranchiseApplication,
  createRenewalApplication,
  searchFranchises,
} from "@/lib/actions/applications"
import type { MtopFranchise } from "@/types/database"

type FranchiseSearchHit = MtopFranchise & {
  has_active_application?: boolean
}

type Mode =
  | { kind: "search" }
  | { kind: "renewal"; franchise: FranchiseSearchHit }
  | { kind: "new" }

export default function NewApplicationPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>({ kind: "search" })

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Application"
        subtitle={
          mode.kind === "renewal"
            ? `Renew ${mode.franchise.mtop_number ?? "franchise"}`
            : mode.kind === "new"
            ? "Register a new franchise"
            : "Look up an existing franchise or register a new one"
        }
      />

      {mode.kind === "search" && (
        <FranchiseLookup
          onSelectFranchise={(franchise) =>
            setMode({ kind: "renewal", franchise })
          }
          onCreateNew={() => setMode({ kind: "new" })}
        />
      )}

      {mode.kind === "renewal" && (
        <RenewalForm
          franchise={mode.franchise}
          onBack={() => setMode({ kind: "search" })}
          onSubmitted={(applicationId) =>
            router.push(`/dashboard/applications/${applicationId}`)
          }
        />
      )}

      {mode.kind === "new" && (
        <NewFranchiseForm
          onBack={() => setMode({ kind: "search" })}
          onSubmitted={(applicationId) =>
            router.push(`/dashboard/applications/${applicationId}`)
          }
        />
      )}
    </div>
  )
}

function FranchiseLookup({
  onSelectFranchise,
  onCreateNew,
}: {
  onSelectFranchise: (f: FranchiseSearchHit) => void
  onCreateNew: () => void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<FranchiseSearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const trimmed = query.trim()

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!trimmed) return
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      const res = await searchFranchises(trimmed)
      setLoading(false)
      setSearched(true)
      if (!res.error && res.data) {
        setResults(res.data as FranchiseSearchHit[])
      }
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [trimmed])

  function handleQueryChange(value: string) {
    setQuery(value)
    if (!value.trim()) {
      setResults([])
      setSearched(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Find Franchise</CardTitle>
        <CardDescription>
          Search by MTOP number or owner name to renew. If the franchise isn&apos;t
          on file yet, register a new one.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="MTOP number or owner name…"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        {loading && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
          </p>
        )}

        {!loading && searched && results.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No franchises matched &ldquo;{query}&rdquo;.
          </p>
        )}

        {!loading && results.length > 0 && (
          <ul className="divide-y divide-border/50 rounded-lg border border-border/60">
            {results.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-sm font-semibold">
                      {f.mtop_number ?? "— (not yet granted)"}
                    </span>
                    <span className="font-medium">{f.applicant_name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Plate {f.plate_number ?? "—"} · Body{" "}
                    {f.tricycle_body_number ?? "—"} ·{" "}
                    {f.granted_until
                      ? `Expires ${f.granted_until}`
                      : "Never granted"}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={f.has_active_application || !f.granted_until}
                  onClick={() => onSelectFranchise(f)}
                  title={
                    f.has_active_application
                      ? "An application is already in flight for this franchise"
                      : !f.granted_until
                      ? "Franchise has not been granted yet"
                      : ""
                  }
                >
                  Renew
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="pt-2 border-t border-border/60">
          <Button
            type="button"
            variant="default"
            onClick={onCreateNew}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Register New Franchise
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function RenewalForm({
  franchise,
  onBack,
  onSubmitted,
}: {
  franchise: FranchiseSearchHit
  onBack: () => void
  onSubmitted: (applicationId: string) => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RenewalApplicationFormValues>({
    resolver: zodResolver(renewalApplicationSchema),
    defaultValues: {
      franchise_id: franchise.id,
      applicant_address: franchise.applicant_address ?? "",
      contact_number: franchise.contact_number ?? "",
      tricycle_body_number: franchise.tricycle_body_number ?? "",
      plate_number: franchise.plate_number ?? "",
      route: franchise.route ?? "",
      due_date: "",
    },
  })

  async function onSubmit(data: RenewalApplicationFormValues) {
    setServerError(null)
    const result = await createRenewalApplication(data)
    if (result.error || !result.data) {
      setServerError(result.error ?? "Failed to create renewal")
      return
    }
    onSubmitted(result.data.id)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="gap-1.5 -ml-2"
      >
        <ArrowLeft className="h-4 w-4" /> Back to search
      </Button>

      {serverError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      {/* Locked identity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Franchise Identity (locked)</CardTitle>
          <CardDescription>
            These fields stay the same across renewals. To change motor or
            chassis, register a new franchise.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 text-sm">
            <ReadOnlyField label="MTOP Number" value={franchise.mtop_number} />
            <ReadOnlyField label="Owner" value={franchise.applicant_name} />
            <ReadOnlyField
              label="Motor Number"
              value={franchise.motor_number}
              mono
            />
            <ReadOnlyField
              label="Chassis Number"
              value={franchise.chassis_number}
              mono
            />
          </dl>
        </CardContent>
      </Card>

      {/* Editable fields */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Update at Renewal</CardTitle>
          <CardDescription>
            Address, contact, plate, body number, and route can change at
            renewal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="applicant_address">Address</Label>
            <Input
              id="applicant_address"
              {...register("applicant_address")}
              aria-invalid={!!errors.applicant_address}
            />
            {errors.applicant_address && (
              <p className="text-xs text-destructive">
                {errors.applicant_address.message}
              </p>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contact_number">Contact Number</Label>
              <Input
                id="contact_number"
                {...register("contact_number")}
                aria-invalid={!!errors.contact_number}
              />
              {errors.contact_number && (
                <p className="text-xs text-destructive">
                  {errors.contact_number.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="plate_number">Plate Number</Label>
              <Input id="plate_number" {...register("plate_number")} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tricycle_body_number">Body Number</Label>
              <Input
                id="tricycle_body_number"
                {...register("tricycle_body_number")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="route">Route</Label>
              <Input id="route" {...register("route")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="due_date">Due Date (optional)</Label>
            <Input id="due_date" type="date" {...register("due_date")} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          File Renewal
        </Button>
      </div>
    </form>
  )
}

function NewFranchiseForm({
  onBack,
  onSubmitted,
}: {
  onBack: () => void
  onSubmitted: (applicationId: string) => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewFranchiseApplicationFormValues>({
    resolver: zodResolver(newFranchiseApplicationSchema),
    defaultValues: {
      applicant_name: "",
      applicant_address: "",
      contact_number: "",
      tricycle_body_number: "",
      plate_number: "",
      motor_number: "",
      chassis_number: "",
      route: "",
      due_date: "",
    },
  })

  async function onSubmit(data: NewFranchiseApplicationFormValues) {
    setServerError(null)
    const result = await createNewFranchiseApplication(data)
    if (result.error || !result.data) {
      setServerError(result.error ?? "Failed to create application")
      return
    }
    onSubmitted(result.data.id)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="gap-1.5 -ml-2"
      >
        <ArrowLeft className="h-4 w-4" /> Back to search
      </Button>

      {serverError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Applicant Information</CardTitle>
          <CardDescription>
            Personal details of the tricycle operator
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="applicant_name">Full Name</Label>
              <Input
                id="applicant_name"
                placeholder="Juan Dela Cruz"
                {...register("applicant_name")}
                aria-invalid={!!errors.applicant_name}
              />
              {errors.applicant_name && (
                <p className="text-xs text-destructive">
                  {errors.applicant_name.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact_number">Contact Number</Label>
              <Input
                id="contact_number"
                placeholder="09XX-XXX-XXXX"
                {...register("contact_number")}
                aria-invalid={!!errors.contact_number}
              />
              {errors.contact_number && (
                <p className="text-xs text-destructive">
                  {errors.contact_number.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="applicant_address">Address</Label>
            <Input
              id="applicant_address"
              placeholder="Complete address"
              {...register("applicant_address")}
              aria-invalid={!!errors.applicant_address}
            />
            {errors.applicant_address && (
              <p className="text-xs text-destructive">
                {errors.applicant_address.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tricycle Details</CardTitle>
          <CardDescription>
            Vehicle registration and identification
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tricycle_body_number">Body Number</Label>
              <Input
                id="tricycle_body_number"
                placeholder="e.g., 1234"
                {...register("tricycle_body_number")}
                aria-invalid={!!errors.tricycle_body_number}
              />
              {errors.tricycle_body_number && (
                <p className="text-xs text-destructive">
                  {errors.tricycle_body_number.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="plate_number">Plate Number</Label>
              <Input
                id="plate_number"
                placeholder="e.g., AB-1234"
                {...register("plate_number")}
                aria-invalid={!!errors.plate_number}
              />
              {errors.plate_number && (
                <p className="text-xs text-destructive">
                  {errors.plate_number.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="motor_number">Motor Number</Label>
              <Input
                id="motor_number"
                placeholder="Motor/Engine number"
                {...register("motor_number")}
                aria-invalid={!!errors.motor_number}
              />
              {errors.motor_number && (
                <p className="text-xs text-destructive">
                  {errors.motor_number.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="chassis_number">Chassis Number</Label>
              <Input
                id="chassis_number"
                placeholder="Chassis/Frame number"
                {...register("chassis_number")}
                aria-invalid={!!errors.chassis_number}
              />
              {errors.chassis_number && (
                <p className="text-xs text-destructive">
                  {errors.chassis_number.message}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Route</CardTitle>
          <CardDescription>Assigned route</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="route">Route</Label>
            <Input
              id="route"
              placeholder="e.g., Poblacion - Barangay San Antonio"
              {...register("route")}
              aria-invalid={!!errors.route}
            />
            {errors.route && (
              <p className="text-xs text-destructive">{errors.route.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit Application
        </Button>
      </div>
    </form>
  )
}

function ReadOnlyField({
  label,
  value,
  mono,
}: {
  label: string
  value?: string | null
  mono?: boolean
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground mb-1">{label}</dt>
      <dd className={mono ? "font-mono" : "font-medium"}>{value ?? "—"}</dd>
    </div>
  )
}
