interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        <h1 className="text-xl font-bold tracking-tight text-foreground leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="break-words text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 [&>div]:min-w-0 [&>div]:max-w-full [&>div]:flex-wrap xl:w-auto xl:shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}
