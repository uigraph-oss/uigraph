import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ReactElement } from 'react'

export function UnavailableFeature(props: {
  label: string
  message: string
  children: ReactElement
}) {
  return (
    <Popover>
      <TooltipProvider delayDuration={400}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>{props.children}</PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">{props.message}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent side="right" align="start" className="space-y-3">
        <h3 className="text-sm font-medium">{props.label}</h3>
        <p className="text-paragraph text-sm">{props.message}</p>
      </PopoverContent>
    </Popover>
  )
}
