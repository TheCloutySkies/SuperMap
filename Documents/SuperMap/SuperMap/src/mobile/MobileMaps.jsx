import CommunityMapView from '../components/CommunityMapView'

/** The map is the screen; its controls stay in the map's own corner. */
export default function MobileMaps() {
  return (
    <div className="mob-map">
      <CommunityMapView variant="full" />
    </div>
  )
}
