import { OpenApiIcon, SwaggerIcon } from '@/assets/svgs'
import type { LegacyAPIGroupView } from '@/features/services/api/api-adapters'
import { formatDistanceToNow } from 'date-fns'
import { Network, Share2 } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

const PROTOCOL_COLORS: Record<
  string,
  { border: string; badge: string; text: string }
> = {
  rest: {
    border: '#2563EB',
    badge: 'rgba(37,99,235,0.15)',
    text: '#93B4FF',
  },
  graphql: {
    border: '#DB2777',
    badge: 'rgba(219,39,119,0.15)',
    text: '#F9A8D4',
  },
  grpc: {
    border: '#0D9488',
    badge: 'rgba(13,148,136,0.15)',
    text: '#5EEAD4',
  },
  serverless: {
    border: '#EA580C',
    badge: 'rgba(234,88,12,0.15)',
    text: '#FDBA74',
  },
}
const DEFAULT_PROTOCOL_COLOR = {
  border: '#94A3B8',
  badge: 'rgba(148,163,184,0.15)',
  text: '#CBD5E1',
}

function getProtocolColor(protocol: string | null) {
  if (!protocol) return DEFAULT_PROTOCOL_COLOR
  return PROTOCOL_COLORS[protocol.toLowerCase()] ?? DEFAULT_PROTOCOL_COLOR
}

function getProtocolLabel(protocol: string) {
  if (protocol === 'grpc') return 'gRPC'
  if (protocol === 'graphql') return 'GraphQL'
  if (protocol === 'rest') return 'REST'
  if (protocol === 'serverless') return 'Serverless'
  return protocol.toUpperCase()
}

interface ServiceApiEndpointGroupCardProps {
  group: LegacyAPIGroupView
}

export function ServiceApiEndpointGroupCard({
  group,
}: ServiceApiEndpointGroupCardProps) {
  const { serviceId } = useParams() as { serviceId: string }
  const navigate = useNavigate()

  const availableFiles = useMemo(() => {
    const files: { icon: React.ReactNode; label: string }[] = []

    if (group.openApiSpecFileId) {
      files.push({
        icon: <OpenApiIcon className="h-3 w-3" />,
        label: 'OpenAPI',
      })
    }
    if (group.swaggerSpecFileId) {
      files.push({
        icon: <SwaggerIcon className="h-3 w-3" />,
        label: 'Swagger',
      })
    }
    if (group.graphqlSpecFileIds && group.graphqlSpecFileIds.length > 0) {
      files.push({
        icon: <Share2 className="h-3 w-3" />,
        label: `GraphQL${group.graphqlSpecFileIds.length > 1 ? ` (${group.graphqlSpecFileIds.length})` : ''}`,
      })
    }
    if (group.grpcSpecFileIds && group.grpcSpecFileIds.length > 0) {
      files.push({
        icon: <Network className="h-3 w-3" />,
        label: `gRPC${group.grpcSpecFileIds.length > 1 ? ` (${group.grpcSpecFileIds.length})` : ''}`,
      })
    }

    return files
  }, [group])

  const protocol = useMemo(() => {
    if (group.protocol) {
      return group.protocol.toLowerCase()
    }
    if (group.graphqlSpecFileIds && group.graphqlSpecFileIds.length > 0)
      return 'graphql'
    if (group.grpcSpecFileIds && group.grpcSpecFileIds.length > 0) return 'grpc'
    if (group.openApiSpecFileId || group.swaggerSpecFileId) return 'rest'
    return null
  }, [group])

  function handleCardClick() {
    void navigate(`/services/${serviceId}/apis/${group.serviceApiGroupId}`)
  }

  const colors = getProtocolColor(protocol)

  return (
    <div className="group relative">
      <div
        onClick={handleCardClick}
        key={group.serviceApiGroupId}
        className="h-full cursor-pointer overflow-hidden rounded-[16px] bg-[#141925] ring-1 ring-[#2A3242] transition-all duration-200 hover:-translate-y-px hover:shadow-[0_0_0_2px_rgba(37,99,235,0.2),0_6px_20px_rgba(0,0,0,0.08)] hover:ring-[#015AEB]"
      >
        <div className="p-5">
          <div className="mb-3 flex items-start justify-between gap-2 pr-6">
            <h3 className="text-[14px] leading-snug font-semibold tracking-tight text-[#F4F7FC]">
              {group.name ?? group.version ?? '—'}
            </h3>
            {protocol && (
              <span
                className="mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold"
                style={{ backgroundColor: colors.badge, color: colors.text }}
              >
                {getProtocolLabel(protocol)}
              </span>
            )}
          </div>

          {group.updatedAt && (
            <p className="text-[12px] text-[#828DA3]">
              Updated{' '}
              {formatDistanceToNow(new Date(group.updatedAt), {
                addSuffix: true,
              })}
            </p>
          )}

          {availableFiles.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-[#2A3242] pt-3">
              {availableFiles.map((file) => (
                <div
                  key={file.label}
                  className="flex items-center gap-1 rounded-md bg-[#1E2533] px-2 py-1 ring-1 ring-[#2A3242]"
                >
                  {file.icon}
                  <span className="text-[11px] font-medium text-[#828DA3]">
                    {file.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {!protocol && availableFiles.length === 0 && (
            <p className="mt-4 text-[12px] text-[#586378]">
              No files configured
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
