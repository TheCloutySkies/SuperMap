import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
} from 'lucide-react'
import { wmoKind } from './weatherWmo'

const ICONS = {
  clear: Sun,
  partly: CloudSun,
  overcast: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
}

export default function WmoIcon({ code, size = 28, strokeWidth = 1.7, className }) {
  const Kind = ICONS[wmoKind(code)] || Cloud
  return <Kind size={size} strokeWidth={strokeWidth} className={className} aria-hidden />
}
