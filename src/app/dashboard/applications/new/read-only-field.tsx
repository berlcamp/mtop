export function ReadOnlyField({
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
