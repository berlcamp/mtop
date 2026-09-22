"use client"

import { Check, PlusCircle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

export interface FacetedFilterOption {
  label: string
  value: string
  /** Optional swatch, so a status filter can carry the colour it has in the table. */
  dot?: string
}

/**
 * A multi-select filter in a popover, in the shape the HRIS tables use: a
 * dashed trigger that names the column, then carries the chosen values as
 * badges once anything is picked.
 *
 * It holds no state of its own — the caller owns the selection, which on the
 * applications page lives in the URL so a filtered view can be linked and
 * reloaded. The lists it filters (seven statuses, seven transactions) are
 * short enough that a search box inside the popover would only be in the way.
 */
export function FacetedFilter({
  title,
  options,
  selected,
  onChange,
}: {
  title: string
  options: FacetedFilterOption[]
  selected: string[]
  onChange: (values: string[]) => void
}) {
  const selectedValues = new Set(selected)

  function toggle(value: string) {
    const next = new Set(selectedValues)
    if (next.has(value)) {
      next.delete(value)
    } else {
      next.add(value)
    }
    // Emit in the options' own order, so the URL doesn't reshuffle with clicks.
    onChange(options.filter((o) => next.has(o.value)).map((o) => o.value))
  }

  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" className="border-dashed" />}
      >
        <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
        {title}
        {selectedValues.size > 0 && (
          <>
            <Separator orientation="vertical" className="mx-1 h-4" />
            <Badge
              variant="secondary"
              className="rounded-sm px-1 font-normal lg:hidden"
            >
              {selectedValues.size}
            </Badge>
            <div className="hidden gap-1 lg:flex">
              {selectedValues.size > 2 ? (
                <Badge
                  variant="secondary"
                  className="rounded-sm px-1 font-normal"
                >
                  {selectedValues.size} selected
                </Badge>
              ) : (
                options
                  .filter((option) => selectedValues.has(option.value))
                  .map((option) => (
                    <Badge
                      key={option.value}
                      variant="secondary"
                      className="rounded-sm px-1 font-normal"
                    >
                      {option.label}
                    </Badge>
                  ))
              )}
            </div>
          </>
        )}
      </PopoverTrigger>

      <PopoverContent align="start" className="w-56 gap-0 p-1">
        {options.length === 0 && (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">
            No options yet…
          </p>
        )}
        <div className="flex flex-col">
          {options.map((option) => {
            const isSelected = selectedValues.has(option.value)
            return (
              <button
                key={option.value}
                type="button"
                role="checkbox"
                aria-checked={isSelected}
                onClick={() => toggle(option.value)}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-sm border border-primary",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "opacity-50 [&_svg]:invisible"
                  )}
                >
                  <Check className="size-3" />
                </span>
                {option.dot && (
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      option.dot
                    )}
                  />
                )}
                <span className="truncate">{option.label}</span>
              </button>
            )
          })}
        </div>

        {selectedValues.size > 0 && (
          <>
            <Separator className="my-1" />
            <button
              type="button"
              onClick={() => onChange([])}
              className="rounded-md px-2 py-1.5 text-center text-sm outline-none hover:bg-muted focus-visible:bg-muted"
            >
              Clear filter
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
