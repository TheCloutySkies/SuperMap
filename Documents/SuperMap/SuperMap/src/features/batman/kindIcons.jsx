/** Lucide component names for persisted case kinds. No emoji in Batman Mode. */
import {
  AtSign, Building2, FileText, Globe, Image, Link2, MapPin,
  Plane, Radio, Ship, StickyNote, User, Briefcase, Crosshair,
} from 'lucide-react'

export default function KindIcon({ name, size = 14, className }) {
  const Icon = {
    User, Building2, FileText, MapPin, AtSign, StickyNote, Link2,
    Globe, Image, Plane, Ship, Radio, Briefcase, Crosshair,
  }[name] || FileText
  return <Icon size={size} strokeWidth={1.5} className={className} aria-hidden />
}
