/**
 * A labelled read-only value in a definition list. Lives here rather than
 * beside one page because the franchise's details are shown both on the
 * application and on the franchise record.
 */
export function InfoItem({
  label,
  value,
  icon,
  mono,
  className,
}: {
  label: string
  value?: string | null
  icon?: React.ReactNode
  mono?: boolean
  className?: string
}) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted-foreground mb-1">{label}</dt>
      <dd className="flex items-center gap-1.5 text-sm">
        {icon}
        <span className={mono ? "font-mono" : undefined}>{value || "—"}</span>
      </dd>
    </div>
  )
}
