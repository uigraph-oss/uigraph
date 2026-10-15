import { SiKubernetes } from 'react-icons/si'
import { AWSIcon, AzureIcon, GoogleCloudIcon } from '../components/icons/brands'

const PROVIDER_BRAND_ICONS: { [provider: string]: React.ReactNode } = {
  aws: <AWSIcon />,
  azure: <AzureIcon />,
  gcp: <GoogleCloudIcon />,
  kubernetes: <SiKubernetes color="#326CE5" />,
}

export function getProviderBrandIcon(provider: string) {
  return PROVIDER_BRAND_ICONS[provider.toLowerCase()] || '☁️'
}
