import { useCart } from "./hooks/useCart.js";
import { Navbar, Hero } from "./components/Hero.jsx";
import { Configurator } from "./components/Configurator.jsx";
import { Gallery } from "./components/Gallery.jsx";
import { Anatomy } from "./components/Anatomy.jsx";
import { Atelier, Footer } from "./components/Atelier.jsx";
import { CartDrawer } from "./components/CartDrawer.jsx";

export default function App() {
  const {
    items,
    isOpen,
    openCart,
    closeCart,
    addItem,
    removeItem,
    updateQty,
    clearCart,
    count,
  } = useCart();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar cartCount={count} onCartClick={openCart} />

      <main>
        <Hero />
        <Configurator onAddToCart={addItem} />
        <Gallery />
        <Anatomy />
        <Atelier />
      </main>

      <Footer />

      <CartDrawer
        isOpen={isOpen}
        onClose={closeCart}
        items={items}
        updateQty={updateQty}
        removeItem={removeItem}
        clearCart={clearCart}
      />
    </div>
  );
}