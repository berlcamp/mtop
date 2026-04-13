"use client"

import { useState } from "react"
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
import { Loader2, AlertCircle } from "lucide-react"
import {
  applicationSchema,
  type ApplicationFormValues,
} from "@/lib/schemas/mtop"
import { createApplication } from "@/lib/actions/applications"

export default function NewApplicationPage() {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ApplicationFormValues>({
    resolver: zodResolver(applicationSchema),
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

  async function onSubmit(data: ApplicationFormValues) {
    setServerError(null)
    const result = await createApplication(data)

    if (result.error) {
      setServerError(result.error)
      return
    }

    router.push(`/dashboard/applications/${result.data?.id}`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Application"
        subtitle="Create a new MTOP renewal application"
      />

      {serverError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Applicant Information */}
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

        {/* Tricycle Details */}
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

        {/* Route & Schedule */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Route & Schedule</CardTitle>
            <CardDescription>
              Assigned route and renewal due date
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="route">Route</Label>
                <Input
                  id="route"
                  placeholder="e.g., Poblacion - Barangay San Antonio"
                  {...register("route")}
                  aria-invalid={!!errors.route}
                />
                {errors.route && (
                  <p className="text-xs text-destructive">
                    {errors.route.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="due_date">Due Date (Optional)</Label>
                <Input
                  id="due_date"
                  type="date"
                  {...register("due_date")}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Application
          </Button>
        </div>
      </form>
    </div>
  )
}
