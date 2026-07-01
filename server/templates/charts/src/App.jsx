// Starter Recharts — dashboard analytique (KPI + courbe + barres + camembert)
// Décris tes données dans le chat : Mango branche les vraies séries et adapte les graphes.
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

const revenue = [
  { mois: 'Jan', valeur: 4200 }, { mois: 'Fév', valeur: 5100 }, { mois: 'Mar', valeur: 4800 },
  { mois: 'Avr', valeur: 6300 }, { mois: 'Mai', valeur: 7200 }, { mois: 'Juin', valeur: 8100 },
];
const canaux = [
  { nom: 'Direct', visites: 1840 }, { nom: 'Recherche', visites: 3210 },
  { nom: 'Social', visites: 1290 }, { nom: 'Email', visites: 940 },
];
const repartition = [
  { nom: 'Pro', valeur: 54 }, { nom: 'Particulier', valeur: 31 }, { nom: 'Étudiant', valeur: 15 },
];
const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899'];
const kpis = [
  { label: 'Revenu', valeur: '35,7 k€', delta: '+12,4 %' },
  { label: 'Utilisateurs actifs', valeur: '8 204', delta: '+5,1 %' },
  { label: 'Taux de conversion', valeur: '3,9 %', delta: '+0,6 pt' },
  { label: 'Panier moyen', valeur: '48,30 €', delta: '−1,2 %' },
];

function Card({ children, className = '' }) {
  return <div className={`rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

export default function App() {
  return (
    <div className="min-h-screen bg-neutral-50 p-6 text-neutral-800">
      <header className="mx-auto mb-6 flex max-w-6xl items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tableau de bord</h1>
          <p className="text-sm text-neutral-500">Vue d’ensemble — 6 derniers mois</p>
        </div>
        <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-600">Mango · Charts</span>
      </header>

      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <p className="text-sm text-neutral-500">{k.label}</p>
            <p className="mt-1 text-2xl font-bold">{k.valeur}</p>
            <p className={`mt-1 text-sm font-medium ${k.delta.startsWith('−') ? 'text-rose-500' : 'text-emerald-600'}`}>{k.delta}</p>
          </Card>
        ))}
      </div>

      <div className="mx-auto mt-4 grid max-w-6xl gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-3 font-semibold">Revenu mensuel</h2>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={revenue} margin={{ left: -16, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="mois" stroke="#999" fontSize={12} />
              <YAxis stroke="#999" fontSize={12} />
              <Tooltip />
              <Area type="monotone" dataKey="valeur" stroke="#6366f1" strokeWidth={2} fill="url(#g)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Répartition clients</h2>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={repartition} dataKey="valeur" nameKey="nom" innerRadius={50} outerRadius={85} paddingAngle={3}>
                {repartition.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="lg:col-span-3">
          <h2 className="mb-3 font-semibold">Visites par canal</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={canaux} margin={{ left: -16, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="nom" stroke="#999" fontSize={12} />
              <YAxis stroke="#999" fontSize={12} />
              <Tooltip />
              <Bar dataKey="visites" radius={[6, 6, 0, 0]} fill="#22c55e" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
