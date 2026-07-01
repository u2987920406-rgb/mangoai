// Starter react-leaflet — carte interactive plein écran (marqueurs + popups + tracé)
// Décris tes lieux dans le chat : Mango pose les bons marqueurs, l'itinéraire, le style.
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
// Fix des icônes Leaflet sous bundler (sinon le marqueur par défaut est cassé) :
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

const lieux = [
  { nom: 'Tour Eiffel', pos: [48.8584, 2.2945], info: 'Le départ du parcours.' },
  { nom: 'Louvre', pos: [48.8606, 2.3376], info: 'Arrêt musée.' },
  { nom: 'Notre-Dame', pos: [48.8530, 2.3499], info: 'Point d’arrivée.' },
];
const trace = lieux.map((l) => l.pos);

export default function App() {
  return (
    <div className="relative h-screen w-screen">
      <div className="pointer-events-none absolute left-4 top-4 z-[1000] rounded-xl bg-white/90 px-4 py-2 shadow-lg backdrop-blur">
        <h1 className="text-sm font-bold text-neutral-800">Mango · Carte</h1>
        <p className="text-xs text-neutral-500">{lieux.length} points · clique un marqueur</p>
      </div>
      <MapContainer center={[48.8566, 2.3322]} zoom={13} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline positions={trace} pathOptions={{ color: '#6366f1', weight: 4, opacity: 0.7 }} />
        {lieux.map((l) => (
          <Marker key={l.nom} position={l.pos}>
            <Popup>
              <strong>{l.nom}</strong><br />{l.info}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
