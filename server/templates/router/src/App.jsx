// Starter react-router-dom — squelette multi-pages (nav persistante + routes + 404)
// Décris tes pages dans le chat : Mango ajoute des routes, garde le layout et la nav.
import { BrowserRouter, Routes, Route, NavLink, Link } from 'react-router-dom';

function Layout({ children }) {
  const link = ({ isActive }) =>
    `px-3 py-2 text-sm font-medium rounded-lg transition ${isActive ? 'bg-indigo-600 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`;
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-800">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur">
        <nav className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-3">
          <Link to="/" className="mr-auto text-lg font-bold tracking-tight">Mango<span className="text-indigo-600">App</span></Link>
          <NavLink to="/" end className={link}>Accueil</NavLink>
          <NavLink to="/produits" className={link}>Produits</NavLink>
          <NavLink to="/contact" className={link}>Contact</NavLink>
        </nav>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-12">{children}</main>
    </div>
  );
}

const Page = ({ titre, children }) => (
  <section>
    <h1 className="text-3xl font-bold tracking-tight">{titre}</h1>
    <div className="mt-4 text-neutral-600">{children}</div>
  </section>
);

const Home = () => (
  <Page titre="Accueil">
    <p>Squelette multi-pages prêt à l’emploi. La navigation reste en place quand tu changes de page.</p>
    <Link to="/produits" className="mt-6 inline-block rounded-full bg-indigo-600 px-6 py-2.5 font-semibold text-white">
      Voir les produits →
    </Link>
  </Page>
);
const Produits = () => (
  <Page titre="Produits">
    <ul className="grid gap-3 sm:grid-cols-2">
      {['Alpha', 'Bravo', 'Charlie', 'Delta'].map((p) => (
        <li key={p} className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">Produit {p}</h3>
          <p className="mt-1 text-sm text-neutral-500">Description courte du produit {p}.</p>
        </li>
      ))}
    </ul>
  </Page>
);
const Contact = () => (
  <Page titre="Contact">
    <p>Remplace ce bloc par un vrai formulaire (le routage est déjà câblé).</p>
  </Page>
);
const NotFound = () => (
  <Page titre="404 — page introuvable">
    <Link to="/" className="text-indigo-600 underline">Retour à l’accueil</Link>
  </Page>
);

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/produits" element={<Produits />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
